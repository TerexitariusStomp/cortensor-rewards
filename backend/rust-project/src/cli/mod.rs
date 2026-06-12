//! CLI Module - Command line interface for provider daemon
//!
///! Main CLI entry point

use clap::{Parser, Subcommand};
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

pub mod commands;
pub mod config;

pub use commands::*;
pub use config::*;

#[derive(Parser)]
#[command(name = "qvac-provider")]
#[command(version = env!("CARGO_PKG_VERSION"))]
#[command(about = "QVAC Compute Provider Daemon - Decentralized compute marketplace provider", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    /// Configuration file path
    #[arg(short, long, global = true, default_value = "qvac.config.json")]
    pub config: String,

    /// Log level
    #[arg(short, long, global = true, default_value = "info")]
    pub log_level: String,

    /// Log format (json, pretty)
    #[arg(long, global = true, default_value = "json")]
    pub log_format: String,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Start provider daemon (long-running)
    Start(StartArgs),
    
    /// Register provider on-chain
    Register(RegisterArgs),
    
    /// Update provider registration
    Update(UpdateArgs),
    
    /// Rotate peer ID (key rotation)
    RotatePeerId(RotatePeerIdArgs),
    
    /// Query provider status
    Status(StatusArgs),
    
    /// Run capability probe
    Probe(ProbeArgs),
    
    /// Test workload isolation
    TestWorkload(TestWorkloadArgs),
    
    /// Generate default configuration
    GenConfig(GenConfigArgs),
}

/// Initialize logging
pub fn init_logging(level: &str, format: &str) -> Result<(), Box<dyn std::error::Error>> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(level));

    let fmt = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_span_events(FmtSpan::CLOSE)
        .with_thread_ids(true);

    match format {
        "json" => fmt.json().init(),
        "pretty" => fmt.pretty().init(),
        _ => fmt.init(),
    }

    Ok(())
}

pub async fn run(cli: Cli) -> Result<(), Box<dyn std::error::Error>> {
    init_logging(&cli.log_level, &cli.log_format)?;

    match cli.command {
        Commands::Start(args) => commands::start(args, &cli.config).await,
        Commands::Register(args) => commands::register(args, &cli.config).await,
        Commands::Update(args) => commands::update(args, &cli.config).await,
        Commands::RotatePeerId(args) => commands::rotate_peer_id(args, &cli.config).await,
        Commands::Status(args) => commands::status(args, &cli.config).await,
        Commands::Probe(args) => commands::probe(args, &cli.config).await,
        Commands::TestWorkload(args) => commands::test_workload(args, &cli.config).await,
        Commands::GenConfig(args) => commands::gen_config(args, &cli.config).await,
    }
}