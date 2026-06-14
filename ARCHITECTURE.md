# Architecture

## Overview

The QVAC-Pear Miner Node is a distributed system that combines AI inference with multi-protocol mining capabilities. The node operates in two modes:

1. **Inference Mode**: Serves AI requests via QVAC when active
2. **Mining Mode**: Automatically switches to mining when idle

## Components

### Core Layer

- **NodeManager**: Main orchestrator that coordinates all components
- **Logger**: Centralized logging system
- **Utils**: Common utilities (ID generation, hashing, etc.)

### Inference Layer

- **QVACInferenceLayer**: Integration with QVAC SDK for local AI inference
  - Handles LLM requests, speech-to-text, translation
  - Monitors activity to detect idle periods
  - Manages concurrent request limits

### Storage Layer

- **HypercoreStore**: Distributed data storage using Hypercore
  - Secure, append-only log structure
  - P2P replication capabilities
  - Stores node state, configuration, and mining data

### P2P Layer

- **PearP2P**: Peer-to-peer networking via Pear Runtime
  - Peer discovery via Hyperswarm
  - App distribution without cloud infrastructure
  - Message broadcasting to peers

### Mining Layer

- **MinerManager**: Orchestrates multiple mining protocols
  - Automatic switching between miners based on priority
  - Configurable switch intervals
  - State persistence via Hypercore

#### Supported Miners

1. **CortensorMiner**: Decentralized AI network for proof-of-useful-work
2. **ChutesMiner**: GPU mining with automatic validation
3. **FortytwoMiner**: Decentralized AI inference network
4. **EarnidleMiner**: Idle compute protocol for multiple venues

### Authentication Layer

- **AuthService**: Simple sign-in system
  - Email or wallet-based authentication
  - Session management
  - No complex OAuth required

### Web Layer

- **WebServer**: HTTP server for download and consent flow
  - Consent form with detailed information
  - Simple sign-in interface
  - Download link generation

## Data Flow

### Inference Request Flow

```
App Request → QVACInferenceLayer → Process → Response
                ↓
            Update Activity
                ↓
            Check Idle Status
```

### Mining Switch Flow

```
Idle Detected → MinerManager → Select Miner → Start Mining
                ↓
            Store State in Hypercore
                ↓
            Switch at Interval
```

### P2P Distribution Flow

```
App Update → PearP2P → Broadcast → Peers Receive → Install
```

## Configuration

The node is configured via `config.json`:

- **inference**: QVAC settings, models, idle timeout
- **miners**: Miner priorities, switch interval, individual configs
- **p2p**: Pear settings, Hypercore storage path
- **storage**: Data directory, encryption settings
- **auth**: Authentication method requirements

## Security

- Node IDs generated locally using crypto
- Private keys stored securely
- Hypercore provides cryptographic integrity
- No third-party data sharing

## Deployment

### Web Installation

1. User visits download page
2. Reviews and accepts consent
3. Signs in (email or wallet)
4. Downloads installer
5. Runs installer script
6. Node initializes and starts

### Manual Installation

```bash
npm install
npm run init
npm start
```

## Integration Points

### QVAC Integration

The node integrates with QVAC SDK for:
- Local LLM inference
- Speech-to-text
- Translation
- RAG capabilities

Target apps with QVAC installed can connect directly to the node.

### Miner Integration

Each miner is integrated as a separate module:
- Process management (start/stop)
- Configuration handling
- Status monitoring
- Error handling

### P2P Integration

Pear Runtime provides:
- Zero-configuration P2P
- NAT traversal
- DHT-based discovery
- Secure connections

## Future Enhancements

- GPU resource management
- Advanced scheduling algorithms
- Multi-node coordination
- Reward aggregation
- Performance metrics dashboard
- Mobile app support
