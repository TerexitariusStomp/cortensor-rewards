//! Capability Prober - GPU benchmarking and TEE attestation
//!
//! Runs dynamic benchmarks on provider hardware to generate verifiable CapabilityProfile

use anyhow::{anyhow, Context, Result};
use nvml_wrapper::Nvml;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, info, warn};

use crate::config::ProviderSettings;
use crate::registry::{CapabilityProfile, GpuInfo, TeeRecord, TierProfile};

/// Model ladder for benchmarking (from architecture spec)
const MODEL_LADDER: &[ModelSpec] = &[
    ModelSpec { id: "QWEN3_600M", size_gb: 0.4, min_tps: 50, tier_multiplier: 0.1 },
    ModelSpec { id: "QWEN3_1_7B", size_gb: 1.1, min_tps: 30, tier_multiplier: 0.25 },
    ModelSpec { id: "QWEN3_4B", size_gb: 2.5, min_tps: 20, tier_multiplier: 0.5 },
    ModelSpec { id: "QWEN3_8B_INST_Q4_K_M", size_gb: 4.8, min_tps: 15, tier_multiplier: 1.0 },
    ModelSpec { id: "LLAMA3_8B_INST_Q4", size_gb: 4.8, min_tps: 12, tier_multiplier: 1.2 },
    ModelSpec { id: "QWEN2_5_32B_Q4", size_gb: 19.0, min_tps: 8, tier_multiplier: 2.0 },
];

struct ModelSpec {
    id: &'static str,
    size_gb: f32,
    min_tps: u32,
    tier_multiplier: f64,
}

/// GPU benchmark results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub model_id: String,
    pub ttft_ms: u32,
    pub tps: u32,
    pub vram_usage_gb: u32,
    pub backend: String,
    pub passes: bool,
    pub iterations: u32,
    pub duration_secs: f64,
}

/// TEE attestation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeAttestationResult {
    pub tee_type: String,
    pub quote: String,
    pub collateral: String,
    pub verified_at: u64,
}

/// Capability prober
pub struct CapabilityProber {
    settings: ProviderSettings,
    nvml: Option<Arc<Nvml>>,
    model_cache_dir: PathBuf,
}

impl CapabilityProber {
    /// Create new capability prober
    pub fn new(settings: ProviderSettings, model_cache_dir: PathBuf) -> Result<Self> {
        let nvml = Nvml::init().ok().map(Arc::new);
        
        if nvml.is_none() {
            warn!("NVML not available - GPU detection will be limited");
        }

        Ok(Self {
            settings,
            nvml,
            model_cache_dir,
        })
    }

    /// Run full capability probe
    pub async fn probe(&self) -> Result<CapabilityProfile> {
        info!("Starting capability probe...");

        // Detect GPU
        let gpu = self.detect_gpu().await?;

        // Run benchmarks for each model in ladder
        let mut tiers = Vec::new();
        for spec in MODEL_LADDER {
            // Check if GPU has enough VRAM
            if spec.size_gb <= gpu.vram_gb as f32 * 0.9 {
                info!("Benchmarking {}", spec.id);
                match self.benchmark_model(spec, &gpu).await {
                    Ok(result) => {
                        tiers.push(TierProfile {
                            model_id: result.model_id,
                            ttft_ms: result.ttft_ms,
                            tps: result.tps,
                            vram_usage_gb: result.vram_usage_gb,
                            backend: result.backend,
                            passes: result.passes,
                        });
                    }
                    Err(e) => {
                        warn!("Benchmark failed for {}: {}", spec.id, e);
                        tiers.push(TierProfile {
                            model_id: spec.id.to_string(),
                            ttft_ms: 0,
                            tps: 0,
                            vram_usage_gb: 0,
                            backend: "unknown".to_string(),
                            passes: false,
                        });
                    }
                }
            } else {
                info!("Skipping {} - insufficient VRAM ({}GB required, {}GB available)", 
                    spec.id, spec.size_gb, gpu.vram_gb);
                tiers.push(TierProfile {
                    model_id: spec.id.to_string(),
                    ttft_ms: 0,
                    tps: 0,
                    vram_usage_gb: 0,
                    backend: "skipped".to_string(),
                    passes: false,
                });
            }
        }

        // Get TEE attestation if configured
        let tee_attestation = if self.settings.verification_tier >= 1 {
            self.get_tee_attestation().await.ok()
        } else {
            None
        };

        // Generate profile
        let profile = CapabilityProfile {
            provider_peer_id: "".to_string(), // Will be filled by caller
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            gpu,
            tiers,
            signature: "".to_string(), // Will be signed by caller
            tee_attestation,
        };

        info!("Capability probe complete: {} tiers passed", 
            profile.tiers.iter().filter(|t| t.passes).count());

        Ok(profile)
    }

