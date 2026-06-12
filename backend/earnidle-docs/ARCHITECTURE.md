# EarnIdle Architecture

## High-Level Components

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   container.js  │────▶│   idle.js (API)  │────▶│  Resource Workers │
│   (UI/Config)   │     │   (Event Bus)    │     │  (.worker.js)    │
└─────────────────┘     └──────────────────┘     └──────────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
   ┌─────────────┐        ┌─────────────┐        ┌─────────────────┐
   │ Service     │        │ Global      │        │ Web Worker      │
   │ Registry    │        │ State       │        │ Message Loop    │
   └─────────────┘        └─────────────┘        └─────────────────┘
                                                        │
                                               ┌────────┴────────┐
                                               ▼               ▼
                                        ┌───────────┐     ┌───────────┐
                                        │  IndexedDB│     │  Market   │
                                        │ Persistence│     │  REST API │
                                        └───────────┘     └───────────┘
```

## Core Modules

### `idle.js` — Global API & Event Bus
- Singleton via `globalThis[Symbol.for('earnidle')]`
- `idle.start(config)` — spawns workers for each resource
- `idle.on(fn)` — subscribe to events
- `idle.emit(name, payload)` — broadcast to listeners
- Maps resource name → `./resources/<name>.worker.js`

### `container.js` — UI Service Manager
- Service registry with config, status, logs
- Renders service cards with Start/Stop/Reconfigure
- Handles browser-native (Web Worker) and external services
- Connects worker messages to UI log stream

### Resource Workers (`src/resources/*.worker.js`)
- Web Workers loaded as ES Modules
- State machine: `boot → ready → running → stopping → stopped`
- Job loop: poll → execute → prove → submit → repeat
- Persist state to IndexedDB for crash recovery

## Message Flow

```
User clicks "Start"
       │
       ▼
container.js:startService()
       │
       ▼
new Worker('./src/resources/<name>.worker.js', {type:'module'})
       │
       ▼
worker.postMessage({type:'start', data:{wallet, nodeId, ...}})
       │
       ▼
worker:self.onmessage → init() → runLoop()
       │
       ├──▶ poll job from market API
       ├──▶ execute workload (inference/VM/QVAC)
       ├──▶ generate proof (if applicable)
       ├──▶ submit result to market API
       ├──▶ postMessage({type:'job', status:'complete', payout})
       ├──▶ postMessage({type:'earnings', amount, total})
       └──▶ repeat (await sleep(30000))

User clicks "Stop"
       │
       ▼
worker.terminate() or worker.postMessage({type:'stop'})
       │
       ▼
worker:shutdown() → postMessage({type:'stopped', jobs, payout})
```

## Markets

| Market | API Base | Resources | Payout Token |
|--------|----------|-----------|--------------|
| EarnIdle Inference | `api.earnidle.com/api/inference` | inference | USDC |
| EarnIdle VM | `api.earnidle.com/api/vm` | vm | USDC |
| QVAC | `api.qvac.network/api` | qvac | QVAC |

## Security Model

- All computation in browser sandbox (Web Worker)
- Private keys never leave wallet (signing via wallet RPC)
- Proofs generated client-side (WASM ZK, TEE attestation)
- Results signed by wallet before submission
- No centralized control — user owns their node