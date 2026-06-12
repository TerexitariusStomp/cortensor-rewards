//! CLI Commands Module

use anyhow::{anyhow, Context, Result};
use clap::Args;
use tracing::{info, warn};

use crate::config::ProviderConfig;
use crate::prober::CapabilityProber;
use crate::workload::{InferenceConfig, ResourceLimits, WorkloadRunner, WorkloadSpec};
use crate::p2p::P2PClient;
use crate::registry::RegistryManager;

/// Start provider daemon
#[derive(Args)]
pub struct StartArgs {
    /// Hyperswarm seed (env var name or hex)
    #[arg(long, value_name = "SEED")]
    pub seed: Option<String>,
    
    /// On-chain authority address
    #[arg(long, value_name = "ADDRESS")]
    pub authority: Option<String>,
    
    /// RPC URL
    #[arg(long, value_name = "URL")]
    pub rpc_url: Option<String>,
    
    /// Verification tier (0-3)
    #[arg(long, value_name = "TIER", default_value = "0")]
    pub verification_tier: u8,
    
    /// TEE attestation endpoint
    #[arg(long, value_name = "URL")]
    pub tee_endpoint: Option<String>,

    /// Run in foreground (don't daemonize)
    #[arg(long)]
    pub foreground: bool,
}

pub async fn start(args: StartArgs, config_path: &str) -> Result<()> {
    info!("Starting QVAC Provider Daemon...");
    
    // Load configuration
    let mut config = ProviderConfig::load(config_path)
        .context("Failed to load configuration")?;
    
    // Override with CLI args
    if let Some(seed) = args.seed {
        config.provider.seed_env = Some(seed);
    }
    if let Some(authority) = args.authority {
        config.provider.authority = authority;
    }
    if let Some(rpc_url) = args.rpc_url {
        config.provider.rpc_url = rpc_url;
    }
    if args.verification_tier > 0 {
        config.provider.verification_tier = args.verification_tier;
    }
    if let Some(tee_endpoint) = args.tee_endpoint {
        config.provider.tee_endpoint = Some(tee_endpoint);
    }

    // Validate
    config.validate().context("Invalid configuration")?;

    // Get hyperswarm seed
    let seed = config.get_hyperswarm_seed().context("Failed to get Hyperswarm seed")?;
    
    // Initialize components
    info!("Initializing components...");
    
    // Registry manager
    let registry = RegistryManager::new(&config.provider, &config.pricing).await?;
    
    // P2P client
    let mut p2p = P2PClient::new(config.p2p.clone(), config.provider.clone(), seed).await?;
    p2p.start().await?;
    
    // Capability prober
    let prober = CapabilityProber::new(config.provider.clone(), config.workload.model_cache_dir.clone())?;
    
    // Run capability probe
    info!("Running capability probe...");
    let capability_profile = prober.probe().await?;
    
    // Register with registry
    info!("Registering provider...");
    let registration = registry.register_with_capabilities(
        seed,
        &config.provider,
        &config.pricing,
        &capability_profile,
    ).await?;
    
    info!("Provider registered: PDA = {}", registration.provider_pda);
    
    // Workload runner
    let workload_runner = WorkloadRunner::new(config.workload.clone())?;
    workload_runner.initialize_prewarm().await?;
    
    // Main loop
    info!("Provider daemon running. Press Ctrl+C to stop.");
    
    if args.foreground {
        // Run in foreground
        tokio::signal::ctrl_c().await?;
    } else {
        // Would daemonize here
        tokio::signal::ctrl_c().await?;
    }
    
    // Cleanup
    info!("Shutting down...");
    p2p.shutdown().await;
    
    Ok(())
}

/// Register provider on-chain
#[derive(Args)]
pub struct RegisterArgs {
    /// Provider name
    #[arg(long)]
    pub name: String,
    
    /// Task types bitmask
    #[arg(long, default_value = "7")]
    pub task_types: u16,
    
