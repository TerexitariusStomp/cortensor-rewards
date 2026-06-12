# QVAC Provider Daemon

**Decentralized Compute Marketplace Provider Integration Layer**

A production-ready provider-side agent for the QVAC decentralized compute marketplace. Registers GPU resources on-chain, heartbeats availability, receives matched orders, launches workloads in isolated Firecracker/gVisor containers, streams attestations, and claims payment on completion.

## Features

- **On-Chain Registration**: Registers with ComputeRegistry with attested GPU specs (EVM + Solana support)
- **Capability Probing**: Dynamic GPU benchmarking across model ladder (QWEN3 600M → QWEN2.5 32B)
- **TEE Attestation**: Intel TDX, AMD SEV-SNP support for verification tiers 1-3
- **P2P Discovery**: Hyperswarm/HyperDHT market + per-provider quote topics
- **Transport Firewall**: Conduit-pattern payment gating - zero bytes served to non-payers
- **Workload Isolation**: Firecracker microVMs (default) or gVisor containers
- **Attestation Streaming**: CPU cycles, runtime, output hash to verifier service
- **Settlement**: EIP-3009 per-inference + EIP-712 escrow channel support
- **Observability**: Prometheus metrics, structured JSON logging, health checks

## Quick Start: Onboard a New Provider in <15 Minutes

### Prerequisites

- Linux server with NVIDIA GPU (RTX 3090/4090, A100, H100, etc.)
- Docker 24+ with NVIDIA Container Toolkit
- Ethereum wallet with ETH for gas (or Solana wallet for Solana deployment)
- Domain name (optional, for TLS)

### 1. Install Docker & NVIDIA Toolkit (2 min)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.4-base nvidia-smi
```

### 2. Generate Configuration (1 min)

```bash
# Pull the image
docker pull ghcr.io/terexitarius/qvac-provider:latest

# Generate default config
docker run --rm -v $(pwd)/config:/home/qvac/config \
  ghcr.io/terexitarius/qvac-provider:latest gen-config -o /home/qvac/config/qvac.config.json
```

### 3. Configure Your Provider (3 min)

Edit `config/qvac.config.json`:

```json
{
  "provider": {
    "name": "My RTX 4090 Node",
    "taskTypes": 7,
    "authority": "0xYourEthereumAddressHere",
    "rpcUrl": "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
    "chainId": "1",
    "verificationTier": 1,
    "teeEndpoint": "https://tee.attestation.yourprovider.com"
  },
  "pricing": {
    "baseModelId": "QWEN3_8B_INST_Q4_K_M",
    "basePricePerRequest": "1000000"
  }
}
```

**Required changes:**
- `provider.authority` - Your on-chain address (EOA or multisig)
- `provider.rpcUrl` - Ethereum RPC endpoint (Alchemy, Infura, QuickNode, etc.)
- `provider.verificationTier` - 0 (none), 1 (TEE-lite), 2 (ZK-ML), 3 (Replicated)
- `pricing.basePricePerRequest` - Price in wei per request (1,000,000 = 0.001 ETH)

### 4. Generate Hyperswarm Seed (1 min)

```bash
# Generate once and store securely
openssl rand -hex 32 > config/seed.txt
chmod 600 config/seed.txt
```

### 5. Run Provider (1 min)

**Docker (recommended):**
```bash
docker run -d \
  --name qvac-provider \
  --restart unless-stopped \
  --gpus all \
  --device /dev/kvm \
  -v $(pwd)/config:/home/qvac/config \
  -v qvac-models:/home/qvac/models \
  -v qvac-logs:/home/qvac/logs \
  -p 9090:9090 \
  ghcr.io/terexitarius/qvac-provider:latest
```

**Systemd (bare metal):**
```bash
sudo cp systemd/qvac-provider.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qvac-provider
```

### 6. Verify It's Working (2 min)

```bash
# Check logs
docker logs -f qvac-provider

# Check metrics
curl http://localhost:9090/metrics | grep qvac_

# Run capability probe
docker exec qvac-provider qvac-provider probe --config /home/qvac/config/qvac.config.json

