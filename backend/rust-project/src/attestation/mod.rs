//! Attestation Streaming
//!
//! Streams CPU cycles, runtime, output hash to verifier service

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, RwLock};
use tokio::time::interval;
use tracing::{debug, info, warn};

use crate::workload::WorkloadAttestation;

/// Attestation event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationEvent {
    pub job_id: String,
    pub timestamp: u64,
    pub event_type: AttestationEventType,
    pub data: AttestationData,
}

/// Attestation event types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttestationEventType {
    JobStarted,
    TokenGenerated,
    JobCompleted,
    JobFailed,
    Heartbeat,
}

/// Attestation data payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AttestationData {
    #[serde(rename = "job_started")]
    JobStarted {
        model_id: String,
        prompt_tokens: u32,
        verification_tier: u8,
    },
    #[serde(rename = "token_generated")]
    TokenGenerated {
        token: u32,
        logprob: Option<f32>,
        cumulative_cpu_cycles: u64,
        memory_mb: u64,
    },
    #[serde(rename = "job_completed")]
    JobCompleted {
        completion_tokens: u32,
        total_cpu_cycles: u64,
        peak_memory_mb: u64,
        execution_time_ms: u64,
        output_hash: String,
        tee_quote: Option<String>,
    },
    #[serde(rename = "job_failed")]
    JobFailed {
        error: String,
        cpu_cycles: u64,
        memory_mb: u64,
    },
    #[serde(rename = "heartbeat")]
    Heartbeat {
        active_jobs: usize,
        cpu_percent: f64,
        memory_percent: f64,
    },
}

/// Attestation streamer
pub struct AttestationStreamer {
    config: AttestationConfig,
    sender: mpsc::UnboundedSender<AttestationEvent>,
    receiver: mpsc::UnboundedReceiver<AttestationEvent>,
    buffer: Arc<RwLock<VecDeque<AttestationEvent>>>,
    metrics: Arc<AttestationMetrics>,
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
}

/// Attestation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationConfig {
    pub enabled: bool,
    pub endpoint: Option<String>,
    pub stream_interval_ms: u64,
    pub batch_size: usize,
    pub include_cpu_cycles: bool,
    pub include_memory: bool,
    pub include_output_hash: bool,
    pub max_buffer_size: usize,
}

impl Default for AttestationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            endpoint: None,
            stream_interval_ms: 1000,
            batch_size: 10,
            include_cpu_cycles: true,
            include_memory: true,
            include_output_hash: true,
            max_buffer_size: 10000,
        }
    }
}

/// Attestation metrics
#[derive(Debug, Default)]
pub struct AttestationMetrics {
    events_sent: std::sync::atomic::AtomicU64,
    events_failed: std::sync::atomic::AtomicU64,
    bytes_sent: std::sync::atomic::AtomicU64,
    last_send: std::sync::atomic::AtomicU64,
    buffer_overflows: std::sync::atomic::AtomicU64,
}

impl AttestationMetrics {
    pub fn get(&self) -> AttestationMetricsSnapshot {
        AttestationMetricsSnapshot {
            events_sent: self.events_sent.load(std::sync::atomic::Ordering::Relaxed),
            events_failed: self.events_failed.load(std::sync::atomic::Ordering::Relaxed),
            bytes_sent: self.bytes_sent.load(std::sync::atomic::Ordering::Relaxed),
            last_send: self.last_send.load(std::sync::atomic::Ordering::Relaxed),
            buffer_overflows: self.buffer_overflows.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
}

/// Metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationMetricsSnapshot {
    pub events_sent: u64,
    pub events_failed: u64,
    pub bytes_sent: u64,
    pub last_send: u64,
    pub buffer_overflows: u64,
}

impl AttestationStreamer {
    /// Create new attestation streamer
    pub fn new(config: AttestationConfig) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let (shutdown_tx, _) = tokio::sync::broadcast::channel(1);

        Self {
            config,
            sender: tx,
            receiver: rx,
            buffer: Arc::new(RwLock::new(VecDeque::new())),
            metrics: Arc::new(AttestationMetrics::default()),
            shutdown_tx,
        }
    }

    /// Get sender for emitting events
    pub fn sender(&self) -> mpsc::UnboundedSender<AttestationEvent> {
        self.sender.clone()
    }

