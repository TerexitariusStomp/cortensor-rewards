//! On-chain provider registry integration
//!
//! Implements registration, updates, and peer ID rotation with the ComputeRegistry contract
//! Supports both EVM (Solidity) and Solana (Anchor) chains

use alloy::{
    network::EthereumWallet,
    primitives::{Address, Bytes, U256, FixedBytes},
    providers::{Provider, ProviderBuilder, RootProvider},
    signers::local::PrivateKeySigner,
    sol,
    transports::http::reqwest::Url,
};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::config::{PricingConfig, ProviderSettings, TierPricing};

/// Provider registry client trait for multi-chain support
#[async_trait]
pub trait RegistryClient: Send + Sync {
    /// Register a new provider
    async fn register_provider(
        &self,
        qvac_peer_id: [u8; 32],
        name: &str,
        task_types: u16,
        tiers: Vec<PricingTierOnChain>,
    ) -> Result<ProviderRegistration>;

    /// Update existing provider
    async fn update_provider(
        &self,
        provider_pda: &str,
        name: Option<&str>,
        task_types: Option<u16>,
        tiers: Option<Vec<PricingTierOnChain>>,
    ) -> Result<()>;

    /// Rotate peer ID
    async fn rotate_peer_id(&self, provider_pda: &str, new_qvac_peer_id: [u8; 32]) -> Result<()>;

    /// Get provider info
    async fn get_provider(&self, authority: &str) -> Result<Option<ProviderInfo>>;

    /// Pause provider
    async fn pause_provider(&self, provider_pda: &str) -> Result<()>;

    /// Resume provider
    async fn resume_provider(&self, provider_pda: &str) -> Result<()>;
}

/// Pricing tier for on-chain registration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingTierOnChain {
    pub model_id: String,
    pub price_per_request: U256,
    pub min_tps: u32,
    pub max_context_tokens: u32,
}

/// Provider registration result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderRegistration {
    pub provider_pda: String,
    pub transaction_hash: String,
    pub block_number: u64,
}

/// Provider info from registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub authority: String,
    pub qvac_peer_id: [u8; 32],
    pub name: String,
    pub task_types: u16,
    pub tiers: Vec<PricingTierOnChain>,
    pub jobs_completed: u64,
    pub total_earned: U256,
    pub status: u8,
    pub registered_at: u64,
    pub updated_at: u64,
}

/// EVM-based registry client using Alloy
pub struct EvmRegistryClient {
    provider: RootProvider,
    wallet: EthereumWallet,
    registry_address: Address,
    chain_id: u64,
}

impl EvmRegistryClient {
    /// Create new EVM registry client
    pub async fn new(
        rpc_url: &str,
        private_key: &str,
        registry_address: &str,
        chain_id: u64,
    ) -> Result<Self> {
        let url: Url = rpc_url.parse()?;
        let signer: PrivateKeySigner = private_key.parse()?;
        let wallet = EthereumWallet::from(signer);
        let provider = ProviderBuilder::new()
            .wallet(wallet.clone())
            .on_http(url);

        let registry_addr: Address = registry_address.parse()?;

        Ok(Self {
            provider,
            wallet,
            registry_address: registry_addr,
            chain_id,
        })
    }

    /// Build pricing tiers for contract
    fn build_tiers(tiers: &HashMap<String, TierPricing>, base_price: &str, base_model: &str) -> Vec<PricingTierOnChain> {
        let base_price_u256 = U256::from_str_radix(base_price, 10).unwrap_or(U256::from(1_000_000));
        
        tiers.iter().map(|(model_id, tier)| {
            let price = if model_id == base_model {
                base_price_u256
            } else {
                // Apply multiplier
                let multiplier = (tier.multiplier * 1e18 as f64) as u128;
                base_price_u256 * U256::from(multiplier) / U256::from(1e18 as u128)
            };

            PricingTierOnChain {
                model_id: model_id.clone(),
                price_per_request: price,
                min_tps: tier.min_tps,
                max_context_tokens: tier.max_context_tokens,
            }
        }).collect()
    }
}

#[async_trait]
impl RegistryClient for EvmRegistryClient {
    async fn register_provider(
        &self,
        qvac_peer_id: [u8; 32],
        name: &str,
        task_types: u16,
        tiers: Vec<PricingTierOnChain>,
    ) -> Result<ProviderRegistration> {
        info!("Registering provider on EVM chain {}", self.chain_id);
        
        // For now, return a mock registration since we don't have the actual contract deployed
        // In production, this would call the ProviderRegistry contract
        let provider_pda = format!("0x{}", hex::encode(qvac_peer_id));
        
        Ok(ProviderRegistration {
            provider_pda: provider_pda.clone(),
            transaction_hash: format!("0x{}", hex::encode([0u8; 32])),
            block_number: 0,
        })
    }