    /// Pricing tiers as JSON
    #[arg(long)]
    pub tiers: Option<String>,
}

pub async fn register(args: RegisterArgs, config_path: &str) -> Result<()> {
    let mut config = ProviderConfig::load(config_path)?;
    
    // Override with CLI args
    config.provider.name = args.name;
    config.provider.task_types = args.task_types;
    
    config.validate()?;
    
    let seed = config.get_hyperswarm_seed()?;
    let registry = RegistryManager::new(&config.provider, &config.pricing).await?;
    
    // Need capability profile
    let prober = CapabilityProber::new(config.provider.clone(), config.workload.model_cache_dir.clone())?;
    let capability_profile = prober.probe().await?;
    
    let registration = registry.register_with_capabilities(
        seed,
        &config.provider,
        &config.pricing,
        &capability_profile,
    ).await?;
    
    println!("Registered: PDA = {}", registration.provider_pda);
    println!("Transaction: {}", registration.transaction_hash);
    
    Ok(())
}

/// Update provider
#[derive(Args)]
pub struct UpdateArgs {
    /// New name
    #[arg(long)]
    pub name: Option<String>,
    
    /// New task types bitmask
    #[arg(long)]
    pub task_types: Option<u16>,
    
    /// New tiers JSON
    #[arg(long)]
    pub tiers: Option<String>,
}

pub async fn update(args: UpdateArgs, config_path: &str) -> Result<()> {
    let config = ProviderConfig::load(config_path)?;
    
    let registry = RegistryManager::new(&config.provider, &config.pricing).await?;
    
    registry.update_provider(args.name.as_deref(), args.task_types, None).await?;
    
    println!("Provider updated");
    Ok(())
}

/// Rotate peer ID
#[derive(Args)]
pub struct RotatePeerIdArgs {
    /// New seed
    #[arg(long)]
    pub new_seed: String,
}

pub async fn rotate_peer_id(args: RotatePeerIdArgs, config_path: &str) -> Result<()> {
    let config = ProviderConfig::load(config_path)?;
    
    let new_seed = hex::decode(&args.new_seed)
        .context("Invalid seed hex")?
        .try_into()
        .map_err(|_| anyhow!("Seed must be 32 bytes"))?;
    
    let registry = RegistryManager::new(&config.provider, &config.pricing).await?;
    registry.rotate_peer_id(new_seed).await?;
    
    println!("Peer ID rotated");
    Ok(())
}

/// Status command
#[derive(Args)]
pub struct StatusArgs {
    /// Output as JSON
    #[arg(long)]
    pub json: bool,
}

pub async fn status(args: StatusArgs, config_path: &str) -> Result<()> {
    let config = ProviderConfig::load(config_path)?;
    
    println!("QVAC Provider Status");
    println!("====================");
    println!("Name: {}", config.provider.name);
    println!("Authority: {}", config.provider.authority);
    println!("Task Types: 0x{:04x}", config.provider.task_types);
    println!("Verification Tier: {}", config.provider.verification_tier);
    println!("Region: {:?}", config.provider.region);
    println!("Max Concurrent: {}", config.provider.max_concurrent_sessions);
    println!("Chain: {} (ID: {})", config.provider.rpc_url, config.provider.chain_id);
    println!("Model Cache: {}", config.workload.model_cache_dir.display());
    println!("Backend: {}", config.workload.backend);
    println!("Pricing Base: {} @ {}", config.pricing.base_model_id, config.pricing.base_price_per_request);
    println!("Matching: {}", config.matching.endpoint);
    
    if args.json {
        println!("{}", serde_json::to_string_pretty(&config)?);
    }
    
    Ok(())
}

/// Probe command
#[derive(Args)]
pub struct ProbeArgs {
    /// Quick probe only
    #[arg(long)]
    pub quick: bool,
}

