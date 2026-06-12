//! Configuration schema for QVAC Provider Daemon
//!
//! Based on the Architecture Specification v1.0

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Root configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    #[serde(default)]
    pub metadata: ConfigMetadata,
    pub provider: ProviderSettings,
    pub pricing: PricingConfig,
    pub matching: MatchingConfig,
    pub p2p: P2PConfig,
    #[serde(default)]
    pub tee: TeeConfig,
    #[serde(default)]
    pub workload: WorkloadConfig,
    #[serde(default)]
    pub attestation: AttestationConfig,
    #[serde(default)]
    pub settlement: SettlementConfig,
    #[serde(default)]
    pub metrics: MetricsConfig,
    #[serde(default)]
    pub logging: LoggingConfig,
}

/// Configuration file metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigMetadata {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub description: String,
}

fn default_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn default_schema_version() -> u32 {
    1
}

impl Default for ConfigMetadata {
    fn default() -> Self {
        Self {
            version: default_version(),
            schema_version: default_schema_version(),
            description: "QVAC Provider Daemon Configuration".to_string(),
        }
    }
}

/// Provider identity and capability settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettings {
    /// Human-readable provider name
    pub name: String,
    /// Task type bitmask: 0x1=LLM, 0x2=Embedding, 0x4=ImageGen, 0x8=Audio, 0x10=Custom
    pub task_types: u16,
    /// Geographic region hint for latency-aware matching
    #[serde(default)]
    pub region: Option<String>,
    /// Verification tier: 0=None, 1=TEE-lite, 2=ZK-ML, 3=Replicated
    #[serde(default = "default_verification_tier")]
    pub verification_tier: u8,
    /// TEE attestation endpoint (required for tier >= 1)
    #[serde(default)]
    pub tee_endpoint: Option<String>,
    /// On-chain authority address (EVM or Solana)
    pub authority: String,
    /// RPC URL for blockchain interaction
    pub rpc_url: String,
    /// Chain ID (EVM) or cluster (Solana: mainnet/devnet/testnet)
    pub chain_id: String,
    /// Maximum concurrent inference sessions
    #[serde(default = "default_max_concurrent_sessions")]
    pub max_concurrent_sessions: u32,
    /// Seed for Hyperswarm key generation (env var name or inline hex)
    #[serde(default)]
    pub seed_env: Option<String>,
    /// Path to seed file (alternative to seed_env)
    #[serde(default)]
    pub seed_file: Option<PathBuf>,
    /// Capability probing interval in seconds
    #[serde(default = "default_probe_interval")]
    pub probe_interval_secs: u64,
    /// Heartbeat announcement interval in milliseconds
    #[serde(default = "default_announce_interval_ms")]
    pub announce_interval_ms: u64,
}

fn default_verification_tier() -> u8 {
    0
}

fn default_max_concurrent_sessions() -> u32 {
    4
}

fn default_probe_interval() -> u64 {
    3600 // 1 hour
}

fn default_announce_interval_ms() -> u64 {
    30000 // 30 seconds
}

/// Pricing configuration with tier multipliers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingConfig {
    /// Reference model ID for base pricing (typically QWEN3_8B_INST_Q4_K_M)
    pub base_model_id: String,
    /// Base price per request in smallest unit (wei/lamports)
    pub base_price_per_request: String,
    /// Per-model tier overrides with multipliers
    #[serde(default)]
    pub tiers: HashMap<String, TierPricing>,
    /// Currency/token configuration
    #[serde(default)]
    pub token: TokenConfig,
}

/// Per-model tier pricing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierPricing {
    /// Price multiplier relative to base (e.g., 0.1, 0.25, 0.5, 1.0, 1.2, 2.0)
    pub multiplier: f64,
    /// Minimum tokens per second guarantee
    pub min_tps: u32,
    /// Maximum context tokens supported
    #[serde(default = "default_max_context")]
    pub max_context_tokens: u32,
}

fn default_max_context() -> u32 {
    32768
}