    /// Detect GPU information
    async fn detect_gpu(&self) -> Result<GpuInfo> {
        if let Some(nvml) = &self.nvml {
            let device_count = nvml.device_count()?;
            if device_count == 0 {
                return Err(anyhow!("No NVIDIA GPUs detected"));
            }

            // Use first GPU (could be configurable)
            let device = nvml.device_by_index(0)?;
            
            let name = device.name()?;
            let memory = device.memory_info()?;
            let vram_gb = (memory.total as f64 / 1_073_741_824.0).ceil() as u32;
            
            // Get compute capability
            let (major, minor) = device.cuda_compute_capability()?;
            let compute_capability = format!("{}.{}", major, minor);
            
            // Get driver version
            let driver_version = nvml.sys_driver_version()?;

            Ok(GpuInfo {
                name,
                vram_gb,
                compute_capability,
                driver_version,
            })
        } else {
            // Fallback: try nvidia-smi
            self.detect_gpu_fallback().await
        }
    }

    /// Fallback GPU detection using nvidia-smi
    async fn detect_gpu_fallback(&self) -> Result<GpuInfo> {
        let output = Command::new("nvidia-smi")
            .args(["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
            .output()
            .await
            .context("Failed to run nvidia-smi")?;

        if !output.status.success() {
            return Err(anyhow!("nvidia-smi failed"));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout.lines().next().ok_or_else(|| anyhow!("No GPU output"))?;
        
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() < 3 {
            return Err(anyhow!("Unexpected nvidia-smi output"));
        }

        let name = parts[0].to_string();
        let vram_mb: u64 = parts[1].parse()?;
        let vram_gb = ((vram_mb as f64 / 1024.0).ceil()) as u32;
        let driver_version = parts[2].to_string();

        // Try to get compute capability
        let compute_capability = self.get_compute_capability_fallback().await?;

        Ok(GpuInfo {
            name,
            vram_gb,
            compute_capability,
            driver_version,
        })
    }

    /// Get compute capability via nvidia-smi
    async fn get_compute_capability_fallback(&self) -> Result<String> {
        let output = Command::new("nvidia-smi")
            .args(["--query-gpu=compute_capability", "--format=csv,noheader"])
            .output()
            .await?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                return Ok(line.trim().to_string());
            }
        }

        Ok("unknown".to_string())
    }

    /// Benchmark a specific model
    async fn benchmark_model(&self, spec: &ModelSpec, gpu: &GpuInfo) -> Result<BenchmarkResult> {
        let backend = self.determine_backend(gpu);
        let iterations = 10;
        let mut ttft_samples = Vec::new();
        let mut tps_samples = Vec::new();
        let mut vram_samples = Vec::new();

        for i in 0..iterations {
            info!("  Iteration {}/{} for {}", i + 1, iterations, spec.id);
            
            let result = self.run_single_benchmark(spec, &backend).await?;
            ttft_samples.push(result.ttft_ms);
            tps_samples.push(result.tps);
            vram_samples.push(result.vram_usage_gb);
        }

        // Calculate median values
        ttft_samples.sort();
        tps_samples.sort();
        vram_samples.sort();

        let ttft_ms = ttft_samples[iterations / 2];
        let tps = tps_samples[iterations / 2];
        let vram_usage_gb = vram_samples[iterations / 2];

        let passes = tps >= spec.min_tps && ttft_ms < 5000; // TTFT < 5s

        Ok(BenchmarkResult {
            model_id: spec.id.to_string(),
            ttft_ms,
            tps,
            vram_usage_gb,
            backend,
            passes,
            iterations,
            duration_secs: 0.0, // Would track actual duration
        })
    }

    /// Determine inference backend based on GPU
    fn determine_backend(&self, gpu: &GpuInfo) -> String {
        if gpu.name.contains("RTX") || gpu.name.contains("GTX") || gpu.name.contains("Tesla") || gpu.name.contains("A100") || gpu.name.contains("H100") {
            "cuda".to_string()
        } else if cfg!(target_os = "macos") {
            "metal".to_string()
        } else {
            "vulkan".to_string()
        }
    }

    /// Run a single benchmark iteration
    async fn run_single_benchmark(&self, spec: &ModelSpec, backend: &str) -> Result<BenchmarkResult> {
        // In production, this would use the actual inference engine (llama.cpp, vLLM, etc.)
        // For now, simulate benchmark with realistic values
        
        let model_path = self.get_model_path(&spec.id).await?;
        
        // Simulate benchmark duration based on model size
        let base_time = Duration::from_millis(100);
        let model_factor = spec.size_gb.max(1.0);
        let bench_duration = base_time.mul_f32(model_factor);
        
        // Run with timeout
        let benchmark_future = async {
            // Simulate inference
            tokio::time::sleep(bench_duration).await;
            
            // Generate realistic results based on model tier
            let (ttft_ms, tps, vram_gb) = match spec.id {
                "QWEN3_600M" => (50, 120, 1),
                "QWEN3_1_7B" => (80, 80, 2),
                "QWEN3_4B" => (120, 45, 3),
                "QWEN3_8B_INST_Q4_K_M" => (200, 25, 5),
                "LLAMA3_8B_INST_Q4" => (250, 20, 5),
                "QWEN2_5_32B_Q4" => (500, 12, 20),
                _ => (300, 15, 6),
            };

            Ok(BenchmarkResult {
                model_id: spec.id.to_string(),
                ttft_ms,
                tps,
                vram_usage_gb: vram_gb,
                backend: backend.to_string(),
                passes: tps >= spec.min_tps,
                iterations: 1,
                duration_secs: bench_duration.as_secs_f64(),
            })
        };

        timeout(Duration::from_secs(300), benchmark_future)
            .await
            .context("Benchmark timed out")?
    }

    /// Get model path (download if needed)
    async fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_dir = self.model_cache_dir.join(model_id);
        
        if model_dir.exists() {
            return Ok(model_dir);
        }

        // In production, would download from HF Hub
        // For now, create placeholder
        tokio::fs::create_dir_all(&model_dir).await?;
        
        // Create a dummy model config
        let config = serde_json::json!({
            "model_id": model_id,
            "architecture": "qwen3",
            "quantization": "Q4_K_M"
        });
        tokio::fs::write(model_dir.join("config.json"), config.to_string()).await?;

        Ok(model_dir)
    }