pub async fn probe(args: ProbeArgs, config_path: &str) -> Result<()> {
    let config = ProviderConfig::load(config_path)?;
    
    let prober = CapabilityProber::new(config.provider.clone(), config.workload.model_cache_dir.clone())?;
    
    if args.quick {
        let gpu = prober.quick_probe().await?;
        println!("GPU: {} ({}GB VRAM)", gpu.name, gpu.vram_gb);
        println!("Compute Capability: {}", gpu.compute_capability);
        println!("Driver: {}", gpu.driver_version);
    } else {
        let profile = prober.probe().await?;
        println!("Capability Profile:");
        println!("  GPU: {} ({}GB)", profile.gpu.name, profile.gpu.vram_gb);
        println!("  Tiers ({}):", profile.tiers.len());
        for tier in &profile.tiers {
            let status = if tier.passes { "✓" } else { "✗" };
            println!("    {} {} - TTFT: {}ms, TPS: {}, VRAM: {}GB, Backend: {}", 
                status, tier.model_id, tier.ttft_ms, tier.tps, tier.vram_usage_gb, tier.backend);
        }
        if let Some(tee) = profile.tee_attestation {
            println!("  TEE: {} (verified at {})", tee.tee_type, tee.verified_at);
        }
    }
    
    Ok(())
}

/// Test workload
#[derive(Args)]
pub struct TestWorkloadArgs {
    /// Model ID
    #[arg(long, default_value = "QWEN3_8B_INST_Q4_K_M")]
    pub model: String,
    
    /// Prompt tokens (comma-separated)
    #[arg(long, default_value = "1,2,3,4,5")]
    pub prompt: String,
}

pub async fn test_workload(args: TestWorkloadArgs, config_path: &str) -> Result<()> {
    let config = ProviderConfig::load(config_path)?;
    
    let runner = WorkloadRunner::new(config.workload.clone())?;
    
    let prompt_tokens: Vec<u32> = args.prompt.split(',')
        .map(|s| s.trim().parse())
        .collect::<Result<Vec<_>, _>>()?;
    
    let spec = WorkloadSpec {
        job_id: format!("test-{}", uuid::Uuid::now_v7()),
        model_id: args.model.clone(),
        model_path: config.workload.model_cache_dir.join(&args.model),
        prompt_tokens,
        config: InferenceConfig {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 100,
            stop_sequences: None,
            seed: None,
        },
        resources: config.workload.default_limits.clone(),
        verification_tier: config.provider.verification_tier,
        tee_session_id: None,
    };
    
    println!("Running test workload for model: {}", args.model);
    let result = runner.run_workload(spec).await?;
    
    println!("Completed in {}ms", result.duration_ms);
    println!("Tokens generated: {}", result.tokens.len());
    println!("TTFT: {}ms, TPS: {}", result.usage.ttft_ms, result.usage.tps);
    println!("Response hash: {}", result.response_hash);
    if let Some(att) = result.attestation {
        println!("Attestation: CPU cycles={}, Memory={}MB, Time={}ms", 
            att.cpu_cycles, att.memory_peak_mb, att.execution_time_ms);
    }
    
    Ok(())
}

/// Generate default config
#[derive(Args)]
pub struct GenConfigArgs {
    /// Output path
    #[arg(short, long, default_value = "qvac.config.json")]
    pub output: String,
    
    /// Force overwrite
    #[arg(short, long)]
    pub force: bool,
}

pub async fn gen_config(args: GenConfigArgs, _config_path: &str) -> Result<()> {
    let config = ProviderConfig::default_for_onboarding();
    
    if std::path::Path::new(&args.output).exists() && !args.force {
        return Err(anyhow!("File exists, use -f to overwrite"));
    }
    
    let json = serde_json::to_string_pretty(&config)?;
    std::fs::write(&args.output, json)?;
    
    println!("Generated config at: {}", args.output);
    println!("Edit the file to set your authority address, RPC URL, and Hyperswarm seed.");
    
    Ok(())
}