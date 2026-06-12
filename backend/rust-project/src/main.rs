//! QVAC Provider Daemon - Main Entry Point

mod cli;
mod config;
mod registry;
mod prober;
mod p2p;
mod firewall;
mod workload;
mod attestation;
mod settlement;

use anyhow::Result;
use clap::Parser;
use tokio::signal;

use cli::{Cli, init_logging, run};

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    
    // Initialize logging early
    init_logging(&cli.log_level, &cli.log_format)?;
    
    // Run the CLI
    run(cli).await
}