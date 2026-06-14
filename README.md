# QVAC-Pear Miner Node

A distributed node that combines QVAC inference with multiple mining capabilities, distributed via Pear P2P.

## Quick Start with Docker

The easiest way to run the QVAC-Pear Miner Node is using Docker:

```bash
# Build the Docker image
docker build -t qvac-pear-miner:latest .

# Run the container
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data qvac-pear-miner:latest

# Or use Docker Compose
docker-compose up -d
```

The node will be available at `http://localhost:3000`

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Architecture

This node integrates:
- **QVAC** - Base inference layer for AI applications
- **Pear** - Peer-to-peer app distribution
- **Hypercore** - Distributed data store
- **Multi-Miner Support** - Cortensor, Chutes, Fortytwo-Network, Earnidle, Routstr
- **Centralized Inference** - All miners route through single QVAC inference node

## Features

- **Dual Mode Operation**: Serves AI inference when active, switches to mining when idle
- **P2P Distribution**: Apps distributed via Pear runtime without cloud infrastructure
- **Zero-Auth Installation**: Simple sign-in with consent flow, no complex authentication
- **Distributed Storage**: Hypercore for secure, distributed data storage
- **Multi-Miner Support**: Automatically switches between 5 different mining protocols
- **Centralized Inference**: All miners route through single QVAC inference node
- **Container Ready**: Full Docker support for easy deployment

## Installation

### Docker Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/qvac-pear-miner-node.git
cd qvac-pear-miner-node

# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t qvac-pear-miner:latest .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data qvac-pear-miner:latest
```

### Manual Installation

```bash
# Install dependencies
npm install

# Initialize the node
npm run init

# Start the node
npm start
```

## Usage

The node automatically:
1. Connects to the P2P network via Pear
2. Initializes QVAC inference layer
3. Sets up Hypercore data store
4. Monitors for inference requests
5. Switches to mining when idle

## Configuration

Edit `config.json` to customize:
- Miner priorities
- Inference settings
- P2P network settings
- Data storage paths

## Miner Integration

### Cortensor
Decentralized AI network miner for proof-of-useful-work tasks.

### Chutes
GPU mining system with automatic GPU validation.

### Fortytwo-Network
Decentralized AI inference node for planetary-scale intelligence.

### Earnidle
Protocol for putting idle compute resources to work across multiple venues.

## Development

```bash
# Install development dependencies
npm install --save-dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT
