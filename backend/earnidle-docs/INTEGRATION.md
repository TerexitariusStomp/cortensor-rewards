# EarnIdle Integration Guide

## Quick Start

```html
<script type="module">
  import idle from './src/core/idle.js';
  
  // Start earning with default resources
  await idle.start({
    wallet: '0x...',        // Your EVM wallet address
    nodeId: 'node-1',       // Unique node identifier
    resources: ['inference', 'qvac'] // Resources to enable
  });
  
  // Listen for events
  idle.on((name, payload) => {
    console.log(`${name}:`, payload);
  });
</script>
```

## Container UI

Open `container.html` in a browser (served via `python3 -m http.server 8080`):
1. Configure wallet and nodeId for each service
2. Click "Start" to begin earning
3. Monitor logs and payouts in real-time

## Adding Custom Resources

1. Create `src/resources/<name>.worker.js` following the worker protocol
2. Call `idle.start({ resources: ['<name>'], ... })`
3. Optionally add to `container.js` for UI management

## Resource Configuration

| Parameter | Required | Description |
|-----------|----------|-------------|
| `wallet` | Yes | EVM address for identity and payouts |
| `nodeId` | Yes | Unique node identifier |
| `tier` | No | Inference quality tier (high/medium/low) |
| `marketId` | No | Market identifier (qvac-mainnet, etc.) |
| `workload` | No | Workload type (inference, verification, attestation) |

## Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `started` | `{ contributionId, resource }` | Resource worker started |
| `contribution` | `{ contributionId, status, lastEvent, lastPayout }` | Status update |
| `stopped` | — | All resources stopped |