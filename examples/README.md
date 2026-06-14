# Stellar Integration Example

This directory contains integration examples for the QVAC-Pear Miner Node.

## Stellar App Integration

The Stellar app integration demonstrates time-based resource allocation:

### Night Mode (8 PM - 6 AM)
- Stellar app is active for astronomy observations
- Device camera used for sky sensing
- On-device AI processes celestial images
- Miners run in parallel monitoring mode
- Inference tasks paused to prioritize Stellar

### Day Mode (6 AM - 8 PM)
- Stellar app is inactive
- Device available for inference earning
- All miners monitor for inference tasks in parallel
- Immediate detection and response to inference requests
- Maximum earning potential during daylight hours

### Key Features

1. **Automatic Mode Switching**: Time-based scheduler automatically switches between night and day modes
2. **Parallel Miner Monitoring**: All four miners (Cortensor, Chutes, Fortytwo, Earnidle) monitor simultaneously
3. **Immediate Task Detection**: Task monitor notifies all miners instantly when inference tasks arrive
4. **Resource Optimization**: Device resources allocated based on time of day and app usage

### Running the Example

```bash
node examples/stellar-integration.js
```

### Configuration

Edit `config.json` to customize:
- Night/day hours (default: 8 PM - 6 AM)
- Parallel monitoring mode
- Miner priorities
- Inference settings

### Architecture

```
┌─────────────────────────────────────────────────┐
│           Time Scheduler                        │
│    (Automatically switches night/day)           │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼──────┐
│  Night Mode   │  │  Day Mode   │
│               │  │             │
│ Stellar App  │  │ Inference   │
│ Active       │  │ Earning     │
│               │  │             │
│ Sky Sensing  │  │ All Miners  │
│ AI Processing│  │ Monitoring  │
└───────────────┘  └─────────────┘
        │                 │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  Task Monitor   │
│ (Immediate task    │
│  detection)        │
└────────┬───────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐ ┌───▼───┐ ┌───▼───┐
│Cortensor│ │Chutes │ │Fortytwo│ │Earnidle│
│         │ │       │ │        │ │        │
│Monitoring│ │Monitoring│ │Monitoring│ │Monitoring│
└─────────┘ └────────┘ └────────┘ └────────┘
```

### Integration with Stellar App

The Stellar app (https://github.com/Rezimod/Stellar) integrates with QVAC for on-device AI:

1. **QVAC Integration**: Stellar uses QVAC SDK for local AI inference
2. **Dark Sky Sites**: Optimized for astronomy observations at night
3. **Rewards**: Users earn tokens for contributing sky data
4. **Solana Blockchain**: Built on Solana for reward distribution

### Benefits

- **Maximized Earning**: Earn from inference during day, Stellar rewards at night
- **Resource Efficiency**: No resource conflicts between apps
- **Automatic Operation**: No manual switching required
- **Parallel Monitoring**: Never miss inference opportunities
- **Immediate Response**: Miners react instantly to tasks

### Future Enhancements

- GPU resource sharing between Stellar and inference
- Dynamic mode switching based on weather
- Multi-node coordination for large astronomy projects
- Real-time earning dashboard
- Mobile app support
