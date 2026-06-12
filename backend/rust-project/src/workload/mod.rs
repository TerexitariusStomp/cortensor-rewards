//! Workload Isolation - Firecracker/gVisor integration
//!
//! Launches inference workloads in isolated microVMs or containers

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::sync::{RwLock, Semaphore};
use tokio::time::timeout;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

use crate::config::{ResourceLimits, WorkloadConfig, PrewarmConfig};

/// Workload backend type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkloadBackend {
    Firecracker,
    GVisor,
    Bare, // For testing only
}

impl std::str::FromStr for WorkloadBackend {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "firecracker" => Ok(WorkloadBackend::Firecracker),
            "gvisor" => Ok(WorkloadBackend::GVisor),
            "bare" => Ok(WorkloadBackend::Bare),
            _ => Err(anyhow!("Unknown backend: {}", s)),
        }
    }
}

/// Workload specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadSpec {
    pub job_id: String,
    pub model_id: String,
    pub model_path: PathBuf,
    pub prompt_tokens: Vec<u32>,
    pub config: InferenceConfig,
    pub resources: ResourceLimits,
    pub verification_tier: u8,
    pub tee_session_id: Option<String>,
}

/// Inference configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceConfig {
    pub temperature: f32,
    pub top_p: f32,
    pub max_tokens: u32,
    pub stop_sequences: Option<Vec<String>>,
    pub seed: Option<u64>,
}

/// Workload result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadResult {
    pub job_id: String,
    pub tokens: Vec<u32>,
    pub usage: UsageStats,
    pub response_hash: String,
    pub attestation: Option<WorkloadAttestation>,
    pub duration_ms: u64,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub ttft_ms: u32,
    pub tps: u32,
}

/// Workload attestation data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadAttestation {
    pub cpu_cycles: u64,
    pub memory_peak_mb: u64,
    pub execution_time_ms: u64,
    pub tee_quote: Option<String>,
}

/// Running workload handle
#[derive(Debug)]
pub struct WorkloadHandle {
    pub job_id: String,
    pub backend: WorkloadBackend,
    pub started_at: Instant,
    pub process_id: Option<u32>,
    pub vm_id: Option<String>,
}

/// Workload runner
pub struct WorkloadRunner {
    config: WorkloadConfig,
    semaphore: Arc<Semaphore>,
    running_workloads: Arc<RwLock<HashMap<String, WorkloadHandle>>>,
    prewarmed_instances: Arc<RwLock<HashMap<String, Vec<PrewarmedInstance>>>>,
}

/// Prewarmed instance for fast startup
#[derive(Debug)]
struct PrewarmedInstance {
    model_id: String,
    vm_id: Option<String>,
    process_id: Option<u32>,
    ready: bool,
}