/// Token configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenConfig {
    /// Payment token address (0x0 or native for native token)
    pub address: String,
    /// Token decimals
    #[serde(default = "default_decimals")]
    pub decimals: u8,
    /// Protocol fee in basis points (100 = 1%)
    #[serde(default = "default_protocol_fee_bps")]
    pub protocol_fee_bps: u16,
}

fn default_decimals() -> u8 {
    18
}

fn default_protocol_fee_bps() -> u16 {
    100
}

/// Matching engine configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchingConfig {
    /// Matching engine WebSocket endpoint
    pub endpoint: String,
    /// API key for authenticated access
    #[serde(default)]
    pub api_key: Option<String>,
    /// Reconnect intervals
    #[serde(default = "default_reconnect_interval")]
    pub reconnect_interval_secs: u64,
    /// Order submission timeout
    #[serde(default = "default_order_timeout")]
    pub order_timeout_secs: u64,
    /// Enable order book mirroring to on-chain
    #[serde(default)]
    pub mirror_onchain: bool,
}

fn default_reconnect_interval() -> u64 {
    5
}

fn default_order_timeout() -> u64 {
    30
}

/// P2P/Hyperswarm configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct P2PConfig {
    /// Seed for key generation (env var name)
    #[serde(default = "default_seed_env")]
    pub seed_env: String,
    /// Market discovery topic
    #[serde(default = "default_market_topic")]
    pub market_topic: String,
    /// Announce interval in milliseconds
    #[serde(default = "default_announce_interval")]
    pub announce_interval_ms: u64,
    /// Max peers to maintain
    #[serde(default = "default_max_peers")]
    pub max_peers: usize,
    /// Enable relay fallback for NAT traversal
    #[serde(default = "default_true")]
    pub enable_relay: bool,
    /// Bootstrap nodes
    #[serde(default)]
    pub bootstrap: Vec<String>,
    /// Holepunch/mux options
    #[serde(default)]
    pub mux: bool,
}

fn default_seed_env() -> String {
    "QVAC_HYPERSWARM_SEED".to_string()
}

fn default_market_topic() -> String {
    "compute:market:v1".to_string()
}

fn default_announce_interval() -> u64 {
    30000
}

fn default_max_peers() -> usize {
    100
}

fn default_true() -> bool {
    true
}

/// TEE attestation configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TeeConfig {
    /// TEE type: tdx, sev-snp, trustzone, sgx
    #[serde(default)]
    pub tee_type: Option<String>,
    /// Attestation service endpoint
    #[serde(default)]
    pub endpoint: Option<String>,
    /// Attestation policy
    #[serde(default)]
    pub policy: Option<String>,
    /// Collateral update interval
    #[serde(default = "default_collateral_interval")]
    pub collateral_update_interval_secs: u64,
}

fn default_collateral_interval() -> u64 {
    86400 // 24 hours
}

/// Workload isolation configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkloadConfig {
    /// Isolation backend: firecracker, gvisor, bare (for testing)
    #[serde(default = "default_backend")]
    pub backend: String,
    /// Firecracker socket path
    #[serde(default = "default_firecracker_socket")]
    pub firecracker_socket: String,
    /// gVisor runsc path
    #[serde(default = "default_runsc_path")]
    pub runsc_path: String,
    /// Default VM/container resource limits
    #[serde(default)]
    pub default_limits: ResourceLimits,
    /// Model cache directory
    #[serde(default = "default_model_cache")]
    pub model_cache_dir: PathBuf,
    /// Maximum model load time in seconds
    #[serde(default = "default_model_load_timeout")]
    pub model_load_timeout_secs: u64,
    /// Pre-warmed model instances
    #[serde(default)]
    pub prewarm: Vec<PrewarmConfig>,
}

fn default_backend() -> String {
    "firecracker".to_string()
}

fn default_firecracker_socket() -> String {
    "/tmp/firecracker.socket".to_string()
}

fn default_runsc_path() -> String {
    "/usr/bin/runsc".to_string()
}