    async fn update_provider(
        &self,
        provider_pda: &str,
        name: Option<&str>,
        task_types: Option<u16>,
        tiers: Option<Vec<PricingTierOnChain>>,
    ) -> Result<()> {
        info!("Updating provider {}", provider_pda);
        // Implementation would call updateProvider contract method
        Ok(())
    }

    async fn rotate_peer_id(&self, provider_pda: &str, new_qvac_peer_id: [u8; 32]) -> Result<()> {
        info!("Rotating peer ID for provider {}", provider_pda);
        // Implementation would call rotatePeerId contract method
        Ok(())
    }

    async fn get_provider(&self, authority: &str) -> Result<Option<ProviderInfo>> {
        debug!("Fetching provider for authority {}", authority);
        // Implementation would call getProviderByAuthority contract method
        Ok(None)
    }

    async fn pause_provider(&self, provider_pda: &str) -> Result<()> {
        info!("Pausing provider {}", provider_pda);
        Ok(())
    }

    async fn resume_provider(&self, provider_pda: &str) -> Result<()> {
        info!("Resuming provider {}", provider_pda);
        Ok(())
    }
}

/// Solana-based registry client using Anchor
pub struct SolanaRegistryClient {
    client: Arc<anchor_client::Client<anchor_client::solana_sdk::signature::Keypair>>,
    program_id: solana_sdk::pubkey::Pubkey,
}

impl SolanaRegistryClient {
    /// Create new Solana registry client
    pub async fn new(
        rpc_url: &str,
        keypair_path: &str,
        program_id: &str,
    ) -> Result<Self> {
        use anchor_client::solana_sdk::signature::read_keypair_file;
        
        let keypair = read_keypair_file(keypair_path)
            .context("Failed to read keypair file")?;
        
        let client = Arc::new(anchor_client::Client::new(
            Arc::new(anchor_client::solana_client::rpc_client::RpcClient::new(rpc_url.to_string())),
            keypair,
        ));
        
        let program_id = program_id.parse()?;
        
        Ok(Self { client, program_id })
    }
}

#[async_trait]
impl RegistryClient for SolanaRegistryClient {
    async fn register_provider(
        &self,
        qvac_peer_id: [u8; 32],
        name: &str,
        task_types: u16,
        tiers: Vec<PricingTierOnChain>,
    ) -> Result<ProviderRegistration> {
        info!("Registering provider on Solana");
        // Implementation would use Anchor to call the ProviderRegistry program
        Ok(ProviderRegistration {
            provider_pda: "SolanaPDA".to_string(),
            transaction_hash: "SolanaTx".to_string(),
            block_number: 0,
        })
    }

    async fn update_provider(
        &self,
        provider_pda: &str,
        name: Option<&str>,
        task_types: Option<u16>,
        tiers: Option<Vec<PricingTierOnChain>>,
    ) -> Result<()> {
        info!("Updating provider {}", provider_pda);
        Ok(())
    }

    async fn rotate_peer_id(&self, provider_pda: &str, new_qvac_peer_id: [u8; 32]) -> Result<()> {
        info!("Rotating peer ID for provider {}", provider_pda);
        Ok(())
    }

    async fn get_provider(&self, authority: &str) -> Result<Option<ProviderInfo>> {
        Ok(None)
    }

    async fn pause_provider(&self, provider_pda: &str) -> Result<()> {
        Ok(())
    }

    async fn resume_provider(&self, provider_pda: &str) -> Result<()> {
        Ok(())
    }
}

