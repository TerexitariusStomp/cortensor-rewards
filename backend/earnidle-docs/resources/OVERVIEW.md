# EarnIdle Resources Overview

## PC (Personal Computer)
EarnIdle runs in the browser on any device with WebAssembly and WebGPU support. No installation required — just open the page and opt in.

## Wallet
Users connect any EVM-compatible wallet (MetaMask, WalletConnect). Wallets are used for:
- Identity (nodeId derivation)
- Payout destination (USDC/QVAC on supported chains)
- Signing job submissions and proofs

## Agent
Each running resource is an autonomous agent that:
1. Polls the market for available jobs
2. Executes workloads locally in the browser
3. Generates cryptographic proofs of correct execution
4. Submits results and receives payouts

## Data
All data stays in the browser:
- Model weights cached in IndexedDB (transformers.js)
- Job inputs/outputs processed locally
- Proof generation uses client-side WASM
- No user data leaves the browser except signed results

## API
EarnIdle resources communicate with markets via REST:
- `GET /job` — poll for available work
- `POST /result` — submit completed work with proof
- `GET /status` — market health and capacity

Supported markets:
- EarnIdle Inference (`api.earnidle.com`)
- EarnIdle VM (`api.earnidle.com`)
- QVAC Market (`api.qvac.network`)

## GPU
When available, WebGPU accelerates inference (transformers.js device: 'webgpu').
Falls back to WASM automatically. No CUDA, no drivers, no installation.