fn default_model_cache() -> PathBuf {
    dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("/var/lib/qvac"))
        .join("models")
}

fn default_model_load_timeout() -> u64 {
    300
}

/// Resource limits for workloads
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLimits {
    /// vCPU count
    #[serde(default = "default_vcpus")]
    pub vcpus: u32,
    /// Memory in MB
    #[serde(default = "default_memory_mb")]
    pub memory_mb: u64,
    /// GPU devices (comma-separated indices or "all")
    #[serde(default)]
    pub gpus: String,
    /// Disk space in MB
    #[serde(default = "default_disk_mb")]
    pub disk_mb: u64,
    /// Network bandwidth limit (Mbps)
    #[serde(default)]
    pub network_mbps: Option<u32>,
}

fn default_vcpus() -> u32 {
    4
}

fn default_memory_mb() -> u64 {
    8192
}

fn default_disk_mb() -> u64 {
    10240
}

/// Pre-warmed model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmConfig {
    pub model_id: String,
    pub count: u32,
    #[serde(default)]
    pub backend: Option<String>, // Override default backend
}

/// Attestation streaming configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttestationConfig {
    /// Enable attestation streaming
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Attestation service endpoint
    #[serde(default)]
    pub endpoint: Option<String>,
    /// Stream interval in milliseconds
    #[serde(default = "default_stream_interval")]
    pub stream_interval_ms: u64,
    /// Batch size for attestation aggregation
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
    /// Include CPU cycle counters
    #[serde(default = "default_true")]
    pub include_cpu_cycles: bool,
    /// Include memory usage
    #[serde(default = "default_true")]
    pub include_memory: bool,
    /// Include output hash verification
    #[serde(default = "default_true")]
    pub include_output_hash: bool,
}

fn default_stream_interval() -> u64 {
    1000 // 1 second
}

fn default_batch_size() -> usize {
    10
}

/// Settlement/payment configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettlementConfig {
    /// Payment mode: per_inference, escrow_channel
    #[serde(default = "default_payment_mode")]
    pub mode: String,
    /// Auto-claim completed jobs
    #[serde(default = "default_true")]
    pub auto_claim: bool,
    /// Claim interval in seconds
    #[serde(default = "default_claim_interval")]
    pub claim_interval_secs: u64,
    /// Minimum claim amount (dust threshold)
    #[serde(default = "default_min_claim")]
    pub min_claim_amount: String,
    /// Gas price strategy: fixed, auto, max_priority
    #[serde(default = "default_gas_strategy")]
    pub gas_strategy: String,
    /// Maximum gas price (wei)
    #[serde(default)]
    pub max_gas_price: Option<String>,
}

fn default_payment_mode() -> String {
    "per_inference".to_string()
}

fn default_claim_interval() -> u64 {
    60
}

fn default_min_claim() -> String {
    "1000".to_string() // 1000 wei/lamports
}

fn default_gas_strategy() -> String {
    "auto".to_string()
}

/// Metrics and monitoring configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MetricsConfig {
    /// Enable Prometheus metrics
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Metrics listen address
    #[serde(default = "default_metrics_addr")]
    pub listen_addr: String,
    /// Metrics path
    #[serde(default = "default_metrics_path")]
    pub path: String,
    /// Push gateway for remote metrics (optional)
    #[serde(default)]
    pub push_gateway: Option<String>,
    /// Push interval in seconds
    #[serde(default = "default_push_interval")]
    pub push_interval_secs: u64,
}

fn default_metrics_addr() -> String {
    "0.0.0.0:9090".to_string()
}

fn default_metrics_path() -> String {
    "/metrics".to_string()
}

