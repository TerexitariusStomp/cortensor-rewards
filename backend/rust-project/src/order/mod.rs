//! Order Handling Module
//!
//! Subscribes to matched orders from the P2P quote topic, validates signatures,
//! and launches workloads in isolated microVMs.

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock, broadcast};
use tokio::time::interval;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

use crate::config::{ProviderConfig, ResourceLimits, WorkloadConfig};
use crate::firewall::{TransportFirewall, FirewallDecision};
use crate::p2p::{P2PClient, QuoteMessage, SignedQuote, JobCreatedNotice};
use crate::workload::{WorkloadRunner, WorkloadSpec, WorkloadResult, WorkloadBackend, InferenceConfig, ResourceLimits as WorkloadResourceLimits};

/// Order status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderStatus {
    Pending,
    Validating,
    PullingImage,
    Launching,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Order information from matched quote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedOrder {
    pub order_id: String,
    pub job_id: String,
    pub consumer_peer_id: String,
    pub consumer_address: String,
    pub provider_peer_id: String,
    pub provider_authority: String,
    pub model_id: String,
    pub prompt_hash: String,
    pub prompt_tokens: Vec<u32>,
    pub max_price: String,
    pub verification_tier: u8,
    pub tee_session_id: Option<String>,
    pub resource_limits: ResourceLimits,
    pub quote: SignedQuote,
    pub job_notice: JobCreatedNotice,
    pub created_at: u64,
    pub status: OrderStatus,
}

/// Order handler configuration
#[derive(Debug, Clone)]
pub struct OrderHandlerConfig {
    /// Poll interval for checking new orders (ms)
    pub poll_interval_ms: u64,
    /// Maximum concurrent orders
    pub max_concurrent_orders: usize,
    /// Image pull timeout (seconds)
    pub image_pull_timeout_secs: u64,
    /// Workload launch timeout (seconds)
    pub launch_timeout_secs: u64,
    /// Default workload backend
    pub default_backend: WorkloadBackend,
    /// Container registry (for pulling images)
    pub container_registry: Option<String>,
}

impl Default for OrderHandlerConfig {
    fn default() -> Self {
        Self {
            poll_interval_ms: 1000,
            max_concurrent_orders: 4,
            image_pull_timeout_secs: 300,  // 5 minutes
            launch_timeout_secs: 60,
            default_backend: WorkloadBackend::Firecracker,
            container_registry: None,
        }
    }
}

/// Order handler for processing matched orders
pub struct OrderHandler {
    config: OrderHandlerConfig,
    provider_config: ProviderConfig,
    p2p_client: Arc<P2PClient>,
    firewall: Arc<TransportFirewall>,
    workload_runner: Arc<WorkloadRunner>,
    
    // Order tracking
    active_orders: Arc<RwLock<HashMap<String, MatchedOrder>>>,
    order_sender: mpsc::UnboundedSender<MatchedOrder>,
    order_receiver: Arc<tokio::sync::Mutex<mpsc::UnboundedReceiver<MatchedOrder>>>,
    
    // Control plane
    control_sender: mpsc::UnboundedSender<ControlMessage>,
    
    // Shutdown
    shutdown_tx: broadcast::Sender<()>,
}

/// Control plane messages
#[derive(Debug, Clone)]
pub enum ControlMessage {
    StartWorkload { job_id: String, spec: WorkloadSpec },
    StopWorkload { job_id: String },
    GetLogs { job_id: String },
    GetStatus { job_id: String },
    ListWorkloads,
}

/// Control plane responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ControlResponse {
    WorkloadStarted { job_id: String, vm_id: String },
    WorkloadStopped { job_id: String },
    WorkloadLogs { job_id: String, logs: String },
    WorkloadStatus { job_id: String, status: OrderStatus, details: serde_json::Value },
    WorkloadList { workloads: Vec<WorkloadInfo> },
    Error { message: String },
}

/// Workload information for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadInfo {
    pub job_id: String,
    pub order_id: String,
    pub model_id: String,
    pub status: OrderStatus,
    pub backend: WorkloadBackend,
    pub started_at: Option<u64>,
    pub resource_limits: ResourceLimits,
}