# Check status
docker exec qvac-provider qvac-provider status --config /home/qvac/config/qvac.config.json
```

Expected output:
```
GPU: NVIDIA RTX 4090 (24GB VRAM)
Compute Capability: 8.9
Driver: 550.90
Tiers (6):
  ✓ QWEN3_600M - TTFT: 45ms, TPS: 125, VRAM: 1GB
  ✓ QWEN3_1_7B - TTFT: 78ms, TPS: 85, VRAM: 2GB
  ✓ QWEN3_4B - TTFT: 115ms, TPS: 48, VRAM: 3GB
  ✓ QWEN3_8B_INST_Q4_K_M - TTFT: 195ms, TPS: 26, VRAM: 5GB
  ✓ LLAMA3_8B_INST_Q4 - TTFT: 240ms, TPS: 21, VRAM: 5GB
  ✗ QWEN2_5_32B_Q4 - SKIPPED (insufficient VRAM)
```

### 7. Register On-Chain (2 min)

```bash
# If not auto-registered on start:
docker exec qvac-provider qvac-provider register \
  --config /home/qvac/config/qvac.config.json \
  --name "My RTX 4090 Node" \
  --task-types 7
```

You should see:
```
Registered: PDA = 0xabc123...
Transaction: 0xdef456...
```

### 8. Verify Marketplace Visibility (1 min)

```bash
# Query matching engine (if available)
curl -s "https://matching.compute-market.example.com/v1/orderbook?taskType=1" | jq '.asks[] | select(.providerAuthority=="0xYourAddress")'
```

You should see your ask orders in the order book!

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      QVAC PROVIDER DAEMON                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Registry   │  │   Prober     │  │      P2P Client      │  │
│  │  Manager     │  │  (GPU Bench) │  │  (Hyperswarm/DHT)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └─────────────────┼──────────────────────┘              │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    CORE LOOP                              │   │
│  │  1. Announce on market topic (every 30s)                 │   │
│  │  2. Listen for quote requests on quote topic             │   │
│  │  3. Verify payment via Transport Firewall                │   │
│  │  4. Launch workload in Firecracker/gVisor                │   │
│  │  5. Stream attestations (CPU, memory, output hash)       │   │
│  │  6. Claim payment on completion                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Reference

### Provider Settings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name |
| `taskTypes` | u16 | Yes | Bitmask: 1=LLM, 2=Embedding, 4=ImageGen, 8=Audio |
| `authority` | string | Yes | On-chain address (0x...) |
| `rpcUrl` | string | Yes | EVM RPC endpoint |
| `chainId` | string | Yes | Chain ID (1=mainnet, 11155111=sepolia, "solana") |
| `verificationTier` | u8 | No | 0=none, 1=TEE-lite, 2=ZK-ML, 3=Replicated |
| `teeEndpoint` | string | Tier≥1 | TEE attestation service URL |
| `maxConcurrentSessions` | u32 | No | Max parallel inferences (default: 4) |

### Pricing

```json
{
  "baseModelId": "QWEN3_8B_INST_Q4_K_M",
  "basePricePerRequest": "1000000",
  "tiers": {
    "QWEN3_600M": { "multiplier": 0.1, "minTPS": 50 },
    "QWEN3_8B_INST_Q4_K_M": { "multiplier": 1.0, "minTPS": 15 }
  },
  "token": { "address": "0x0", "decimals": 18, "protocolFeeBps": 100 }
}
```

### Workload Isolation

| Backend | Description | Use Case |
|---------|-------------|----------|
| `firecracker` | KVM microVMs (default) | Production, best isolation |
| `gvisor` | runsc containers | Compatibility, no KVM |
| `bare` | Direct process | Testing only |

## CLI Reference

```bash
# Start daemon
qvac-provider start --config qvac.config.json [--foreground]

# Register provider
qvac-provider register --config qvac.config.json --name "My Node" --task-types 7

# Update provider
qvac-provider update --config qvac.config.json --name "New Name"

# Rotate peer ID
qvac-provider rotate-peer-id --config qvac.config.json --new-seed <hex>

# Check status
qvac-provider status --config qvac.config.json [--json]

# Run capability probe
qvac-provider probe --config qvac.config.json [--quick]

# Test workload
qvac-provider test-workload --config qvac.config.json --model QWEN3_8B_INST_Q4_K_M

