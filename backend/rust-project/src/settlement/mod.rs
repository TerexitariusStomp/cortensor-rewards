//! Settlement Layer - Payment Claiming
//!
//! Claims payment on job completion via EIP-3009 (per-inference) or EIP-712 (escrow channel)

use anyhow::{anyhow, Context, Result};
use alloy::{
    network::EthereumWallet,
    primitives::{Address, Bytes, U256, B256, FixedBytes},
    providers::{Provider, ProviderBuilder, RootProvider},
    signers::local::PrivateKeySigner,
    sol,
    transports::http::reqwest::Url,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, mpsc};
use tokio::time::interval;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

use crate::config::SettlementConfig;
use crate::p2p::JobCreatedNotice;
use crate::firewall::{Eip3009Verifier, Eip712Verifier, PaymentVerification};

/// Settlement client for claiming payments
pub struct SettlementClient {
    config: SettlementConfig,
    evm_provider: Option<RootProvider>,
    evm_wallet: Option<EthereumWallet>,
    escrow_contract: Option<Address>,
    channel_contract: Option<Address>,
    token_contract: Option<Address>,
    eip3009_verifier: Option<Eip3009Verifier>,
    eip712_verifier: Option<Eip712Verifier>,
    
    // Pending claims
    pending_claims: Arc<RwLock<HashMap<String, PendingClaim>>>,
    claimed_jobs: Arc<RwLock<HashSet<String>>>,
    
    // Metrics
    metrics: Arc<SettlementMetrics>,
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
}

/// Pending payment claim
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingClaim {
    pub job_id: String,
    pub job_pda: String,
    pub amount: U256,
    pub payment_mode: PaymentMode,
    pub created_at: u64,
    pub attempts: u32,
    pub last_attempt: Option<u64>,
    pub status: ClaimStatus,
}

/// Payment mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentMode {
    PerInference,
    EscrowChannel,
}

/// Claim status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaimStatus {
    Pending,
    Submitted,
    Confirmed,
    Failed,
    Expired,
}

/// Settlement metrics
#[derive(Debug, Default)]
pub struct SettlementMetrics {
    claims_submitted: std::sync::atomic::AtomicU64,
    claims_confirmed: std::sync::atomic::AtomicU64,
    claims_failed: std::sync::atomic::AtomicU64,
    total_claimed: std::sync::atomic::AtomicU128,
    last_claim_time: std::sync::atomic::AtomicU64,
}

impl SettlementMetrics {
    pub fn get(&self) -> SettlementMetricsSnapshot {
        SettlementMetricsSnapshot {
            claims_submitted: self.claims_submitted.load(std::sync::atomic::Ordering::Relaxed),
            claims_confirmed: self.claims_confirmed.load(std::sync::atomic::Ordering::Relaxed),
            claims_failed: self.claims_failed.load(std::sync::atomic::Ordering::Relaxed),
            total_claimed: self.total_claimed.load(std::sync::atomic::Ordering::Relaxed),
            last_claim_time: self.last_claim_time.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
}

/// Metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementMetricsSnapshot {
    pub claims_submitted: u64,
    pub claims_confirmed: u64,
    pub claims_failed: u64,
    pub total_claimed: u128,
    pub last_claim_time: u64,
}

impl SettlementClient {
    /// Create new settlement client
    pub async fn new(config: SettlementConfig) -> Result<Self> {
        let (shutdown_tx, _) = tokio::sync::broadcast::channel(1);
        
        Ok(Self {
            config,
            evm_provider: None,
            evm_wallet: None,
            escrow_contract: None,
            channel_contract: None,
            token_contract: None,
            eip3009_verifier: None,
            eip712_verifier: None,
            pending_claims: Arc::new(RwLock::new(HashMap::new())),
            claimed_jobs: Arc::new(RwLock::new(HashSet::new())),
            metrics: Arc::new(SettlementMetrics::default()),
            shutdown_tx,
        })
    }

