# EarnIdle Worker Protocol

## Inbound Messages (Container → Worker)

All messages are sent via `worker.postMessage({ type, data })`.

### `start`
Initializes the worker with configuration.

```json
{
  "type": "start",
  "data": {
    "wallet": "0x...",
    "nodeId": "node-1",
    "tier": "high",
    "marketId": "qvac-mainnet",
    "workload": "inference"
  }
}
```

| Field | Required | Resources | Description |
|-------|----------|-----------|-------------|
| `wallet` | Yes | All | EVM address |
| `nodeId` | Yes | All | Unique node identifier |
| `tier` | No | inference | Quality tier |
| `marketId` | No | qvac | Market identifier |
| `workload` | No | qvac, vm | Workload type |

### `stop`
Gracefully shuts down the worker.

```json
{ "type": "stop", "data": {} }
```

## Outbound Messages (Worker → Container)

All messages are sent via `self.postMessage({ type, ...payload })`.

| Type | Payload | When |
|------|---------|------|
| `boot` | `{ sessionId }` | After start, before work begins |
| `status` | `{ status }` | Any state transition |
| `started` | `{ sessionId, workload?, marketId? }` | Entering main loop |
| `job` | `{ jobId, status, payout? }` | Per job lifecycle |
| `earnings` | `{ amount, total }` | After successful submit |
| `error` | `{ message }` | Any caught error |
| `stopped` | `{ sessionId, jobs, payout }` | After stop processed |
| `unknown` | `{ command }` | Unrecognized inbound type |

## Status Values

`idle` → `booting` → `ready` → `running` → `stopping` → `stopped`
                          ↘ `error` (on failure)

## Worker Requirements

- Must be ES Module (`{ type: 'module' }`)
- Communicates only via `self.onmessage` / `self.postMessage`
- No ES exports required or read
- All async work must yield (no blocking event loop)
- Handle `stop` message for graceful shutdown