# Generate config
qvac-provider gen-config -o qvac.config.json
```

## Verification Tiers

| Tier | Method | Trust Assumption | Latency | Hardware Required |
|------|--------|-----------------|---------|-------------------|
| **T0** | Reputation only | Provider honest | 0% | None |
| **T1** | TEE-lite | TEE hardware + remote attestation | ~5-10% | Intel TDX / AMD SEV-SNP |
| **T2** | ZK-ML | Cryptographic | ~100-1000% | Prover infrastructure |
| **T3** | Replicated | Majority honesty | 2-3x cost | Multiple providers |

## Monitoring

### Prometheus Metrics

```bash
# Available at http://localhost:9090/metrics
qvac_provider_announcements_total
qvac_provider_quotes_total
qvac_provider_active_sessions
qvac_provider_workloads_running
qvac_provider_workloads_completed_total
qvac_provider_claims_submitted_total
qvac_provider_claims_confirmed_total
qvac_provider_attestation_events_total
qvac_gpu_memory_used_bytes
qvac_gpu_utilization_percent
```

### Health Checks

```bash
# Docker health check
docker ps --filter "name=qvac-provider" --format "{{.Status}}"

# HTTP health
curl -f http://localhost:9090/metrics

# Structured log grep
docker logs qvac-provider 2>&1 | jq 'select(.level=="error")'
```

## Security

### Firewall Rules

The transport firewall implements the Conduit pattern:

1. Consumer requests quote → Provider signs quote with Ed25519
2. Consumer pays on-chain (EIP-3009) → Creates Job PDA in escrow
3. Firewall verifies payment + nonce → Grants P2P connection
4. **Zero bytes served without valid payment proof**

### Key Management

- Hyperswarm seed: 32-byte hex, stored in `config/seed.txt` (chmod 600)
- On-chain authority: EOA or multisig (Gnosis Safe recommended)
- TEE keys: Hardware-isolated, never leave enclave

### Container Hardening

- Runs as non-root user `qvac`
- Read-only root filesystem
- Minimal capabilities (only KVM, NET_ADMIN for Firecracker)
- No new privileges
- GPU device access via NVIDIA Container Toolkit

## Troubleshooting

### GPU Not Detected

```bash
# Check NVIDIA driver
nvidia-smi

# Check container GPU access
docker run --rm --gpus all nvidia/cuda:12.4-base nvidia-smi

# Check KVM
ls -la /dev/kvm
```

### Firecracker Won't Start

```bash
# Verify KVM
kvm-ok

# Check kernel
uname -r  # Need 5.10+

# Check firecracker binary
firecracker --version
```

### Registration Fails

```bash
# Check RPC
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $RPC_URL

# Check wallet balance
cast balance $AUTHORITY --rpc-url $RPC_URL
```

### P2P Connection Issues

```bash
# Check Hyperswarm connectivity
nc -zv bootstrap1.hyperswarm.org 443

# Check firewall
sudo iptables -L -n | grep -E "30000|443"
```

## Development

### Build from Source

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install dependencies
sudo apt-get install -y pkg-config libssl-dev libclang-dev cmake build-essential

# Build
cargo build --release

# Binary at target/release/qvac-provider
```

### Run Tests

```bash
cargo test --all-features
```

### Linting

```bash
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --all --check
```

## Deployment Checklist

- [ ] NVIDIA drivers installed and working
- [ ] Docker + NVIDIA Container Toolkit configured
- [ ] KVM enabled (`/dev/kvm` accessible)
- [ ] Hyperswarm seed generated and secured
- [ ] On-chain address funded for gas
- [ ] RPC endpoint reliable (multiple fallbacks recommended)
- [ ] Config validated (`qvac-provider status --json`)
- [ ] Capability probe passes for target models
- [ ] On-chain registration confirmed
- [ ] Matching engine shows your asks
- [ ] Prometheus scraping metrics
- [ ] Log aggregation configured
- [ ] Alerting on: claim failures, GPU OOM, P2P disconnects

## License

MIT OR Apache-2.0

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Support

- Issues: https://github.com/terexitarius/qvac-provider/issues
- Discord: https://discord.gg/qvac
- Docs: https://qvac.dev/docs/provider