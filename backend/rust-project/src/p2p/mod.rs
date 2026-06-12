//! P2P Networking via Hyperswarm/HyperDHT
//!
//! Implements market discovery, quote channels, and inference streams
//! following the Conduit/QVAC patterns

use anyhow::{anyhow, Context, Result};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey, Signature};
use futures::{SinkExt, StreamExt};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock, broadcast};
use tokio::time::interval;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

use crate::config::{P2PConfig, ProviderSettings};
use crate::registry::CapabilityProfile;

/// P2P message types for market discovery topic
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MarketMessage {
    #[serde(rename = "provider_announce")]
    ProviderAnnounce { provider: ProviderAnnounce },
    #[serde(rename = "provider_update")]
    ProviderUpdate { provider: ProviderUpdate },
    #[serde(rename = "provider_withdraw")]
    ProviderWithdraw { provider_peer_id: String },
    #[serde(rename = "consumer_query")]
    ConsumerQuery { filter: ConsumerQueryFilter },
    #[serde(rename = "query_response")]
    QueryResponse { providers: Vec<ProviderSummary> },
}

/// Provider announcement for market discovery
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAnnounce {
    pub peer_id: String,
    pub name: String,
    pub task_types: u16,
    pub tiers: Vec<PricingTierSummary>,
    pub capability_profile_cid: Option<String>,
    pub reputation: ReputationSummary,
    pub region: Option<String>,
    pub timestamp: u64,
    pub signature: String,
}

/// Provider update message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUpdate {
    pub peer_id: String,
    pub name: Option<String>,
    pub task_types: Option<u16>,
    pub tiers: Option<Vec<PricingTierSummary>>,
    pub reputation: Option<ReputationSummary>,
    pub timestamp: u64,
    pub signature: String,
}

/// Pricing tier summary for announcements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingTierSummary {
    pub model_id: String,
    pub price_per_request: String,
    pub min_tps: u32,
}

/// Reputation summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationSummary {
    pub jobs_completed: u64,
    pub total_earned: String,
    pub avg_rating: f32,
}

/// Consumer query filter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerQueryFilter {
    pub task_types: Option<u16>,
    pub model_id: Option<String>,
    pub max_price: Option<String>,
    pub min_tps: Option<u32>,
    pub region: Option<String>,
    pub verification_tier: Option<u8>,
}

/// Provider summary for query responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSummary {
    pub peer_id: String,
    pub authority: String,
    pub name: String,
    pub task_types: u16,
    pub tiers: Vec<PricingTierSummary>,
    pub reputation: ReputationSummary,
    pub region: Option<String>,
    pub online: bool,
    pub last_seen: u64,
}

/// Quote messages for per-provider quote topic
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum QuoteMessage {
    #[serde(rename = "quote_request")]
    QuoteRequest { request: QuoteRequest },
    #[serde(rename = "quote_response")]
    QuoteResponse { quote: SignedQuote },
    #[serde(rename = "quote_rejected")]
    QuoteRejected { reason: String },
    #[serde(rename = "job_created")]
    JobCreated { job: JobCreatedNotice },
    #[serde(rename = "job_ack")]
    JobAck { job_id: String },
    #[serde(rename = "response_observed")]
    ResponseObserved { job_id: String, response_hash: String },
    #[serde(rename = "provider_complete")]
    ProviderComplete { job_id: String, response_hash: String, tee_quote: Option<String> },
    #[serde(rename = "consumer_confirm")]
    ConsumerConfirm { job_id: String, tx_hash: String },
    #[serde(rename = "refund")]
    Refund { job_id: String, tx_hash: String },
    #[serde(rename = "dispute")]
    Dispute { job_id: String, evidence_cid: String },
}

/// Quote request from consumer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteRequest {
    pub request_id: String,
    pub consumer_peer_id: String,
    pub consumer_address: String,
    pub task_type: u8,
    pub model_id: Option<String>,
    pub prompt_hash: String,
    pub max_price: Option<String>,
    pub verification_tier: u8,
    pub timestamp: u64,
    pub signature: String,
}

/// Signed quote from provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedQuote {
    pub quote_id: String,
    pub provider_peer_id: String,
    pub provider_authority: String,
    pub amount: String,
    pub payment_mint: String,
    pub valid_until: u64,
    pub quote_nonce: String,
    pub task_type: u8,
    pub model_id: String,
    pub min_tps: u32,
    pub signature: String,
}

