//! QVAC Provider Daemon Library
//!
//! Decentralized compute marketplace provider integration layer

pub mod cli;
pub mod config;
pub mod registry;
pub mod prober;
pub mod p2p;
pub mod firewall;
pub mod workload;
pub mod attestation;
pub mod settlement;

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Re-export commonly used types
pub use config::ProviderConfig;
pub use registry::{RegistryManager, RegistryClient, CapabilityProfile, ProviderRegistration, ProviderInfo};
pub use prober::CapabilityProber;
pub use p2p::{P2PClient, SignedQuote, QuoteRequest, JobCreatedNotice, MarketMessage, QuoteMessage};
pub use firewall::{TransportFirewall, FirewallDecision, VerifiedQuote};
pub use workload::{WorkloadRunner, WorkloadSpec, WorkloadResult, WorkloadBackend, InferenceConfig};
pub use attestation::AttestationStreamer;
pub use settlement::{SettlementClient, PendingClaim, PaymentMode, ClaimStatus};