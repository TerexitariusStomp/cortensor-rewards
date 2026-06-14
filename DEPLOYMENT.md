# Deployment Guide

## Development Setup

```bash
# Clone repository
git clone <repository-url>
cd qvac-pear-miner-node

# Install dependencies
npm install

# Initialize node
npm run init

# Start in development mode
npm run dev
```

## Production Deployment

### Method 1: Web Installer

1. Host the web installer on a server
2. Users visit the download page
3. Complete consent flow and sign-in
4. Download and run installer

### Method 2: Direct Installation

```bash
# Download the installer
wget https://example.com/installer.sh

# Make executable
chmod +x installer.sh

# Run installer
./installer.sh

# Start the node
cd ~/qvac-pear-miner-node
npm start
```

### Method 3: Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run init

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t qvac-pear-miner-node .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data qvac-pear-miner-node
```

## Configuration

Edit `config.json` before starting:

```json
{
  "inference": {
    "idleTimeout": 300000,
    "qvac": {
      "models": ["llama-2-7b", "llama-2-13b"],
      "maxConcurrent": 4
    }
  },
  "miners": {
    "priority": ["cortensor", "chutes", "fortytwo", "earnidle"],
    "switchInterval": 60000
  }
}
```

## System Requirements

### Minimum
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB SSD
- Network: Stable internet connection
- OS: Linux, macOS, Windows

### Recommended for Mining
- CPU: 8+ cores
- RAM: 16GB+
- GPU: NVIDIA GPU with 8GB+ VRAM
- Storage: 100GB+ NVMe SSD
- Network: High-speed connection

## Monitoring

### Check Node Status

The node logs status information:

```
INFO [NodeManager] Node started successfully
INFO [NodeManager] Node ID: abc123...
INFO [MinerManager] Now running: cortensor
```

### View Logs

```bash
# View all logs
journalctl -u qvac-pear-miner-node -f

# Or if running manually
tail -f data/node.log
```

### API Endpoints (Future)

- `GET /status` - Node status
- `GET /metrics` - Performance metrics
- `POST /control` - Control commands

## Security Considerations

1. **Firewall**: Configure firewall to allow P2P connections
2. **Private Keys**: Never share private keys
3. **Updates**: Keep dependencies updated
4. **Monitoring**: Monitor for unusual activity

## Troubleshooting

### Node won't start

```bash
# Check Node.js version
node -v  # Should be 18+

# Reinstall dependencies
rm -rf node_modules
npm install

# Check logs
cat data/node.log
```

### Miners not starting

- Check miner configurations in config.json
- Ensure system requirements are met
- Verify network connectivity
- Check individual miner logs

### P2P connection issues

- Check firewall settings
- Verify internet connectivity
- Ensure Pear runtime is properly configured

## Updates

```bash
# Stop the node
npm stop  # or Ctrl+C

# Pull updates
git pull origin main

# Reinstall dependencies
npm install

# Restart
npm start
```

## Backup

```bash
# Backup configuration and data
tar -czf backup-$(date +%Y%m%d).tar.gz config.json data/

# Restore
tar -xzf backup-YYYYMMDD.tar.gz
```

## Uninstallation

```bash
# Stop the node
npm stop

# Remove installation directory
rm -rf ~/qvac-pear-miner-node

# Remove systemd service (if configured)
sudo systemctl disable qvac-pear-miner-node
sudo rm /etc/systemd/system/qvac-pear-miner-node.service
```