/// Job created notice
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobCreatedNotice {
    pub job_id: String,
    pub job_pda: String,
    pub request_hash: String,
    pub amount: String,
    pub consumer_address: String,
    pub provider_authority: String,
    pub created_at: u64,
}

/// Inference stream messages (line-delimited JSON over Noise)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InferenceMessage {
    #[serde(rename = "prompt")]
    Prompt { tokens: Vec<u32>, config: InferenceConfig },
    #[serde(rename = "token")]
    Token { token: u32, logprob: Option<f32> },
    #[serde(rename = "done")]
    Done { usage: UsageStats, response_hash: String },
    #[serde(rename = "error")]
    Error { code: String, message: String },
    #[serde(rename = "ack")]
    Ack { message_id: String },
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

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub ttft_ms: u32,
    pub tps: u32,
}

/// P2P client for provider daemon
pub struct P2PClient {
    config: P2PConfig,
    settings: ProviderSettings,
    signing_key: SigningKey,
    peer_id: [u8; 32],
    
    // Market topic
    market_peers: Arc<RwLock<HashMap<String, ProviderSummary>>>,
    market_sender: Option<mpsc::UnboundedSender<MarketMessage>>,
    
    // Quote topic (per-provider)
    quote_sender: Option<mpsc::UnboundedSender<QuoteMessage>>,
    quote_receiver: mpsc::UnboundedReceiver<QuoteMessage>,
    
    // Inference connections
    active_sessions: Arc<RwLock<HashMap<String, InferenceSession>>>,
    
    // Shutdown signal
    shutdown_tx: broadcast::Sender<()>,
    
    // Metrics
    announcements_sent: Arc<std::sync::atomic::AtomicU64>,
    quotes_sent: Arc<std::sync::atomic::AtomicU64>,
}

#[derive(Debug, Clone)]
struct InferenceSession {
    job_id: String,
    consumer_peer_id: String,
    started_at: Instant,
    tokens_sent: u32,
}

impl P2PClient {
    /// Create new P2P client
    pub async fn new(
        config: P2PConfig,
        settings: ProviderSettings,
        seed: [u8; 32],
    ) -> Result<Self> {
        // Derive signing key from seed
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();
        let peer_id = verifying_key.to_bytes();

        let (quote_tx, quote_rx) = mpsc::unbounded_channel();
        let (shutdown_tx, _) = broadcast::channel(1);

        Ok(Self {
            config,
            settings,
            signing_key,
            peer_id,
            market_peers: Arc::new(RwLock::new(HashMap::new())),
            market_sender: None,
            quote_sender: Some(quote_tx),
            quote_receiver: quote_rx,
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx,
            announcements_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            quotes_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        })
    }

    /// Get peer ID as hex string
    pub fn peer_id_hex(&self) -> String {
        hex::encode(self.peer_id)
    }

    /// Get public key as hex string
    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    /// Start P2P networking
    pub async fn start(&mut self) -> Result<()> {
        info!("Starting P2P client with peer ID: {}", self.peer_id_hex());

        // In production, this would connect to Hyperswarm DHT
        // For now, simulate with mock implementation
        
        // Start market discovery
        self.start_market_discovery().await?;
        
        // Start quote topic listener
        self.start_quote_listener().await?;

        // Start heartbeat announcements
        self.start_heartbeat().await?;

        Ok(())
    }