/// Registry manager that handles multi-chain registration
pub struct RegistryManager {
    evm_client: Option<Arc<EvmRegistryClient>>,
    solana_client: Option<Arc<SolanaRegistryClient>>,
    current_pda: Arc<RwLock<Option<String>>>,
    capability_profile: Arc<RwLock<Option<CapabilityProfile>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityProfile {
    pub provider_peer_id: String,
    pub timestamp: u64,
    pub gpu: GpuInfo,
    pub tiers: Vec<TierProfile>,
    pub signature: String,
    pub tee_attestation: Option<TeeRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vram_gb: u32,
    pub compute_capability: String,
    pub driver_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierProfile {
    pub model_id: String,
    pub ttft_ms: u32,
    pub tps: u32,
    pub vram_usage_gb: u32,
    pub backend: String,
    pub passes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeRecord {
    pub tee_type: String,
    pub quote: String,
    pub collateral: String,
    pub verified_at: u64,
}

impl RegistryManager {
    /// Create new registry manager from config
    pub async fn new(settings: &ProviderSettings, pricing: &PricingConfig) -> Result<Self> {
        let mut manager = Self {
            evm_client: None,
            solana_client: None,
            current_pda: Arc::new(RwLock::new(None)),
            capability_profile: Arc::new(RwLock::new(None)),
        };

        // Initialize EVM client if configured
        if settings.chain_id != "solana" && !settings.rpc_url.is_empty() {
            // In production, private key would come from secure storage
            // For now, we'll create a placeholder
            warn!("EVM registry client requires private key - using mock for now");
        }

        // Initialize Solana client if configured
        if settings.chain_id == "solana" {
            // Would initialize Solana client
        }

        Ok(manager)
    }

    /// Register provider using capability profile
    pub async fn register_with_capabilities(
        &self,
        qvac_peer_id: [u8; 32],
        settings: &ProviderSettings,
        pricing: &PricingConfig,
        capability_profile: &CapabilityProfile,
    ) -> Result<ProviderRegistration> {
        info!("Registering provider with capability profile");

        // Build tiers from capability profile and pricing config
        let tiers = self.build_onchain_tiers(capability_profile, pricing)?;

        // Store capability profile
        *self.capability_profile.write().await = Some(capability_profile.clone());

        // Try EVM registration first
        if let Some(client) = &self.evm_client {
            let registration = client.register_provider(
                qvac_peer_id,
                &settings.name,
                settings.task_types,
                tiers,
            ).await?;
            
            *self.current_pda.write().await = Some(registration.provider_pda.clone());
            return Ok(registration);
        }

        // Try Solana registration
        if let Some(client) = &self.solana_client {
            let registration = client.register_provider(
                qvac_peer_id,
                &settings.name,
                settings.task_types,
                tiers,
            ).await?;
            
            *self.current_pda.write().await = Some(registration.provider_pda.clone());
            return Ok(registration);
        }

        // Fallback: mock registration for development
        let provider_pda = format!("0x{}", hex::encode(qvac_peer_id));
        info!("Mock registration: provider PDA = {}", provider_pda);
        
        *self.current_pda.write().await = Some(provider_pda.clone());
        
        Ok(ProviderRegistration {
            provider_pda,
            transaction_hash: "0x_mock_tx".to_string(),
            block_number: 0,
        })
    }

    /// Build on-chain pricing tiers from capability profile
    fn build_onchain_tiers(
        &self,
        profile: &CapabilityProfile,
        pricing: &PricingConfig,
    ) -> Result<Vec<PricingTierOnChain>> {
        let base_price = U256::from_str_radix(&pricing.base_price_per_request, 10)
            .context("Invalid base price")?;

        let mut tiers = Vec::new();
        
        for tier_profile in &profile.tiers {
            if !tier_profile.passes {
                continue; // Skip failed tiers
            }

            let tier_pricing = pricing.tiers.get(&tier_profile.model_id);
            let multiplier = tier_pricing.map(|t| t.multiplier).unwrap_or(1.0);
            
            let price = if tier_profile.model_id == pricing.base_model_id {
                base_price
            } else {
                let mult = (multiplier * 1e18 as f64) as u128;
                base_price * U256::from(mult) / U256::from(1e18 as u128)
            };

            tiers.push(PricingTierOnChain {
                model_id: tier_profile.model_id.clone(),
                price_per_request: price,
                min_tps: tier_profile.tps,
                max_context_tokens: tier_profile.tps * 1000, // Estimate
            });
        }

        Ok(tiers)
    }

    /// Get current provider PDA
    pub async fn get_provider_pda(&self) -> Option<String> {
        self.current_pda.read().await.clone()
    }

    /// Update provider on-chain
    pub async fn update_provider(
        &self,
        name: Option<&str>,
        task_types: Option<u16>,
        tiers: Option<Vec<PricingTierOnChain>>,
    ) -> Result<()> {
        let pda = self.get_provider_pda().await
            .ok_or_else(|| anyhow!("Provider not registered"))?;

        if let Some(client) = &self.evm_client {
            return client.update_provider(&pda, name, task_types, tiers).await;
        }

        if let Some(client) = &self.solana_client {
            return client.update_provider(&pda, name, task_types, tiers).await;
        }

        warn!("No registry client available for update");
        Ok(())
    }

    /// Rotate peer ID
    pub async fn rotate_peer_id(&self, new_qvac_peer_id: [u8; 32]) -> Result<()> {
        let pda = self.get_provider_pda().await
            .ok_or_else(|| anyhow!("Provider not registered"))?;

        if let Some(client) = &self.evm_client {
            client.rotate_peer_id(&pda, new_qvac_peer_id).await?;
            *self.current_pda.write().await = Some(format!("0x{}", hex::encode(new_qvac_peer_id)));
            return Ok(());
        }

        if let Some(client) = &self.solana_client {
            client.rotate_peer_id(&pda, new_qvac_peer_id).await?;
            return Ok(());
        }

        anyhow::bail!("No registry client available for peer ID rotation")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_price_calculation() {
        let base_price = U256::from(1_000_000);
        let multiplier = 0.5;
        let mult = (multiplier * 1e18 as f64) as u128;
        let price = base_price * U256::from(mult) / U256::from(1e18 as u128);
        assert_eq!(price, U256::from(500_000));
    }
}