    /// Configure with EVM provider and contract addresses
    pub fn with_evm_config(
        mut self,
        rpc_url: &str,
        private_key: &str,
        escrow_contract: Address,
        channel_contract: Option<Address>,
        token_contract: Address,
        chain_id: u64,
    ) -> Result<Self> {
        let url: Url = rpc_url.parse()?;
        let signer: PrivateKeySigner = private_key.parse()?;
        let wallet = EthereumWallet::from(signer);
        let provider = ProviderBuilder::new()
            .wallet(wallet.clone())
            .on_http(url);

        self.evm_provider = Some(provider.clone());
        self.evm_wallet = Some(wallet);
        self.escrow_contract = Some(escrow_contract);
        self.channel_contract = channel_contract;
        self.token_contract = Some(token_contract);
        
        // Create verifiers
        self.eip3009_verifier = Some(Eip3009Verifier::new(provider.clone(), token_contract));
        if let Some(channel) = channel_contract {
            self.eip712_verifier = Some(Eip712Verifier::new(provider, channel));
        }

        Ok(self)
    }

    /// Start settlement claim loop
    pub async fn start(&mut self) -> Result<()> {
        if !self.config.auto_claim {
            info!("Auto-claim disabled, settlement client running in manual mode");
            return Ok(());
        }

        let interval_secs = self.config.claim_interval_secs;
        let pending_claims = self.pending_claims.clone();
        let claimed_jobs = self.claimed_jobs.clone();
        let metrics = self.metrics.clone();
        let provider = self.evm_provider.clone();
        let wallet = self.evm_wallet.clone();
        let escrow = self.escrow_contract;
        let channel = self.channel_contract;
        let min_claim = self.config.min_claim_amount.clone();
        let gas_strategy = self.config.gas_strategy.clone();
        let max_gas_price = self.config.max_gas_price.clone();
        let mut shutdown = self.shutdown_tx.subscribe();

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(interval_secs));
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        // Process pending claims
                        let claims_to_process: Vec<PendingClaim> = {
                            let claims = pending_claims.read().await;
                            claims.values()
                                .filter(|c| c.status == ClaimStatus::Pending || c.status == ClaimStatus::Failed)
                                .cloned()
                                .collect()
                        };