    /// Start streaming loop
    pub async fn start(&mut self) -> Result<()> {
        if !self.config.enabled {
            info!("Attestation streaming disabled");
            return Ok(());
        }

        let endpoint = self.config.endpoint.clone();
        let buffer = self.buffer.clone();
        let metrics = self.metrics.clone();
        let batch_size = self.config.batch_size;
        let stream_interval = self.config.stream_interval_ms;
        let max_buffer = self.config.max_buffer_size;
        let mut shutdown = self.shutdown_tx.subscribe();

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(stream_interval));
            let client = reqwest::Client::new();

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        // Flush buffer
                        let events = {
                            let mut buf = buffer.write().await;
                            let drain_len = std::cmp::min(buf.len(), batch_size);
                            buf.drain(..drain_len).collect::<Vec<_>>()
                        };

                        if !events.is_empty() {
                            if let Some(endpoint) = &endpoint {
                                if let Err(e) = Self::send_batch(&client, endpoint, &events, &metrics).await {
                                    warn!("Failed to send attestation batch: {}", e);
                                }
                            }
                        }
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });

        // Also start local buffer management
        Self::start_buffer_manager(buffer.clone(), max_buffer, metrics.clone(), self.shutdown_tx.subscribe());

        Ok(())
    }

    /// Buffer manager to prevent unbounded growth
    fn start_buffer_manager(
        buffer: Arc<RwLock<VecDeque<AttestationEvent>>>,
        max_size: usize,
        metrics: Arc<AttestationMetrics>,
        mut shutdown: tokio::sync::broadcast::Receiver<()>,
    ) {
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(10));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let mut buf = buffer.write().await;
                        if buf.len() > max_size {
                            let overflow = buf.len() - max_size;
                            buf.drain(..overflow);
                            metrics.buffer_overflows.fetch_add(overflow as u64, std::sync::atomic::Ordering::Relaxed);
                            warn!("Attestation buffer overflow, dropped {} events", overflow);
                        }
                    }
                    _ = shutdown.recv() => break,
                }
            }
        });
    }

    /// Send batch of events to endpoint
    async fn send_batch(
        client: &reqwest::Client,
        endpoint: &str,
        events: &[AttestationEvent],
        metrics: &AttestationMetrics,
    ) -> Result<()> {
        let payload = serde_json::json!({
            "events": events,
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64,
        });

        let body = serde_json::to_vec(&payload)?;
        let bytes = body.len() as u64;

        let response = client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await?;

        if response.status().is_success() {
            metrics.events_sent.fetch_add(events.len() as u64, std::sync::atomic::Ordering::Relaxed);
            metrics.bytes_sent.fetch_add(bytes, std::sync::atomic::Ordering::Relaxed);
            metrics.last_send.store(
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
                std::sync::atomic::Ordering::Relaxed,
            );
        } else {
            metrics.events_failed.fetch_add(events.len() as u64, std::sync::atomic::Ordering::Relaxed);
            return Err(anyhow!("HTTP {}", response.status()));
        }

        Ok(())
    }

    /// Emit job started event
    pub async fn emit_job_started(
        &self,
        job_id: &str,
        model_id: &str,
        prompt_tokens: u32,
        verification_tier: u8,
    ) -> Result<()> {
        let event = AttestationEvent {
            job_id: job_id.to_string(),
            timestamp: current_timestamp(),
            event_type: AttestationEventType::JobStarted,
            data: AttestationData::JobStarted {
                model_id: model_id.to_string(),
                prompt_tokens,
                verification_tier,
            },
        };

        self.buffer_event(event).await
    }

    /// Emit token generated event
    pub async fn emit_token_generated(
        &self,
        job_id: &str,
        token: u32,
        logprob: Option<f32>,
        cpu_cycles: u64,
        memory_mb: u64,
    ) -> Result<()> {
        if !self.config.include_cpu_cycles && !self.config.include_memory {
            return Ok(());
        }

        let event = AttestationEvent {
            job_id: job_id.to_string(),
            timestamp: current_timestamp(),
            event_type: AttestationEventType::TokenGenerated,
            data: AttestationData::TokenGenerated {
                token,
                logprob,
                cumulative_cpu_cycles: if self.config.include_cpu_cycles { cpu_cycles } else { 0 },
                memory_mb: if self.config.include_memory { memory_mb } else { 0 },
            },
        };

        self.buffer_event(event).await
    }

    /// Emit job completed event
    pub async fn emit_job_completed(
        &self,
        job_id: &str,
        completion_tokens: u32,
        attestation: &WorkloadAttestation,
    ) -> Result<()> {
        let event = AttestationEvent {
            job_id: job_id.to_string(),
            timestamp: current_timestamp(),
            event_type: AttestationEventType::JobCompleted,
            data: AttestationData::JobCompleted {
                completion_tokens,
                total_cpu_cycles: if self.config.include_cpu_cycles { attestation.cpu_cycles } else { 0 },
                peak_memory_mb: if self.config.include_memory { attestation.memory_peak_mb } else { 0 },
                execution_time_ms: attestation.execution_time_ms,
                output_hash: if self.config.include_output_hash { attestation.attestation.as_ref().map(|a| a.clone()).unwrap_or_default() } else { String::new() },
                tee_quote: attestation.tee_quote.clone(),
            },
        };

        self.buffer_event(event).await
    }

    /// Emit job failed event
    pub async fn emit_job_failed(&self, job_id: &str, error: &str, cpu_cycles: u64, memory_mb: u64) -> Result<()> {
        let event = AttestationEvent {
            job_id: job_id.to_string(),
            timestamp: current_timestamp(),
            event_type: AttestationEventType::JobFailed,
            data: AttestationData::JobFailed {
                error: error.to_string(),
                cpu_cycles: if self.config.include_cpu_cycles { cpu_cycles } else { 0 },
                memory_mb: if self.config.include_memory { memory_mb } else { 0 },
            },
        };

        self.buffer_event(event).await
    }

    /// Emit heartbeat event
    pub async fn emit_heartbeat(&self, active_jobs: usize, cpu_percent: f64, memory_percent: f64) -> Result<()> {
        let event = AttestationEvent {
            job_id: "system".to_string(),
            timestamp: current_timestamp(),
            event_type: AttestationEventType::Heartbeat,
            data: AttestationData::Heartbeat {
                active_jobs,
                cpu_percent,
                memory_percent,
            },
        };

        self.buffer_event(event).await
    }

    /// Buffer event for batch sending
    async fn buffer_event(&self, event: AttestationEvent) -> Result<()> {
        let mut buffer = self.buffer.write().await;
        
        if buffer.len() >= self.config.max_buffer_size {
            self.metrics.buffer_overflows.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Err(anyhow!("Attestation buffer full"));
        }

        buffer.push_back(event);
        Ok(())
    }

    /// Get current buffer size
    pub async fn buffer_size(&self) -> usize {
        self.buffer.read().await.len()
    }

    /// Get metrics
    pub fn metrics(&self) -> AttestationMetricsSnapshot {
        self.metrics.get()
    }

    /// Shutdown streamer
    pub async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
        // Flush remaining events
        let events = self.buffer.write().await.drain(..).collect::<Vec<_>>();
        if !events.is_empty() && self.config.endpoint.is_some() {
            let client = reqwest::Client::new();
            if let Some(endpoint) = &self.config.endpoint {
                let _ = Self::send_batch(&client, endpoint, &events, &self.metrics).await;
            }
        }
    }
}

