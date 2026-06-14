# Stellar App Integration Guide

## Overview

This guide explains how the QVAC-Pear Miner Node integrates with the Stellar astronomy app for time-based resource allocation and earning optimization.

## What is Stellar?

Stellar is an astronomy app that uses smartphone cameras as sky sensors:
- **Purpose**: Dark-sky site observations and celestial photography
- **Technology**: On-device AI for image processing
- **Rewards**: Users earn tokens for contributing sky data
- **Platform**: Android, built on Solana blockchain
- **QVAC Integration**: Uses QVAC SDK for local AI inference

## Integration Architecture

### Time-Based Resource Allocation

```
Night (8 PM - 6 AM)          Day (6 AM - 8 PM)
┌─────────────────┐          ┌─────────────────┐
│  Stellar App    │          │  Inference      │
│  - Sky Sensing  │          │  - AI Tasks     │
│  - Photography  │          │  - Mining       │
│  - AI Processing│          │  - Earning      │
│  - Data Upload  │          │  - Rewards      │
└─────────────────┘          └─────────────────┘
        │                            │
        └──────────┬─────────────────┘
                   │
            ┌──────▼──────┐
            │   Node       │
            │   Manager    │
            └──────┬──────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
    ┌───▼───┐  ┌──▼───┐  ┌──▼───┐
    │Cortensor│ │Chutes │ │Fortytwo│ │Earnidle│
    │Monitor  │ │Monitor│ │Monitor│ │Monitor│
    └─────────┘ └───────┘ └────────┘ └───────┘
```

### Parallel Miner Monitoring

All four miners run simultaneously in monitoring mode:

1. **CortensorMiner**: Monitors for AI network tasks
2. **ChutesMiner**: Monitors for GPU compute tasks
3. **FortytwoMiner**: Monitors for decentralized AI inference
4. **EarnidleMiner**: Monitors for idle compute opportunities

When an inference task arrives:
- TaskMonitor immediately notifies all miners
- Miners can pause or adjust resource allocation
- Inference takes priority during day mode
- Stellar takes priority during night mode

## Configuration

### Enable Parallel Monitoring

Edit `config.json`:

```json
{
  "miners": {
    "enabled": true,
    "parallelMode": true,
    "priority": ["cortensor", "chutes", "fortytwo", "earnidle"]
  },
  "scheduler": {
    "enabled": true,
    "nightStart": 20,
    "nightEnd": 6,
    "timezone": "UTC"
  }
}
```

### Customize Schedule

Adjust night hours based on your location and preferences:

```json
{
  "scheduler": {
    "nightStart": 21,  // 9 PM
    "nightEnd": 7,     // 7 AM
    "timezone": "America/New_York"
  }
}
```

## Usage

### Basic Integration

```javascript
import { StellarIntegration } from './examples/stellar-integration.js';
import { NodeManager } from './src/core/NodeManager.js';

// Initialize node
const nodeManager = new NodeManager(config);
await nodeManager.initialize();
await nodeManager.start();

// Initialize Stellar integration
const stellar = new StellarIntegration(nodeManager);
await stellar.initialize();

// Check status
console.log(stellar.getStatus());
```

### Handle Stellar Data

```javascript
// Process astronomy images during night
if (stellar.isStellarActive) {
  const result = await stellar.handleStellarData(imageData);
  console.log(`Detected ${result.objectsDetected.length} objects`);
}
```

### Monitor Inference Tasks

```javascript
// Task monitor automatically detects inference tasks
// Miners are notified immediately
// No manual polling required
```

## Benefits

### For Users
- **Maximized Earning**: Earn from inference during day, Stellar rewards at night
- **No Conflicts**: Automatic resource allocation prevents app conflicts
- **Passive Income**: Both apps run automatically based on schedule
- **Optimal Performance**: Each app gets dedicated resources when active

### For the Network
- **Increased Participation**: More nodes available during peak hours
- **Better Resource Utilization**: Devices contribute when not in use
- **Reliable Inference**: Parallel monitoring ensures immediate response
- **Scalable Architecture**: Easy to add more apps and miners

## Technical Details

### Mode Switching

The TimeScheduler checks the current time every minute:
- Night mode: 8 PM - 6 AM (configurable)
- Day mode: 6 AM - 8 PM (configurable)
- Automatic transition between modes
- Callbacks notify components of mode changes

### Task Detection

The TaskMonitor provides:
- Real-time inference task registration
- Immediate notification to all miners
- Task status tracking
- Automatic cleanup of completed tasks

### Miner Behavior

In parallel monitoring mode:
- All miners run simultaneously
- Low resource consumption (monitoring state)
- Immediate response to inference tasks
- Can pause/adjust based on mode

## Troubleshooting

### Stellar App Not Activating

Check scheduler configuration:
```bash
# Check current mode
node -e "console.log(new Date().getHours())"
```

Verify timezone setting in config.json matches your location.

### Miners Not Monitoring

Ensure parallel mode is enabled:
```json
{
  "miners": {
    "parallelMode": true
  }
}
```

### Inference Tasks Not Detected

Check task monitor status:
```javascript
const status = nodeManager.getStatus();
console.log(status.tasks);
```

## Example Scenarios

### Scenario 1: Daytime Inference

1. User is at work, phone idle
2. TimeScheduler detects day mode
3. All miners running in parallel monitoring
4. Inference task arrives from app
5. TaskMonitor immediately notifies all miners
6. Miners adjust resources for inference
7. User earns from completing task

### Scenario 2: Nighttime Astronomy

1. User at dark-sky site with Stellar app
2. TimeScheduler detects night mode
3. Stellar app activates for sky sensing
4. Miners continue monitoring in background
5. User takes celestial photos
6. On-device AI processes images
7. Data uploaded for rewards
8. Miners ready to pause if inference needed

### Scenario 3: Transition Period

1. Time approaches 6 AM
2. TimeScheduler prepares for mode change
3. Stellar app finishes current observation
4. Data uploaded and app closes
5. Mode switches to day
6. Device ready for inference earning
7. Miners already monitoring for tasks

## Future Enhancements

- [ ] Weather-based mode switching (cloudy nights = inference mode)
- [ ] GPU resource sharing between apps
- [ ] Multi-node coordination for large projects
- [ ] Real-time earning dashboard
- [ ] Mobile app for monitoring
- [ ] Automatic reward claiming
- [ ] Historical earnings analytics

## Resources

- [Stellar GitHub](https://github.com/Rezimod/Stellar)
- [QVAC Documentation](https://github.com/tetherto/qvac)
- [Pear Runtime](https://docs.pears.com/)
- [Hypercore](https://github.com/holepunchto/hypercore)

## Support

For issues or questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: See `/docs` directory
- Examples: See `/examples` directory