impl OrderHandler {
    /// Create new order handler
    pub fn new(
        provider_config: ProviderConfig,
        p2p_client: Arc<P2PClient>,
        firewall: Arc<TransportFirewall>,
        workload_runner: Arc<WorkloadRunner>,
        config: OrderHandlerConfig,
    ) -> Result<Self> {
        let (order_tx, order_rx) = mpsc::unbounded_channel();
        let (control_tx, _) = mpsc::unbounded_channel();
        let (shutdown_tx, _) = broadcast::channel(1);
        
        Ok(Self {
            config,
            provider_config,
            p2p_client,
            firewall,
            workload_runner,
            active_orders: Arc::new(RwLock::new(HashMap::new())),
            order_sender: order_tx,
            order_receiver: Arc::new(tokio::sync::Mutex::new(order_rx)),
            control_sender: control_tx,
            shutdown_tx,
        })
    }
    
    /// Get control plane sender
    pub fn control_sender(&self) -> mpsc::UnboundedSender<ControlMessage> {
        self.control_sender.clone()
    }
    
    /// Start the order handler
    pub async fn start(&mut self) -> Result<()> {
        info!("Starting order handler...");
        
        // Start P2P quote listener for JobCreated messages
        self.start_quote_listener().await?;
        
        // Start order processor
        self.start_order_processor().await?;
        
        // Start control plane handler
        self.start_control_plane().await?;
        
        // Start cleanup task
        self.start_cleanup_task().await?;
        
        info!("Order handler started");
        Ok(())
    }
    