fn default_push_interval() -> u64 {
    30
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoggingConfig {
    /// Log level: trace, debug, info, warn, error
    #[serde(default = "default_log_level")]
    pub level: String,
    /// Log format: json, pretty
    #[serde(default = "default_log_format")]
    pub format: String,
    /// Log file path (optional, stdout if not set)
    #[serde(default)]
    pub file: Option<PathBuf>,
    /// Log rotation
    #[serde(default)]
    pub rotation: Option<LogRotation>,
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_log_format() -> String {
    "json".to_string()
}

/// Log rotation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRotation {
    /// Max file size in MB
    pub max_size_mb: u64,
    /// Max files to keep
    pub max_files: u32,
    /// Compress rotated files
    #[serde(default = "default_true")]
    pub compress: bool,
}

impl ProviderConfig {
    /// Load configuration from file with environment variable overrides
    pub fn load<P: AsRef<std::path::Path>>(path: P) -> anyhow::Result<Self> {
        let figment = figment::Figment::new()
            .merge(figment::providers::Toml::file(path.as_ref()))
            .merge(figment::providers::Yaml::file(
                path.as_ref().with_extension("yaml"),
            ))
            .merge(figment::providers::Yaml::file(
                path.as_ref().with_extension("yml"),
            ))
            .merge(figment::providers::Json::file(
                path.as_ref().with_extension("json"),
            ))
            .merge(figment::providers::Env::prefixed("QVAC_").global())
            .merge(figment::providers::Env::raw());

        Ok(figment.extract()?)
    }

    /// Validate configuration
    pub fn validate(&self) -> anyhow::Result<()> {
        // Validate provider settings
        if self.provider.name.is_empty() {
            anyhow::bail!("provider.name cannot be empty");
        }
        if self.provider.authority.is_empty() {
            anyhow::bail!("provider.authority cannot be empty");
        }
        if self.provider.rpc_url.is_empty() {
            anyhow::bail!("provider.rpc_url cannot be empty");
        }
        if self.provider.task_types == 0 {
            anyhow::bail!("provider.task_types must be non-zero");
        }
        if self.provider.verification_tier > 3 {
            anyhow::bail!("provider.verification_tier must be 0-3");
        }
        if self.provider.verification_tier >= 1 && self.provider.tee_endpoint.is_none() {
            anyhow::bail!("provider.tee_endpoint required for verification_tier >= 1");
        }

        // Validate pricing
        if self.pricing.base_model_id.is_empty() {
            anyhow::bail!("pricing.base_model_id cannot be empty");
        }
        if self.pricing.base_price_per_request.is_empty() {
            anyhow::bail!("pricing.base_price_per_request cannot be empty");
        }

        // Validate matching
        if self.matching.endpoint.is_empty() {
            anyhow::bail!("matching.endpoint cannot be empty");
        }

        // Validate P2P
        if self.p2p.announce_interval_ms < 1000 {
            anyhow::bail!("p2p.announce_interval_ms must be >= 1000");
        }

        // Validate workload
        match self.workload.backend.as_str() {
            "firecracker" | "gvisor" | "bare" => {}
            _ => anyhow::bail!(
                "workload.backend must be one of: firecracker, gvisor, bare"
            ),
        }

        // Validate settlement
        match self.settlement.mode.as_str() {
            "per_inference" | "escrow_channel" => {}
            _ => anyhow::bail!(
                "settlement.mode must be one of: per_inference, escrow_channel"
            ),
        }

        Ok(())
    }

    /// Get the Hyperswarm seed from env or file
    pub fn get_hyperswarm_seed(&self) -> anyhow::Result<[u8; 32]> {
        // Try env var first
        if let Some(env_var) = &self.provider.seed_env {
            if let Ok(seed_hex) = std::env::var(env_var) {
                if seed_hex.len() == 64 {
                    return hex::decode(&seed_hex)
                        .map(|v| v.try_into().expect("32 bytes"))
                        .map_err(|e| anyhow::anyhow!("Invalid seed hex: {}", e));
                }
            }
        }

        // Try seed file
        if let Some(seed_file) = &self.provider.seed_file {
            if seed_file.exists() {
                let content = std::fs::read_to_string(seed_file)?;
                let seed_hex = content.trim();
                if seed_hex.len() == 64 {
                    return hex::decode(seed_hex)
                        .map(|v| v.try_into().expect("32 bytes"))
                        .map_err(|e| anyhow::anyhow!("Invalid seed hex in file: {}", e));
                }
            }
        }

        // Try P2P seed env
        if let Ok(seed_hex) = std::env::var(&self.p2p.seed_env) {
            if seed_hex.len() == 64 {
                return hex::decode(&seed_hex)
                    .map(|v| v.try_into().expect("32 bytes"))
                    .map_err(|e| anyhow::anyhow!("Invalid P2P seed hex: {}", e));
            }
        }

        anyhow::bail!(
            "Hyperswarm seed not found. Set {} env var or provide seed_file",
            self.p2p.seed_env
        )
    }

    /// Generate default configuration for onboarding
    pub fn default_for_onboarding() -> Self {
        Self {
            metadata: ConfigMetadata::default(),
            provider: ProviderSettings {
                name: "My GPU Node".to_string(),
                task_types: 0x7, // LLM + Embedding + ImageGen
                region: Some("us-east-1".to_string()),
                verification_tier: 0,
                tee_endpoint: None,
                authority: "0x".to_string(), // Must be set by user
                rpc_url: "https://eth-mainnet.g.alchemy.com/v2/your-key".to_string(),
                chain_id: "1".to_string(),
                max_concurrent_sessions: 4,
                seed_env: Some("QVAC_HYPERSWARM_SEED".to_string()),
                seed_file: None,
                probe_interval_secs: 3600,
                announce_interval_ms: 30000,
            },
            pricing: PricingConfig {
                base_model_id: "QWEN3_8B_INST_Q4_K_M".to_string(),
                base_price_per_request: "1000000".to_string(), // 1M wei = 0.001 ETH
                tiers: {
                    let mut tiers = HashMap::new();
                    tiers.insert(
                        "QWEN3_600M".to_string(),
                        TierPricing {
                            multiplier: 0.1,
                            min_tps: 50,
                            max_context_tokens: 32768,
                        },
                    );
                    tiers.insert(
                        "QWEN3_1_7B".to_string(),
                        TierPricing {
                            multiplier: 0.25,
                            min_tps: 30,
                            max_context_tokens: 32768,
                        },
                    );
                    tiers.insert(
                        "QWEN3_4B".to_string(),
                        TierPricing {
                            multiplier: 0.5,
                            min_tps: 20,
                            max_context_tokens: 32768,
                        },
                    );
                    tiers.insert(
                        "QWEN3_8B_INST_Q4_K_M".to_string(),
                        TierPricing {
                            multiplier: 1.0,
                            min_tps: 15,
                            max_context_tokens: 32768,
                        },
                    );
                    tiers.insert(
                        "LLAMA3_8B_INST_Q4".to_string(),
                        TierPricing {
                            multiplier: 1.2,
                            min_tps: 12,
                            max_context_tokens: 8192,
                        },
                    );
                    tiers
                },
                token: TokenConfig {
                    address: "0x0".to_string(),
                    decimals: 18,
                    protocol_fee_bps: 100,
                },
            },
            matching: MatchingConfig {
                endpoint: "wss://matching.compute-market.example.com".to_string(),
                api_key: None,
                reconnect_interval_secs: 5,
                order_timeout_secs: 30,
                mirror_onchain: false,
            },
            p2p: P2PConfig::default(),
            tee: TeeConfig::default(),
            workload: WorkloadConfig::default(),
            attestation: AttestationConfig::default(),
            settlement: SettlementConfig::default(),
            metrics: MetricsConfig::default(),
            logging: LoggingConfig::default(),
        }
    }
}

impl Default for P2PConfig {
    fn default() -> Self {
        Self {
            seed_env: "QVAC_HYPERSWARM_SEED".to_string(),
            market_topic: "compute:market:v1".to_string(),
            announce_interval_ms: 30000,
            max_peers: 100,
            enable_relay: true,
            bootstrap: vec![
                "bootstrap1.hyperswarm.org:443".to_string(),
                "bootstrap2.hyperswarm.org:443".to_string(),
            ],
            mux: true,
        }
    }
}