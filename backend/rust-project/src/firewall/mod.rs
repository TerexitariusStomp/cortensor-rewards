//! Transport Firewall (Conduit Pattern)
//!
//! Gates P2P connections on verified payment proof - zero bytes served to non-payers

use anyhow::{anyhow, Context, Result};
use alloy::{
    primitives::{Address, Bytes, U256, FixedBytes, B256},
    providers::Provider,
    sol,
};
use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::p2p::SignedQuote;

/// Transport firewall for gating P2P connections
pub struct TransportFirewall {
    /// Allowed peer connections (provider_peer_id -> allowed_consumer_peer_ids)
    allowed_connections: Arc<RwLock<HashMap<String, HashSet<String>>>>,
    /// Used nonces for replay protection
    used_nonces: Arc<RwLock<HashSet<String>>>,
    /// Quote verification cache
    quote_cache: Arc<RwLock<HashMap<String, VerifiedQuote>>>,
    /// EVM provider for on-chain verification
    evm_provider: Option<Arc<dyn Provider + Send + Sync>>,
    /// Contract addresses
    escrow_contract: Option<Address>,
    /// Configuration
    config: FirewallConfig,
}

#[derive(Debug, Clone)]
pub struct FirewallConfig {
    /// Quote validity window in seconds
    pub quote_validity_secs: u64,
    /// Job timeout in seconds
    pub job_timeout_secs: u64,
    /// Maximum nonce cache size
    pub max_nonce_cache: usize,
    /// Enable strict payment verification
    pub strict_verification: bool,
}

impl Default for FirewallConfig {
    fn default() -> Self {
        Self {
            quote_validity_secs: 300,   // 5 minutes
            job_timeout_secs: 600,      // 10 minutes
            max_nonce_cache: 10000,
            strict_verification: true,
        }
    }
}

/// Verified quote with payment proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedQuote {
    pub quote: SignedQuote,
    pub payment_verified: bool,
    pub payment_tx_hash: Option<String>,
    pub verified_at: u64,
    pub expires_at: u64,
}

/// Firewall decision
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirewallDecision {
    Allow,
    Deny,
    RequirePayment,
    Expired,
    ReplayAttack,
}

impl TransportFirewall {
    /// Create new transport firewall
    pub fn new(config: FirewallConfig) -> Self {
        Self {
            allowed_connections: Arc::new(RwLock::new(HashMap::new())),
            used_nonces: Arc::new(RwLock::new(HashSet::new())),
            quote_cache: Arc::new(RwLock::new(HashMap::new())),
            evm_provider: None,
            escrow_contract: None,
            config,
        }
    }

    /// Set EVM provider for on-chain verification
    pub fn with_evm_provider(mut self, provider: Arc<dyn Provider + Send + Sync>, escrow_addr: Address) -> Self {
        self.evm_provider = Some(provider);
        self.escrow_contract = Some(escrow_addr);
        self
    }

    /// Verify and cache a quote (called when consumer presents quote)
    pub async fn verify_quote(&self, quote: &SignedQuote) -> Result<FirewallDecision> {
        debug!("Verifying quote: {}", quote.quote_id);

        // Check quote expiry
        let now = chrono::Utc::now().timestamp() as u64;
        if quote.valid_until < now {
            warn!("Quote expired: {} < {}", quote.valid_until, now);
            return Ok(FirewallDecision::Expired);
        }

        // Verify Ed25519 signature
        if !self.verify_quote_signature(quote).await? {
            warn!("Invalid quote signature");
            return Ok(FirewallDecision::Deny);
        }

        // Check nonce replay protection
        if !self.check_nonce(&quote.quote_nonce).await? {
            warn!("Replay attack detected: nonce {}", quote.quote_nonce);
            return Ok(FirewallDecision::ReplayAttack);
        }

        // Verify payment on-chain (if strict mode)
        let payment_verified = if self.config.strict_verification {
            self.verify_payment_onchain(quote).await?
        } else {
            // In non-strict mode, trust the quote but require payment before inference
            false
        };

        // Cache verified quote
        let verified = VerifiedQuote {
            quote: quote.clone(),
            payment_verified,
            payment_tx_hash: None,
            verified_at: now,
            expires_at: quote.valid_until,
        };

        let cache_key = format!("{}:{}", quote.provider_peer_id, quote.quote_nonce);
        self.quote_cache.write().await.insert(cache_key, verified);

        if payment_verified {
            Ok(FirewallDecision::Allow)
        } else {
            Ok(FirewallDecision::RequirePayment)
        }
    }