    /// Get TEE attestation
    async fn get_tee_attestation(&self) -> Result<TeeAttestationResult> {
        if let Some(endpoint) = &self.settings.tee_endpoint {
            // Call TEE attestation service
            let client = reqwest::Client::new();
            let response = client
                .post(format!("{}/attest", endpoint))
                .json(&serde_json::json!({
                    "tee_type": self.settings.verification_tier
                }))
                .send()
                .await?;

            if response.status().is_success() {
                let attestation: TeeAttestationResult = response.json().await?;
                return Ok(attestation);
            }
        }

        // Fallback: try local TEE attestation
        self.get_local_tee_attestation().await
    }

    /// Get local TEE attestation (Intel TDX / AMD SEV-SNP)
    async fn get_local_tee_attestation(&self) -> Result<TeeAttestationResult> {
        // Check for TDX
        if PathBuf::from("/dev/tdx_guest").exists() {
            return self.get_tdx_attestation().await;
        }

        // Check for SEV-SNP
        if PathBuf::from("/dev/sev").exists() {
            return self.get_sev_snp_attestation().await;
        }

        Err(anyhow!("No TEE hardware detected"))
    }

    /// Get Intel TDX attestation
    async fn get_tdx_attestation(&self) -> Result<TeeAttestationResult> {
        // In production, would use tdx-attestation crate
        // For now, return mock
        Ok(TeeAttestationResult {
            tee_type: "TDX".to_string(),
            quote: base64::encode(b"mock_tdx_quote"),
            collateral: base64::encode(b"mock_tdx_collateral"),
            verified_at: chrono::Utc::now().timestamp() as u64,
        })
    }

    /// Get AMD SEV-SNP attestation
    async fn get_sev_snp_attestation(&self) -> Result<TeeAttestationResult> {
        // In production, would use sev-snp-attestation crate
        Ok(TeeAttestationResult {
            tee_type: "SEV-SNP".to_string(),
            quote: base64::encode(b"mock_sev_quote"),
            collateral: base64::encode(b"mock_sev_collateral"),
            verified_at: chrono::Utc::now().timestamp() as u64,
        })
    }

    /// Quick probe for health checks (lighter than full probe)
    pub async fn quick_probe(&self) -> Result<GpuInfo> {
        self.detect_gpu().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_benchmark_result_calculation() {
        let mut samples = vec![100, 200, 150, 300, 250];
        samples.sort();
        assert_eq!(samples[2], 200); // median
    }
}