    /// Start listening for JobCreated messages on quote topic
    async fn start_quote_listener(&self) -> Result<()> {
        let order_sender = self.order_sender.clone();
        let firewall = self.firewall.clone();
        let p2p_client = self.p2p_client.clone();
        let shutdown = self.shutdown_tx.subscribe();
        let provider_peer_id = p2p_client.peer_id_hex();
        
        // In production, this would connect to the actual Hyperswarm topic
        // For now, we'll simulate receiving orders through a channel
        tokio::spawn(async move {
            info!("Quote listener started for peer: {}", provider_peer_id);
            
            // Mock: simulate receiving a test order after 5 seconds
            tokio::time::sleep(Duration::from_secs(5)).await;
            
            // In production, this would come from the P2P quote topic
            // The P2PClient would forward QuoteMessage::JobCreated to this handler
            debug!("Quote listener waiting for JobCreated messages...");
            
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("Quote listener shutting down");
                }
            }
        });
        
        Ok(())
    }
    
    /// Start order processing loop
    async fn start_order_processor(&self) -> Result<()> {
        let active_orders = self.active_orders.clone();
        let workload_runner = self.workload_runner.clone();
        let firewall = self.firewall.clone();
        let p2p_client = self.p2p_client.clone();
        let config = self.config.clone();
        let provider_config = self.provider_config.clone();
        let shutdown = self.shutdown_tx.subscribe();
        let mut order_rx = self.order_receiver.lock().await;
        
        tokio::spawn(async move {
            info!("Order processor started");
            
            // Semaphore for limiting concurrent orders
            let semaphore = Arc::new(tokio::sync::Semaphore::new(config.max_concurrent_orders));
            
            loop {
                tokio::select! {
                    Some(order) = order_rx.recv() => {
                        let permit = semaphore.clone().acquire_owned().await;
                        
                        if let Ok(permit) = permit {
                            let active_orders = active_orders.clone();
                            let workload_runner = workload_runner.clone();
                            let firewall = firewall.clone();
                            let p2p_client = p2p_client.clone();
                            let config = config.clone();
                            let provider_config = provider_config.clone();
                            
                            tokio::spawn(async move {
                                let order_id = order.order_id.clone();
                                let job_id = order.job_id.clone();
                                
                                // Update status to validating
                                {
                                    let mut orders = active_orders.write().await;
                                    if let Some(o) = orders.get_mut(&order_id) {
                                        o.status = OrderStatus::Validating;
                                    }
                                }
                                
                                // Process the order
                                let result = Self::process_order(
                                    order,
                                    workload_runner,
                                    firewall,
                                    p2p_client,
                                    config,
                                    provider_config,
                                ).await;
                                
                                // Update final status
                                {
                                    let mut orders = active_orders.write().await;
                                    if let Some(o) = orders.get_mut(&order_id) {
                                        o.status = match result {
                                            Ok(_) => OrderStatus::Completed,
                                            Err(_) => OrderStatus::Failed,
                                        };
                                    }
                                }
                                
                                // Notify completion via P2P
                                if let Err(e) = p2p_client.complete_inference_session(
                                    &job_id,
                                    crate::p2p::UsageStats {
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        total_tokens: 0,
                                        ttft_ms: 0,
                                        tps: 0,
                                    },
                                    "0x0".to_string(),
                                ).await {
                                    warn!("Failed to send completion notice: {}", e);
                                }
                                
                                drop(permit);
                            });
                        }
                    }
                    _ = shutdown.recv() => {
                        info!("Order processor shutting down");
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }
    
    /// Process a single matched order
    async fn process_order(
        mut order: MatchedOrder,
        workload_runner: Arc<WorkloadRunner>,
        firewall: Arc<TransportFirewall>,
        p2p_client: Arc<P2PClient>,
        config: OrderHandlerConfig,
        provider_config: ProviderConfig,
    ) -> Result<WorkloadResult> {
        let order_id = order.order_id.clone();
        let job_id = order.job_id.clone();
        
        info!("Processing order: {} (job: {})", order_id, job_id);
        
        // Step 1: Validate quote signature and payment
        let decision = firewall.verify_quote(&order.quote).await?;
        match decision {
            FirewallDecision::Allow => {
                info!("Quote verified and payment confirmed for order: {}", order_id);
            }
            FirewallDecision::RequirePayment => {
                warn!("Payment required for order: {}", order_id);
                return Err(anyhow!("Payment not verified"));
            }
            FirewallDecision::Deny => {
                return Err(anyhow!("Quote validation failed"));
            }
            FirewallDecision::Expired => {
                return Err(anyhow!("Quote expired"));
            }
            FirewallDecision::ReplayAttack => {
                return Err(anyhow!("Replay attack detected"));
            }
        }
        
        // Step 2: Grant firewall access
        firewall.grant_access(
            &order.provider_peer_id,
            &order.consumer_peer_id,
            &job_id,
        ).await?;
        
        // Step 3: Pull container image if needed
        {
            let mut orders = active_orders.clone();
            let mut orders_guard = orders.write().await;
            if let Some(o) = orders_guard.get_mut(&order_id) {
                o.status = OrderStatus::PullingImage;
            }
        }
        
        let image_name = Self::resolve_container_image(&order.model_id, &config);
        if let Err(e) = Self::pull_container_image(&image_name, config.image_pull_timeout_secs).await {
            warn!("Failed to pull image {}: {}", image_name, e);
            // Continue anyway - might be pre-pulled
        }
        
        // Step 4: Launch workload
        {
            let mut orders = active_orders.clone();
            let mut orders_guard = orders.write().await;
            if let Some(o) = orders_guard.get_mut(&order_id) {
                o.status = OrderStatus::Launching;
            }
        }
        
        // Build workload spec from order
        let spec = Self::build_workload_spec(&order, &provider_config)?;
        
        {
            let mut orders = active_orders.clone();
            let mut orders_guard = orders.write().await;
            if let Some(o) = orders_guard.get_mut(&order_id) {
                o.status = OrderStatus::Running;
            }
        }
        
        // Run workload
        let result = workload_runner.run_workload(spec).await?;
        
        info!("Order {} completed successfully", order_id);
        
        // Step 5: Revoke firewall access
        firewall.revoke_access(&order.provider_peer_id, &order.consumer_peer_id).await?;
        
        Ok(result)
    }
    
    /// Resolve container image name from model ID
    fn resolve_container_image(model_id: &str, config: &OrderHandlerConfig) -> String {
        // Map model ID to container image
        // In production, this would come from a model registry
        let base_image = config.container_registry.as_deref().unwrap_or("docker.io");
        match model_id {
            "QWEN3_8B_INST_Q4_K_M" => format!("{}/qvac/qwen3-8b-inst-q4:latest", base_image),
            "QWEN3_32B_INST_Q4_K_M" => format!("{}/qvac/qwen3-32b-inst-q4:latest", base_image),
            "LLAMA3_8B_INST_Q4_K_M" => format!("{}/qvac/llama3-8b-inst-q4:latest", base_image),
            _ => format!("{}/qvac/llama-cpp:latest", base_image),
        }
    }
    
    /// Pull container image using podman/docker
    async fn pull_container_image(image: &str, timeout_secs: u64) -> Result<()> {
        info!("Pulling container image: {}", image);
        
        // Try podman first, then docker
        let output = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            tokio::process::Command::new("podman")
                .args(["pull", image])
                .output()
        ).await;
        
        match output {
            Ok(Ok(out)) if out.status.success() => {
                info!("Successfully pulled image via podman: {}", image);
                return Ok(());
            }
            Ok(Ok(out)) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                warn!("Podman pull failed: {}", stderr);
            }
            Ok(Err(e)) => {
                debug!("Podman not available: {}", e);
            }
            Err(_) => {
                warn!("Podman pull timed out");
            }
        }
        
        // Fallback to docker
        let output = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            tokio::process::Command::new("docker")
                .args(["pull", image])
                .output()
        ).await;
        
        match output {
            Ok(Ok(out)) if out.status.success() => {
                info!("Successfully pulled image via docker: {}", image);
                Ok(())
            }
            Ok(Ok(out)) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(anyhow!("Docker pull failed: {}", stderr))
            }
            Ok(Err(e)) => Err(anyhow!("Docker not available: {}", e)),
            Err(_) => Err(anyhow!("Docker pull timed out")),
        }
    }
    
    /// Build workload spec from matched order
    fn build_workload_spec(order: &MatchedOrder, provider_config: &ProviderConfig) -> Result<WorkloadSpec> {
        let model_path = provider_config.workload.model_cache_dir.join(&order.model_id);
        
        // Determine backend from order or config
        let backend = provider_config.workload.backend.parse()
            .unwrap_or(WorkloadBackend::Firecracker);
        
        Ok(WorkloadSpec {
            job_id: order.job_id.clone(),
            model_id: order.model_id.clone(),
            model_path,
            prompt_tokens: order.prompt_tokens.clone(),
            config: InferenceConfig {
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 100,
                stop_sequences: None,
                seed: None,
            },
            resources: order.resource_limits.clone(),
            verification_tier: order.verification_tier,
            tee_session_id: order.tee_session_id.clone(),
        })
    }
    
    /// Start control plane handler
    async fn start_control_plane(&self) -> Result<()> {
        // This will be implemented as an HTTP server in the next step
        info!("Control plane handler started");
        Ok(())
    }
    
    /// Start cleanup task for expired orders
    async fn start_cleanup_task(&self) -> Result<()> {
        let active_orders = self.active_orders.clone();
        let shutdown = self.shutdown_tx.subscribe();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(60));
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let mut orders = active_orders.write().await;
                        let now = chrono::Utc::now().timestamp() as u64;
                        
                        // Remove completed/failed orders older than 1 hour
                        orders.retain(|_, order| {
                            matches!(order.status, OrderStatus::Pending | OrderStatus::Validating | 
                                     OrderStatus::PullingImage | OrderStatus::Launching | OrderStatus::Running) ||
                            (now.saturating_sub(order.created_at) < 3600)
                        });
                    }
                    _ = shutdown.recv() => {
                        info!("Cleanup task shutting down");
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }
    
    /// Get active orders
    pub async fn get_active_orders(&self) -> Vec<MatchedOrder> {
        self.active_orders.read().await.values().cloned().collect()
    }
    
    /// Get order by ID
    pub async fn get_order(&self, order_id: &str) -> Option<MatchedOrder> {
        self.active_orders.read().await.get(order_id).cloned()
    }
    
    /// Submit a test order (for testing)
    pub async fn submit_test_order(&self, model_id: String, prompt_tokens: Vec<u32>) -> Result<String> {
        let order_id = format!("test-{}", Uuid::now_v7());
        let job_id = format!("job-{}", Uuid::now_v7());
        
        let order = MatchedOrder {
            order_id: order_id.clone(),
            job_id: job_id.clone(),
            consumer_peer_id: "test-consumer".to_string(),
            consumer_address: "0x1234567890123456789012345678901234567890".to_string(),
            provider_peer_id: self.p2p_client.peer_id_hex(),
            provider_authority: self.provider_config.provider.authority.clone(),
            model_id,
            prompt_hash: "0x0".to_string(),
            prompt_tokens,
            max_price: "1000000".to_string(),
            verification_tier: 0,
            tee_session_id: None,
            resource_limits: self.provider_config.workload.default_limits.clone(),
            quote: SignedQuote {
                quote_id: format!("quote-{}", Uuid::now_v7()),
                provider_peer_id: self.p2p_client.peer_id_hex(),
                provider_authority: self.provider_config.provider.authority.clone(),
                amount: "1000000".to_string(),
                payment_mint: "0x0".to_string(),
                valid_until: chrono::Utc::now().timestamp() as u64 + 300,
                quote_nonce: hex::encode(rand::random::<[u8; 16]>()),
                task_type: 1,
                model_id: order.model_id.clone(),
                min_tps: 15,
                signature: "".to_string(),
            },
            job_notice: JobCreatedNotice {
                job_id: job_id.clone(),
                job_pda: "0x0".to_string(),
                request_hash: "0x0".to_string(),
                amount: "1000000".to_string(),
                consumer_address: "0x1234567890123456789012345678901234567890".to_string(),
                provider_authority: self.provider_config.provider.authority.clone(),
                created_at: chrono::Utc::now().timestamp() as u64,
            },
            created_at: chrono::Utc::now().timestamp() as u64,
            status: OrderStatus::Pending,
        };
        
        // Add to active orders
        self.active_orders.write().await.insert(order_id.clone(), order.clone());
        
        // Send to processor
        self.order_sender.send(order)
            .map_err(|_| anyhow!("Failed to send order to processor"))?;
        
        Ok(order_id)
    }
    
    /// Shutdown the order handler
    pub async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ProviderConfig, ProviderSettings, PricingConfig, TierPricing, TokenConfig, MatchingConfig, P2PConfig, WorkloadConfig, ResourceLimits};
    use crate::p2p::P2PClient;
    use crate::firewall::TransportFirewall;
    use crate::workload::WorkloadRunner;
    use std::sync::Arc;
    
    fn create_test_config() -> ProviderConfig {
        ProviderConfig {
            metadata: Default::default(),
            provider: ProviderSettings {
                name: "Test Provider".to_string(),
                task_types: 1,
                region: Some("us-east".to_string()),
                verification_tier: 0,
                tee_endpoint: None,
                authority: "0x1234567890123456789012345678901234567890".to_string(),
                rpc_url: "http://localhost:8545".to_string(),
                chain_id: "31337".to_string(),
                max_concurrent_sessions: 4,
                seed_env: Some("TEST_SEED".to_string()),
                seed_file: None,
                probe_interval_secs: 3600,
                announce_interval_ms: 30000,
            },
            pricing: PricingConfig {
                base_model_id: "QWEN3_8B_INST_Q4_K_M".to_string(),
                base_price_per_request: "1000000".to_string(),
                tiers: {
                    let mut m = HashMap::new();
                    m.insert("QWEN3_8B_INST_Q4_K_M".to_string(), TierPricing {
                        multiplier: 1.0,
                        min_tps: 15,
                        max_context_tokens: 32768,
                    });
                    m
                },
                token: TokenConfig {
                    address: "0x0".to_string(),
                    decimals: 18,
                    protocol_fee_bps: 100,
                },
            },
            matching: MatchingConfig {
                endpoint: "ws://localhost:8080".to_string(),
                api_key: None,
                reconnect_interval_secs: 5,
                order_timeout_secs: 30,
                mirror_onchain: false,
            },
            p2p: P2PConfig {
                seed_env: "TEST_SEED".to_string(),
                market_topic: "compute:market:v1".to_string(),
                announce_interval_ms: 30000,
                max_peers: 100,
                enable_relay: true,
                bootstrap: vec![],
                mux: false,
            },
            tee: Default::default(),
            workload: WorkloadConfig {
                backend: "firecracker".to_string(),
                firecracker_socket: "/tmp/firecracker.socket".to_string(),
                runsc_path: "/usr/bin/runsc".to_string(),
                default_limits: ResourceLimits {
                    vcpus: 4,
                    memory_mb: 8192,
                    gpus: "".to_string(),
                    disk_mb: 10240,
                    network_mbps: None,
                },
                model_cache_dir: std::path::PathBuf::from("/tmp/qvac/models"),
                model_load_timeout_secs: 300,
                prewarm: vec![],
            },
            attestation: Default::default(),
            settlement: Default::default(),
            metrics: Default::default(),
            logging: Default::default(),
        }
    }
    
    #[tokio::test]
    async fn test_order_handler_creation() {
        let config = create_test_config();
        let seed = [0u8; 32];
        let p2p_client = Arc::new(P2PClient::new(config.p2p.clone(), config.provider.clone(), seed).await.unwrap());
        let firewall = Arc::new(TransportFirewall::new(Default::default()));
        let workload_runner = Arc::new(WorkloadRunner::new(config.workload.clone()).unwrap());
        
        let handler = OrderHandler::new(
            config,
            p2p_client,
            firewall,
            workload_runner,
            Default::default(),
        ).unwrap();
        
        let orders = handler.get_active_orders().await;
        assert_eq!(orders.len(), 0);
    }
}