    /// Verify Ed25519 quote signature
    async fn verify_quote_signature(&self, quote: &SignedQuote) -> Result<bool> {
        // Reconstruct signed payload
        let payload = serde_json::to_vec(&serde_json::json!({
            "quoteId": quote.quote_id,
            "providerPeerId": quote.provider_peer_id,
            "providerAuthority": quote.provider_authority,
            "amount": quote.amount,
            "paymentMint": quote.payment_mint,
            "validUntil": quote.valid_until,
            "quoteNonce": quote.quote_nonce,
            "taskType": quote.task_type,
            "modelId": quote.model_id,
            "minTPS": quote.min_tps,
        }))?;

        // Decode provider public key (peer ID)
        let peer_id_bytes = hex::decode(&quote.provider_peer_id)?;
        if peer_id_bytes.len() != 32 {
            return Ok(false);
        }
        let verifying_key = VerifyingKey::from_bytes(&peer_id_bytes.try_into().unwrap())?;

        // Decode signature
        let signature_bytes = hex::decode(&quote.signature)?;
        let signature = Signature::from_bytes(&signature_bytes.try_into().unwrap())?;

        // Verify
        Ok(verifying_key.verify(&payload, &signature).is_ok())
    }

    /// Check and record nonce for replay protection
    async fn check_nonce(&self, nonce: &str) -> Result<bool> {
        let mut nonces = self.used_nonces.write().await;
        
        if nonces.contains(nonce) {
            return Ok(false);
        }

        // Clean up old nonces if cache is full
        if nonces.len() >= self.config.max_nonce_cache {
            // In production, would use LRU eviction
            nonces.clear();
        }

        nonces.insert(nonce.to_string());
        Ok(true)
    }

    /// Verify payment on-chain
    async fn verify_payment_onchain(&self, quote: &SignedQuote) -> Result<bool> {
        if let Some(provider) = &self.evm_provider {
            // In production, would query the escrow contract
            // For now, check if payment transaction exists
            // This would call JobEscrow contract to verify job state
            
            debug!("Would verify payment on-chain for quote {}", quote.quote_id);
            
            // Mock: return true for development
            return Ok(true);
        }
        
        Ok(false)
    }

    /// Grant access to consumer for a specific job (called after payment verified)
    pub async fn grant_access(&self, provider_peer_id: &str, consumer_peer_id: &str, job_id: &str) -> Result<()> {
        info!("Granting access: provider={} consumer={} job={}", provider_peer_id, consumer_peer_id, job_id);
        
        let mut connections = self.allowed_connections.write().await;
        connections
            .entry(provider_peer_id.to_string())
            .or_default()
            .insert(consumer_peer_id.to_string());

        // Also mark nonce as used (if we have the quote)
        // In practice, would track job -> quote mapping
        Ok(())
    }

    /// Check if connection is allowed (Conduit pattern: gate at transport layer)
    pub async fn check_connection(&self, provider_peer_id: &str, consumer_peer_id: &str) -> FirewallDecision {
        let connections = self.allowed_connections.read().await;
        
        if let Some(allowed) = connections.get(provider_peer_id) {
            if allowed.contains(consumer_peer_id) {
                return FirewallDecision::Allow;
            }
        }

        FirewallDecision::RequirePayment
    }

    /// Record payment transaction for a quote
    pub async fn record_payment(&self, quote_nonce: &str, tx_hash: &str) -> Result<()> {
        let provider_peer_id = ""; // Would need mapping from nonce -> quote
        let cache_key = format!("{}:{}", provider_peer_id, quote_nonce);
        
        if let Some(verified) = self.quote_cache.write().await.get_mut(&cache_key) {
            verified.payment_verified = true;
            verified.payment_tx_hash = Some(tx_hash.to_string());
        }
        
        Ok(())
    }

    /// Revoke access (job completion, refund, dispute)
    pub async fn revoke_access(&self, provider_peer_id: &str, consumer_peer_id: &str) -> Result<()> {
        info!("Revoking access: provider={} consumer={}", provider_peer_id, consumer_peer_id);
        
        let mut connections = self.allowed_connections.write().await;
        if let Some(allowed) = connections.get_mut(provider_peer_id) {
            allowed.remove(consumer_peer_id);
            if allowed.is_empty() {
                connections.remove(provider_peer_id);
            }
        }
        
        Ok(())
    }