/// Get current timestamp in milliseconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Attestation verifier (for consumer/verifier side)
pub struct AttestationVerifier {
    trusted_tee_types: Vec<String>,
}

impl AttestationVerifier {
    pub fn new(trusted_tee_types: Vec<String>) -> Self {
        Self { trusted_tee_types }
    }

    /// Verify TEE quote
    pub async fn verify_quote(&self, tee_type: &str, quote: &str, expected_output_hash: &str) -> Result<bool> {
        if !self.trusted_tee_types.contains(&tee_type.to_string()) {
            return Ok(false);
        }

        // In production, would:
        // 1. Decode quote
        // 2. Verify with Intel/AMD attestation service
        // 3. Check MRENCLAVE/MRSIGNER
        // 4. Verify output hash matches
        
        debug!("Would verify {} quote for output hash {}", tee_type, expected_output_hash);
        Ok(true) // Mock
    }

    /// Verify attestation completeness
    pub fn verify_attestation_completeness(&self, attestation: &WorkloadAttestation) -> bool {
        attestation.cpu_cycles > 0 &&
        attestation.memory_peak_mb > 0 &&
        attestation.execution_time_ms > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_attestation_streamer() {
        let config = AttestationConfig::default();
        let mut streamer = AttestationStreamer::new(config);
        streamer.start().await.unwrap();

        streamer.emit_job_started("job1", "model1", 10, 0).await.unwrap();
        streamer.emit_token_generated("job1", 20, Some(-0.5), 1000, 1024).await.unwrap();
        
        let attestation = WorkloadAttestation {
            cpu_cycles: 50000,
            memory_peak_mb: 2048,
            execution_time_ms: 500,
            tee_quote: None,
        };
        streamer.emit_job_completed("job1", 5, &attestation).await.unwrap();

        assert!(streamer.buffer_size().await > 0);
        streamer.shutdown().await;
    }

    #[test]
    fn test_timestamp() {
        let ts = current_timestamp();
        assert!(ts > 1_700_000_000_000); // After 2024
    }
}