                        for claim in claims_to_process {
                            if let Err(e) = Self::process_claim(
                                &claim,
                                &provider,
                                &wallet,
                                escrow,
                                channel,
                                &min_claim,
                                &gas_strategy,
                                &max_gas_price,
                                &pending_claims,
                                &claimed_jobs,
                                &metrics,
                            ).await {
                                error!("Failed to process claim for job {}: {}", claim.job_id, e);
                            }
                        }
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });

        // Also spawn cleanup task for expired claims
        Self::spawn_cleanup_task(pending_claims.clone(), claimed_jobs.clone(), self.shutdown_tx.subscribe());

        Ok(())
    }

    /// Process a single claim
    async fn process_claim(
        claim: &PendingClaim,
        provider: &Option<RootProvider>,
        _wallet: &Option<EthereumWallet>,
        escrow_contract: Option<Address>,
        channel_contract: Option<Address>,
        min_claim: &str,
        gas_strategy: &str,
        max_gas_price: &Option<String>,
        pending_claims: &Arc<RwLock<HashMap<String, PendingClaim>>>,
        claimed_jobs: &Arc<RwLock<HashSet<String>>>,
        metrics: &Arc<SettlementMetrics>,
    ) -> Result<()> {
        // Check minimum claim amount
        let min_amount = U256::from_str_radix(min_claim, 10)?;
        if claim.amount < min_amount {
            info!("Claim amount {} below minimum {}, skipping", claim.amount, min_amount);
            return Ok(());
        }

        // Check if already claimed
        if claimed_jobs.read().await.contains(&claim.job_id) {
            info!("Job {} already claimed, skipping", claim.job_id);
            return Ok(());
        }

        info!("Processing claim for job {}: {}", claim.job_id, claim.amount);

        // Update claim status
        {
            let mut claims = pending_claims.write().await;
            if let Some(c) = claims.get_mut(&claim.job_id) {
                c.status = ClaimStatus::Submitted;
                c.attempts += 1;
                c.last_attempt = Some(current_timestamp());
            }
        }

        let tx_hash = match claim.payment_mode {
            PaymentMode::PerInference => {
                Self::claim_per_inference(claim, provider, escrow_contract, gas_strategy, max_gas_price).await?
            }
            PaymentMode::EscrowChannel => {
                Self::claim_escrow_channel(claim, provider, channel_contract, gas_strategy, max_gas_price).await?
            }
        };

        // Mark as confirmed
        {
            let mut claims = pending_claims.write().await;
            if let Some(c) = claims.get_mut(&claim.job_id) {
                c.status = ClaimStatus::Confirmed;
            }
            claimed_jobs.write().await.insert(claim.job_id.clone());
        }

        metrics.claims_confirmed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        metrics.total_claimed.fetch_add(claim.amount.as_u128(), std::sync::atomic::Ordering::Relaxed);
        metrics.last_claim_time.store(current_timestamp(), std::sync::atomic::Ordering::Relaxed);

        info!("Claim confirmed for job {}: tx {}", claim.job_id, tx_hash);
        Ok(())
    }

    /// Claim via per-inference path (EIP-3009)
    async fn claim_per_inference(
        claim: &PendingClaim,
        provider: &Option<RootProvider>,
        escrow_contract: Option<Address>,
        _gas_strategy: &str,
        _max_gas_price: &Option<String>,
    ) -> Result<String> {
        // In production, would call JobEscrow.providerComplete with response hash
        // Then call JobEscrow.consumerConfirm or anyoneConfirm after window
        
        debug!("Would claim per-inference for job {} via escrow {}", claim.job_id, 
            escrow_contract.map(|a| a.to_string()).unwrap_or_else(|| "unknown".to_string()));
        
        // Mock transaction hash
        Ok(format!("0x{}", hex::encode([0u8; 32])))
    }

    /// Claim via escrow channel path (EIP-712)
    async fn claim_escrow_channel(
        claim: &PendingClaim,
        provider: &Option<RootProvider>,
        channel_contract: Option<Address>,
        _gas_strategy: &str,
        _max_gas_price: &Option<String>,
    ) -> Result<String> {
        // In production, would submit batched vouchers to channel contract
        
        debug!("Would claim escrow channel for job {} via channel {}", claim.job_id,
            channel_contract.map(|a| a.to_string()).unwrap_or_else(|| "unknown".to_string()));
        
        Ok(format!("0x{}", hex::encode([1u8; 32])))
    }

    /// Submit a new claim (called when job completes)
    pub async fn submit_claim(
        &self,
        job_id: String,
        job_pda: String,
        amount: U256,
        payment_mode: PaymentMode,
    ) -> Result<()> {
        if self.claimed_jobs.read().await.contains(&job_id) {
            return Err(anyhow!("Job {} already claimed", job_id));
        }

        let claim = PendingClaim {
            job_id: job_id.clone(),
            job_pda,
            amount,
            payment_mode,
            created_at: current_timestamp(),
            attempts: 0,
            last_attempt: None,
            status: ClaimStatus::Pending,
        };

        self.pending_claims.write().await.insert(job_id, claim);
        self.metrics.claims_submitted.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        info!("Submitted claim for job");
        Ok(())
    }

    /// Manually trigger claim for a job
    pub async fn claim_now(&self, job_id: &str) -> Result<String> {
        let claim = {
            let claims = self.pending_claims.read().await;
            claims.get(job_id).cloned()
        };

        let Some(claim) = claim else {
            return Err(anyhow!("No pending claim for job {}", job_id));
        };

        Self::process_claim(
            &claim,
            &self.evm_provider,
            &self.evm_wallet,
            self.escrow_contract,
            self.channel_contract,
            &self.config.min_claim_amount,
            &self.config.gas_strategy,
            &self.config.max_gas_price,
            &self.pending_claims,
            &self.claimed_jobs,
            &self.metrics,
        ).await?;

        Ok("claimed".to_string())
    }

    /// Verify payment for a job (per-inference path)
    pub async fn verify_payment(
        &self,
        job_id: &str,
        tx_hash: B256,
        expected_amount: U256,
        expected_seller: Address,
    ) -> Result<PaymentVerification> {
        if let Some(verifier) = &self.eip3009_verifier {
            return verifier.verify(tx_hash, expected_amount, expected_seller).await;
        }
        
        Err(anyhow!("EIP-3009 verifier not configured"))
    }

    /// Verify EIP-712 voucher (escrow channel path)
    pub async fn verify_voucher(
        &self,
        buyer: Address,
        seller: Address,
        epoch: u64,
        cumulative_amount: U256,
        signature: Bytes,
    ) -> Result<bool> {
        if let Some(verifier) = &self.eip712_verifier {
            return verifier.verify_voucher(buyer, seller, epoch, cumulative_amount, signature).await;
        }
        
        Err(anyhow!("EIP-712 verifier not configured"))
    }

    /// Cleanup expired claims
    fn spawn_cleanup_task(
        pending_claims: Arc<RwLock<HashMap<String, PendingClaim>>>,
        claimed_jobs: Arc<RwLock<HashSet<String>>>,
        mut shutdown: tokio::sync::broadcast::Receiver<()>,
    ) {
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(300)); // 5 minutes
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let now = current_timestamp();
                        let mut claims = pending_claims.write().await;
                        
                        // Remove claims older than 1 hour with failed status
                        claims.retain(|_, claim| {
                            if claim.status == ClaimStatus::Failed && 
                               claim.last_attempt.map(|t| now - t > 3600).unwrap_or(false) {
                                false
                            } else {
                                true
                            }
                        });
                        
                        // Cleanup claimed jobs older than 24 hours
                        let mut claimed = claimed_jobs.write().await;
                        // In production, would track timestamps
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });
    }

    /// Get pending claims
    pub async fn get_pending_claims(&self) -> Vec<PendingClaim> {
        self.pending_claims.read().await.values().cloned().collect()
    }

    /// Get claim status
    pub async fn get_claim_status(&self, job_id: &str) -> Option<ClaimStatus> {
        self.pending_claims.read().await.get(job_id).map(|c| c.status)
    }

    /// Get metrics
    pub fn metrics(&self) -> SettlementMetricsSnapshot {
        self.metrics.get()
    }

    /// Shutdown
    pub async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }
}