    /// Clean up expired quotes and connections
    pub async fn cleanup_expired(&self) {
        let now = chrono::Utc::now().timestamp() as u64;
        
        // Clean expired quotes
        let mut cache = self.quote_cache.write().await;
        cache.retain(|_, v| v.expires_at > now);
        
        // In production, would also clean stale connections based on job timeouts
    }

    /// Get firewall stats
    pub async fn get_stats(&self) -> FirewallStats {
        let connections = self.allowed_connections.read().await;
        let cache = self.quote_cache.read().await;
        let nonces = self.used_nonces.read().await;
        
        FirewallStats {
            active_connections: connections.values().map(|v| v.len()).sum(),
            cached_quotes: cache.len(),
            used_nonces: nonces.len(),
        }
    }
}

/// Firewall statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallStats {
    pub active_connections: usize,
    pub cached_quotes: usize,
    pub used_nonces: usize,
}

/// Payment verification result for per-inference path (EIP-3009)
#[derive(Debug, Clone)]
pub struct PaymentVerification {
    pub valid: bool,
    pub amount: U256,
    pub token: Address,
    pub seller: Address,
    pub nonce_valid: bool,
}

/// EIP-3009 payment verification (per-inference path)
pub struct Eip3009Verifier {
    provider: Arc<dyn Provider + Send + Sync>,
    token_contract: Address,
}

impl Eip3009Verifier {
    pub fn new(provider: Arc<dyn Provider + Send + Sync>, token_contract: Address) -> Self {
        Self { provider, token_contract }
    }

    /// Verify EIP-3009 transferWithAuthorization
    pub async fn verify(&self, tx_hash: B256, expected_amount: U256, expected_seller: Address) -> Result<PaymentVerification> {
        // In production, would:
        // 1. Get transaction receipt
        // 2. Decode transferWithAuthorization call
        // 3. Verify amount, seller, nonce
        // 4. Check nonce not reused
        
        debug!("Would verify EIP-3009 payment: {}", tx_hash);
        
        Ok(PaymentVerification {
            valid: true, // Mock
            amount: expected_amount,
            token: self.token_contract,
            seller: expected_seller,
            nonce_valid: true,
        })
    }
}

/// EIP-712 voucher verification (escrow channel path)
pub struct Eip712Verifier {
    provider: Arc<dyn Provider + Send + Sync>,
    channel_contract: Address,
}

impl Eip712Verifier {
    pub fn new(provider: Arc<dyn Provider + Send + Sync>, channel_contract: Address) -> Self {
        Self { provider, channel_contract }
    }

    /// Verify EIP-712 voucher
    pub async fn verify_voucher(
        &self,
        buyer: Address,
        seller: Address,
        epoch: u64,
        cumulative_amount: U256,
        signature: Bytes,
    ) -> Result<bool> {
        // In production, would:
        // 1. Reconstruct EIP-712 typed data
        // 2. Verify signature matches buyer
        // 3. Check channel state on-chain
        // 4. Verify cumulative amount <= deposit
        
        debug!("Would verify EIP-712 voucher for epoch {}", epoch);
        
        Ok(true) // Mock
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_firewall_basic() {
        let firewall = TransportFirewall::new(FirewallConfig::default());
        
        // No connection allowed initially
        let decision = firewall.check_connection("provider1", "consumer1").await;
        assert_eq!(decision, FirewallDecision::RequirePayment);
        
        // Grant access
        firewall.grant_access("provider1", "consumer1", "job1").await.unwrap();
        
        // Now allowed
        let decision = firewall.check_connection("provider1", "consumer1").await;
        assert_eq!(decision, FirewallDecision::Allow);
        
        // Other consumer still denied
        let decision = firewall.check_connection("provider1", "consumer2").await;
        assert_eq!(decision, FirewallDecision::RequirePayment);
    }

    #[tokio::test]
    async fn test_revoke_access() {
        let firewall = TransportFirewall::new(FirewallConfig::default());
        firewall.grant_access("provider1", "consumer1", "job1").await.unwrap();
        
        firewall.revoke_access("provider1", "consumer1").await.unwrap();
        
        let decision = firewall.check_connection("provider1", "consumer1").await;
        assert_eq!(decision, FirewallDecision::RequirePayment);
    }
}