    /// Start market discovery (announce on compute:market:v1 topic)
    async fn start_market_discovery(&mut self) -> Result<()> {
        // In production, would join Hyperswarm topic
        // SHA256("compute:market:v1")
        let topic = Self::market_topic();
        info!("Joining market topic: {}", topic);

        // Mock: register local announcement handler
        let (tx, mut rx) = mpsc::unbounded_channel();
        self.market_sender = Some(tx);

        // Spawn announcement loop
        let peers = self.market_peers.clone();
        let announce_interval = self.config.announce_interval_ms;
        let shutdown = self.shutdown_tx.subscribe();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(announce_interval));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        // Announce self (handled by heartbeat)
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });

        // Spawn message handler
        let peers_clone = peers.clone();
        let shutdown_clone = self.shutdown_tx.subscribe();
        
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let MarketMessage::ProviderAnnounce { provider } = msg {
                    peers_clone.write().await.insert(provider.peer_id.clone(), provider.into());
                } else if let MarketMessage::ProviderWithdraw { provider_peer_id } = msg {
                    peers_clone.write().await.remove(&provider_peer_id);
                }
            }
        });

        Ok(())
    }

    /// Start quote topic listener
    async fn start_quote_listener(&mut self) -> Result<()> {
        // Per-provider quote topic: SHA256("compute:quote:v1:" + peer_id)
        let topic = Self::quote_topic(&self.peer_id_hex());
        info!("Joining quote topic: {}", topic);

        // Mock: quote handler
        let active_sessions = self.active_sessions.clone();
        let shutdown = self.shutdown_tx.subscribe();
        let mut quote_rx = std::mem::take(&mut self.quote_receiver);

        tokio::spawn(async move {
            while let Some(msg) = quote_rx.recv().await {
                match msg {
                    QuoteMessage::QuoteRequest { request } => {
                        // Handled by quote handler
                        debug!("Received quote request: {}", request.request_id);
                    }
                    QuoteMessage::JobCreated { job } => {
                        info!("Job created: {}", job.job_id);
                    }
                    _ => {}
                }
                
                tokio::select! {
                    _ = shutdown.recv() => break,
                    _ = tokio::time::sleep(Duration::from_millis(1)) => {}
                }
            }
        });

        Ok(())
    }

    /// Start heartbeat announcements
    async fn start_heartbeat(&self) -> Result<()> {
        let interval = self.config.announce_interval_ms;
        let market_sender = self.market_sender.clone();
        let settings = self.settings.clone();
        let peer_id = self.peer_id_hex();
        let signing_key = self.signing_key.clone();
        let reputation = self.get_reputation_summary().await;
        let announcements_sent = self.announcements_sent.clone();
        let shutdown = self.shutdown_tx.subscribe();
        let tiers = self.build_tier_summaries().await;

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(interval));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if let Some(sender) = &market_sender {
                            let announce = Self::create_announcement(
                                &peer_id,
                                &settings,
                                &tiers,
                                &reputation,
                                &signing_key,
                            ).await;
                            
                            if sender.send(MarketMessage::ProviderAnnounce { provider: announce }).is_ok() {
                                announcements_sent.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            }
                        }
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });

        Ok(())
    }

    /// Create provider announcement
    async fn create_announcement(
        peer_id: &str,
        settings: &ProviderSettings,
        tiers: &[PricingTierSummary],
        reputation: &ReputationSummary,
        signing_key: &SigningKey,
    ) -> ProviderAnnounce {
        let announce = ProviderAnnounce {
            peer_id: peer_id.to_string(),
            name: settings.name.clone(),
            task_types: settings.task_types,
            tiers: tiers.to_vec(),
            capability_profile_cid: None,
            reputation: reputation.clone(),
            region: settings.region.clone(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            signature: String::new(), // Will be filled below
        };

        // Sign announcement
        let payload = serde_json::to_vec(&serde_json::json!({
            "peerId": announce.peer_id,
            "name": announce.name,
            "taskTypes": announce.task_types,
            "tiers": announce.tiers,
            "reputation": announce.reputation,
            "region": announce.region,
            "timestamp": announce.timestamp,
        })).unwrap();

        let signature = signing_key.sign(&payload);
        ProviderAnnounce {
            signature: hex::encode(signature.to_bytes()),
            ..announce
        }
    }

    /// Build tier summaries from config
    async fn build_tier_summaries(&self) -> Vec<PricingTierSummary> {
        // In production, would load from config
        vec![
            PricingTierSummary {
                model_id: "QWEN3_8B_INST_Q4_K_M".to_string(),
                price_per_request: "1000000".to_string(),
                min_tps: 15,
            }
        ]
    }

    /// Get reputation summary
    async fn get_reputation_summary(&self) -> ReputationSummary {
        ReputationSummary {
            jobs_completed: 0,
            total_earned: "0".to_string(),
            avg_rating: 5.0,
        }
    }

    /// Handle incoming quote request
    pub async fn handle_quote_request(
        &self,
        request: QuoteRequest,
        capability_profile: &CapabilityProfile,
    ) -> Result<SignedQuote> {
        info!("Handling quote request for model: {:?}", request.model_id);

        // Verify consumer signature
        // In production, would verify Ed25519 signature

        // Check capability
        let model_id = request.model_id.unwrap_or_else(|| "QWEN3_8B_INST_Q4_K_M".to_string());
        let tier = capability_profile.tiers.iter()
            .find(|t| t.model_id == model_id)
            .ok_or_else(|| anyhow!("Model not supported: {}", model_id))?;

        if !tier.passes {
            return Err(anyhow!("Model {} failed capability check", model_id));
        }

        // Check max price
        if let Some(max_price) = &request.max_price {
            let max: u128 = max_price.parse()?;
            // Compare with tier price (simplified)
        }

        // Generate quote
        let quote = SignedQuote {
            quote_id: Uuid::now_v7().to_string(),
            provider_peer_id: self.peer_id_hex(),
            provider_authority: self.settings.authority.clone(),
            amount: "1000000".to_string(), // Would come from pricing
            payment_mint: "0x0".to_string(),
            valid_until: chrono::Utc::now().timestamp() as u64 + 300, // 5 minutes
            quote_nonce: hex::encode(rand::random::<[u8; 16]>()),
            task_type: request.task_type,
            model_id,
            min_tps: tier.tps,
            signature: String::new(), // Will be signed
        };

        // Sign quote
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
        })).unwrap();

        let signature = self.signing_key.sign(&payload);
        Ok(SignedQuote {
            signature: hex::encode(signature.to_bytes()),
            ..quote
        })
    }

    /// Send quote response
    pub async fn send_quote_response(&self, quote: SignedQuote) -> Result<()> {
        if let Some(sender) = &self.quote_sender {
            sender.send(QuoteMessage::QuoteResponse { quote })?;
            self.quotes_sent.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }
        Ok(())
    }

    /// Start inference session
    pub async fn start_inference_session(
        &self,
        job_id: String,
        consumer_peer_id: String,
    ) -> Result<()> {
        let session = InferenceSession {
            job_id: job_id.clone(),
            consumer_peer_id,
            started_at: Instant::now(),
            tokens_sent: 0,
        };

        self.active_sessions.write().await.insert(job_id, session);
        info!("Started inference session");
        Ok(())
    }

    /// Send inference token
    pub async fn send_token(&self, job_id: &str, token: u32, logprob: Option<f32>) -> Result<()> {
        let mut sessions = self.active_sessions.write().await;
        if let Some(session) = sessions.get_mut(job_id) {
            session.tokens_sent += 1;
            // In production, would send over Noise stream
            debug!("Sent token {} for job {}", token, job_id);
        }
        Ok(())
    }

    /// Complete inference session
    pub async fn complete_inference_session(
        &self,
        job_id: &str,
        usage: UsageStats,
        response_hash: String,
    ) -> Result<()> {
        self.active_sessions.write().await.remove(job_id);
        
        // Send completion notice
        if let Some(sender) = &self.quote_sender {
            sender.send(QuoteMessage::ProviderComplete {
                job_id: job_id.to_string(),
                response_hash,
                tee_quote: None,
            })?;
        }

        info!("Completed inference session for job {}", job_id);
        Ok(())
    }

    /// Get connected peers
    pub async fn get_market_peers(&self) -> Vec<ProviderSummary> {
        self.market_peers.read().await.values().cloned().collect()
    }

    /// Get active session count
    pub async fn active_session_count(&self) -> usize {
        self.active_sessions.read().await.len()
    }

    /// Get metrics
    pub fn get_metrics(&self) -> P2PMetrics {
        P2PMetrics {
            announcements_sent: self.announcements_sent.load(std::sync::atomic::Ordering::Relaxed),
            quotes_sent: self.quotes_sent.load(std::sync::atomic::Ordering::Relaxed),
            active_sessions: 0, // Would read from active_sessions
            known_peers: 0, // Would read from market_peers
        }
    }

    /// Shutdown P2P client
    pub async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }

    /// Compute market topic hash
    fn market_topic() -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"compute:market:v1");
        hex::encode(hasher.finalize())
    }

    /// Compute quote topic hash
    fn quote_topic(peer_id: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"compute:quote:v1:");
        hasher.update(peer_id.as_bytes());
        hex::encode(hasher.finalize())
    }
}

/// P2P metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2PMetrics {
    pub announcements_sent: u64,
    pub quotes_sent: u64,
    pub active_sessions: usize,
    pub known_peers: usize,
}

impl From<ProviderAnnounce> for ProviderSummary {
    fn from(announce: ProviderAnnounce) -> Self {
        Self {
            peer_id: announce.peer_id,
            authority: String::new(), // Would come from on-chain
            name: announce.name,
            task_types: announce.task_types,
            tiers: announce.tiers,
            reputation: announce.reputation,
            region: announce.region,
            online: true,
            last_seen: announce.timestamp,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topic_hashes() {
        let market = P2PClient::market_topic();
        assert_eq!(market.len(), 64); // SHA256 hex
        
        let quote = P2PClient::quote_topic("deadbeef");
        assert_eq!(quote.len(), 64);
    }
}