/// Get current timestamp
fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Solana settlement client (for Solana deployment)
pub struct SolanaSettlementClient {
    // Would use solana-client and anchor-client
    rpc_url: String,
    program_id: String,
}

impl SolanaSettlementClient {
    pub async fn new(rpc_url: &str, program_id: &str) -> Result<Self> {
        Ok(Self {
            rpc_url: rpc_url.to_string(),
            program_id: program_id.to_string(),
        })
    }

    pub async fn claim_job(&self, job_pda: &str, response_hash: [u8; 32]) -> Result<String> {
        // Would call JobEscrowProgram.providerComplete
        info!("Would claim Solana job: {}", job_pda);
        Ok("solana_tx_hash".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::U256;

    #[tokio::test]
    async fn test_settlement_client_creation() {
        let config = SettlementConfig::default();
        let client = SettlementClient::new(config).await.unwrap();
        
        let claims = client.get_pending_claims().await;
        assert!(claims.is_empty());
    }

    #[tokio::test]
    async fn test_submit_claim() {
        let config = SettlementConfig::default();
        let client = SettlementClient::new(config).await.unwrap();
        
        client.submit_claim(
            "job1".to_string(),
            "pda1".to_string(),
            U256::from(1_000_000),
            PaymentMode::PerInference,
        ).await.unwrap();
        
        let claims = client.get_pending_claims().await;
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].job_id, "job1");
        assert_eq!(claims[0].status, ClaimStatus::Pending);
    }
}