impl WorkloadRunner {
    /// Create new workload runner
    pub fn new(config: WorkloadConfig) -> Result<Self> {
        let max_concurrent = config.default_limits.vcpus as usize; // Simplified
        let semaphore = Arc::new(Semaphore::new(max_concurrent));

        Ok(Self {
            config,
            semaphore,
            running_workloads: Arc::new(RwLock::new(HashMap::new())),
            prewarmed_instances: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Initialize prewarmed instances
    pub async fn initialize_prewarm(&self) -> Result<()> {
        for prewarm in &self.config.prewarm {
            info!("Prewarming {} instances of {}", prewarm.count, prewarm.model_id);
            
            let mut instances = Vec::new();
            for i in 0..prewarm.count {
                let backend = prewarm.backend.as_ref()
                    .map(|b| b.parse().unwrap_or(self.config.backend.parse().unwrap()))
                    .unwrap_or(self.config.backend.parse().unwrap());
                
                match self.start_prewarmed_instance(&prewarm.model_id, backend).await {
                    Ok(instance) => instances.push(instance),
                    Err(e) => {
                        warn!("Failed to prewarm instance {}/{} for {}: {}", 
                            i + 1, prewarm.count, prewarm.model_id, e);
                    }
                }
            }
            
            if !instances.is_empty() {
                self.prewarmed_instances.write().await
                    .insert(prewarm.model_id.clone(), instances);
            }
        }
        Ok(())
    }

    /// Start a prewarmed instance
    async fn start_prewarmed_instance(&self, model_id: &str, backend: WorkloadBackend) -> Result<PrewarmedInstance> {
        match backend {
            WorkloadBackend::Firecracker => {
                let vm_id = format!("prewarm-{}-{}", model_id, Uuid::new_v4());
                self.start_firecracker_vm(&vm_id, model_id, &ResourceLimits::default()).await?;
                Ok(PrewarmedInstance {
                    model_id: model_id.to_string(),
                    vm_id: Some(vm_id),
                    process_id: None,
                    ready: true,
                })
            }
            WorkloadBackend::GVisor => {
                let container_id = format!("prewarm-{}-{}", model_id, Uuid::new_v4());
                Ok(PrewarmedInstance {
                    model_id: model_id.to_string(),
                    vm_id: Some(container_id),
                    process_id: None,
                    ready: true,
                })
            }
            WorkloadBackend::Bare => {
                Ok(PrewarmedInstance {
                    model_id: model_id.to_string(),
                    vm_id: None,
                    process_id: None,
                    ready: true,
                })
            }
        }
    }

    /// Run a workload
    pub async fn run_workload(&self, spec: WorkloadSpec) -> Result<WorkloadResult> {
        let job_id = spec.job_id.clone();
        let start_time = Instant::now();

        // Acquire semaphore permit
        let _permit = self.semaphore.acquire().await
            .context("Failed to acquire workload permit")?;

        // Register running workload
        let handle = WorkloadHandle {
            job_id: job_id.clone(),
            backend: self.config.backend.parse().unwrap(),
            started_at: Instant::now(),
            process_id: None,
            vm_id: None,
        };
        self.running_workloads.write().await.insert(job_id.clone(), handle);

        // Execute based on backend
        let result = match self.config.backend.parse().unwrap() {
            WorkloadBackend::Firecracker => self.run_firecracker(spec).await,
            WorkloadBackend::GVisor => self.run_gvisor(spec).await,
            WorkloadBackend::Bare => self.run_bare(spec).await,
        };

        // Clean up
        self.running_workloads.write().await.remove(&job_id);

        let duration = start_time.elapsed();
        match result {
            Ok(mut workload_result) => {
                workload_result.duration_ms = duration.as_millis() as u64;
                Ok(workload_result)
            }
            Err(e) => {
                error!("Workload {} failed: {}", job_id, e);
                Err(e)
            }
        }
    }

    /// Run workload in Firecracker microVM
    async fn run_firecracker(&self, spec: WorkloadSpec) -> Result<WorkloadResult> {
        let vm_id = format!("vm-{}", spec.job_id);
        let socket_path = format!("{}/{}", self.config.firecracker_socket.trim_end_matches(".socket"), vm_id);

        info!("Starting Firecracker VM: {}", vm_id);

        // Create VM config
        let vm_config = self.create_firecracker_config(&vm_id, &spec)?;
        let config_path = format!("/tmp/{}.json", vm_id);
        tokio::fs::write(&config_path, serde_json::to_string_pretty(&vm_config)?).await?;

        // Start Firecracker
        let mut cmd = Command::new("firecracker")
            .arg("--api-sock")
            .arg(&socket_path)
            .arg("--config-file")
            .arg(&config_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to start firecracker")?;

        let process_id = cmd.id().unwrap_or(0);
        
        // Update handle
        if let Some(handle) = self.running_workloads.write().await.get_mut(&spec.job_id) {
            handle.process_id = Some(process_id);
            handle.vm_id = Some(vm_id.clone());
        }

        // Wait for VM to boot and run inference
        // In production, would use Firecracker API to send inference request
        let result = self.run_inference_in_vm(&vm_id, &socket_path, &spec).await?;

        // Kill VM
        let _ = cmd.kill().await;
        let _ = tokio::fs::remove_file(&config_path).await;
        let _ = tokio::fs::remove_file(&socket_path).await;

        Ok(result)
    }

    /// Create Firecracker VM configuration
    fn create_firecracker_config(&self, vm_id: &str, spec: &WorkloadSpec) -> Result<serde_json::Value> {
        let limits = &spec.resources;
        
        Ok(serde_json::json!({
            "boot-source": {
                "kernel_image_path": "/opt/firecracker/vmlinux.bin",
                "boot_args": "console=ttyS0 reboot=k panic=1 pci=off nomodules ro systemd.journald.forward_to_console=1"
            },
            "drives": [{
                "drive_id": "rootfs",
                "path_on_host": "/opt/firecracker/rootfs.ext4",
                "is_root_device": true,
                "is_read_only": false
            }],
            "machine-config": {
                "vcpu_count": limits.vcpus,
                "mem_size_mib": limits.memory_mb,
                "ht_enabled": false
            },
            "network-interfaces": [{
                "iface_id": "eth0",
                "host_dev_name": "fcnet",
                "guest_mac": "02:FC:00:00:00:01"
            }],
            "vsock": {
                "guest_cid": 3,
                "uds_path": format!("/tmp/{}.vsock", vm_id)
            }
        }))
    }

    /// Run inference inside Firecracker VM
    async fn run_inference_in_vm(
        &self,
        vm_id: &str,
        socket_path: &str,
        spec: &WorkloadSpec,
    ) -> Result<WorkloadResult> {
        // In production, would:
        // 1. Connect to Firecracker API socket
        // 2. Use vsock to communicate with guest agent
        // 3. Guest agent runs llama.cpp/vLLM and streams tokens
        // 4. Collect attestation data from guest
        
        // Mock implementation
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        let tokens = vec![1, 2, 3, 4, 5]; // Mock tokens
        let response_hash = format!("0x{}", hex::encode(sha256_hash(&tokens)));
        
        Ok(WorkloadResult {
            job_id: spec.job_id,
            tokens,
            usage: UsageStats {
                prompt_tokens: spec.prompt_tokens.len() as u32,
                completion_tokens: 5,
                total_tokens: spec.prompt_tokens.len() as u32 + 5,
                ttft_ms: 150,
                tps: 25,
            },
            response_hash,
            attestation: Some(WorkloadAttestation {
                cpu_cycles: 1_000_000,
                memory_peak_mb: 4096,
                execution_time_ms: 100,
                tee_quote: spec.tee_session_id.map(|_| "mock_tee_quote".to_string()),
            }),
            duration_ms: 0, // Will be set by caller
        })
    }

    /// Run workload in gVisor (runsc)
    async fn run_gvisor(&self, spec: WorkloadSpec) -> Result<WorkloadResult> {
        let container_id = format!("qvac-{}", spec.job_id);
        
        info!("Starting gVisor container: {}", container_id);

        // Build runsc command
        let mut cmd = Command::new(&self.config.runsc_path)
            .args([
                "run",
                "--rootless",
                "--network=none",
                "--platform=runsc",
                "--memory", &format!("{}M", spec.resources.memory_mb),
                "--cpus", &spec.resources.vcpus.to_string(),
                "--gpus", &spec.resources.gpus,
                "--rm",
                "--name", &container_id,
            ]);

        // Add model volume
        cmd.arg("-v").arg(format!("{}:/models:ro", spec.model_path.display()));

        // Add workload script
        let workload_script = self.create_inference_script(&spec)?;
        let script_path = format!("/tmp/{}.sh", container_id);
        tokio::fs::write(&script_path, workload_script).await?;
        cmd.arg("-v").arg(format!("{}:/workload.sh:ro", script_path));

        // Run container
        cmd.arg("qvac-inference:latest")
            .arg("/workload.sh")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await
            .context("Failed to run gVisor container")?;

        let _ = tokio::fs::remove_file(&script_path).await;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("gVisor container failed: {}", stderr));
        }

        // Parse output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: WorkloadResult = serde_json::from_str(&stdout)
            .context("Failed to parse workload output")?;

        Ok(WorkloadResult {
            job_id: spec.job_id,
            ..result
        })
    }

    /// Run workload bare metal (testing only)
    async fn run_bare(&self, spec: WorkloadSpec) -> Result<WorkloadResult> {
        warn!("Running bare metal workload (testing only): {}", spec.job_id);
        
        let workload_script = self.create_inference_script(&spec)?;
        let script_path = format!("/tmp/bare-{}.sh", spec.job_id);
        tokio::fs::write(&script_path, workload_script).await?;

        let mut cmd = Command::new("bash")
            .arg(&script_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await?;
        
        let _ = tokio::fs::remove_file(&script_path).await;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Bare workload failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: WorkloadResult = serde_json::from_str(&stdout)?;

        Ok(result)
    }

    /// Create inference script for container/VM
    fn create_inference_script(&self, spec: &WorkloadSpec) -> Result<String> {
        let prompt_tokens = serde_json::to_string(&spec.prompt_tokens)?;
        let config_json = serde_json::to_string(&spec.config)?;
        
        Ok(format!(r#"#!/bin/bash
set -e

MODEL_PATH="/models"
PROMPT_TOKENS='{}'
CONFIG='{}'
OUTPUT_FILE="/tmp/result-{}.json"

# In production, would run actual inference engine
# e.g., llama-cli, vLLM, or custom bare-metal runner

# Mock inference for now
sleep 0.1

# Generate mock tokens
TOKENS=(10 20 30 40 50)
TTFT=150
TPS=25

cat > "$OUTPUT_FILE" <<EOF
{{
  "job_id": "{}",
  "tokens": $(echo "${TOKENS[@]}" | jq -R 'split(" ") | map(tonumber)'),
  "usage": {{
    "prompt_tokens": {},
    "completion_tokens": 5,
    "total_tokens": {},
    "ttft_ms": $TTFT,
    "tps": $TPS
  }},
  "response_hash": "0x$(echo -n "${{TOKENS[*]}}" | sha256sum | cut -d' ' -f1)",
  "attestation": {{
    "cpu_cycles": 1000000,
    "memory_peak_mb": 4096,
    "execution_time_ms": 100,
    "tee_quote": {}
  }},
  "duration_ms": 0
}}
EOF

cat "$OUTPUT_FILE"
"#, 
            prompt_tokens,
            config_json,
            spec.job_id,
            spec.job_id,
            spec.prompt_tokens.len(),
            spec.prompt_tokens.len() + 5,
            if spec.verification_tier >= 1 { "\"mock_tee_quote\"" } else { "null" }
        ))
    }

    /// Get running workload count
    pub async fn running_count(&self) -> usize {
        self.running_workloads.read().await.len()
    }

    /// Kill a running workload
    pub async fn kill_workload(&self, job_id: &str) -> Result<()> {
        let mut workloads = self.running_workloads.write().await;
        if let Some(handle) = workloads.remove(job_id) {
            // In production, would kill the actual process/VM
            info!("Killed workload: {}", job_id);
        }
        Ok(())
    }

    /// Get resource utilization
    pub async fn get_utilization(&self) -> WorkloadUtilization {
        let running = self.running_workloads.read().await;
        let permits_available = self.semaphore.available_permits();
        let max_permits = self.config.default_limits.vcpus as usize; // Simplified
        
        WorkloadUtilization {
            running_workloads: running.len(),
            max_concurrent: max_permits,
            available_slots: permits_available,
            cpu_percent: 0.0, // Would calculate from actual usage
            memory_percent: 0.0,
        }
    }
}

/// Workload utilization metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadUtilization {
    pub running_workloads: usize,
    pub max_concurrent: usize,
    pub available_slots: usize,
    pub cpu_percent: f64,
    pub memory_percent: f64,
}

/// SHA256 helper
fn sha256_hash(data: &[u32]) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for token in data {
        hasher.update(token.to_le_bytes());
    }
    hasher.finalize().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_workload_runner_creation() {
        let config = WorkloadConfig::default();
        let runner = WorkloadRunner::new(config).unwrap();
        assert_eq!(runner.running_count().await, 0);
    }

    #[test]
    fn test_inference_script_generation() {
        let config = WorkloadConfig::default();
        let runner = WorkloadRunner::new(config).unwrap();
        
        let spec = WorkloadSpec {
            job_id: "test-job".to_string(),
            model_id: "test-model".to_string(),
            model_path: PathBuf::from("/models/test"),
            prompt_tokens: vec![1, 2, 3],
            config: InferenceConfig {
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 100,
                stop_sequences: None,
                seed: None,
            },
            resources: ResourceLimits::default(),
            verification_tier: 0,
            tee_session_id: None,
        };

        let script = runner.create_inference_script(&spec).unwrap();
        assert!(script.contains("test-job"));
        assert!(script.contains("1, 2, 3"));
    }
}