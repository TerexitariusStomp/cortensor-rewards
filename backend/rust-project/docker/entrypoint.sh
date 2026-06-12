#!/bin/bash
# QVAC Provider Daemon - Docker Entrypoint

set -e

CONFIG_FILE="/home/qvac/config/qvac.config.json"
SEED_FILE="/home/qvac/config/seed.txt"

# Function to generate random seed if not provided
generate_seed() {
    if [ ! -f "$SEED_FILE" ]; then
        echo "Generating new Hyperswarm seed..."
        openssl rand -hex 32 > "$SEED_FILE"
        chmod 600 "$SEED_FILE"
    fi
    cat "$SEED_FILE"
}

# Function to validate config
validate_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "ERROR: Config file not found at $CONFIG_FILE"
        echo "Run: qvac-provider gen-config -o $CONFIG_FILE"
        exit 1
    fi
    
    # Check required fields
    local authority=$(jq -r '.provider.authority' "$CONFIG_FILE")
    if [ "$authority" = "0x" ] || [ "$authority" = "null" ] || [ -z "$authority" ]; then
        echo "ERROR: provider.authority must be set in config"
        echo "Edit $CONFIG_FILE and set your on-chain address"
        exit 1
    fi
    
    local rpc_url=$(jq -r '.provider.rpcUrl' "$CONFIG_FILE")
    if [ "$rpc_url" = "null" ] || [ -z "$rpc_url" ] || [[ "$rpc_url" == *"YOUR_API_KEY"* ]]; then
        echo "ERROR: provider.rpcUrl must be set in config"
        echo "Edit $CONFIG_FILE and set your RPC endpoint"
        exit 1
    fi
    
    # Set seed env var
    export QVAC_HYPERSWARM_SEED=$(generate_seed)
    echo "Using Hyperswarm seed from $SEED_FILE"
}

# Function to set up KVM for Firecracker
setup_kvm() {
    if [ -c /dev/kvm ]; then
        # Ensure kvm group exists and qvac is in it
        if getent group kvm > /dev/null; then
            usermod -a -G kvm qvac 2>/dev/null || true
        fi
        echo "KVM device available"
    else
        echo "WARNING: /dev/kvm not available - Firecracker will not work"
        echo "Run container with --device=/dev/kvm"
    fi
}

# Function to set up hugepages
setup_hugepages() {
    if [ -d /sys/kernel/mm/hugepages ]; then
        echo 1024 > /proc/sys/vm/nr_hugepages 2>/dev/null || true
        echo "Hugepages configured"
    fi
}

# Main
case "${1:-start}" in
    start)
        echo "=== QVAC Provider Daemon Starting ==="
        validate_config
        setup_kvm
        setup_hugepages
        
        echo "Configuration: $CONFIG_FILE"
        echo "Seed: ${QVAC_HYPERSWARM_SEED:0:8}..."
        echo ""
        
        exec qvac-provider start \
            --config "$CONFIG_FILE" \
            --foreground \
            "${@:2}"
        ;;
    
    gen-config)
        echo "Generating default configuration..."
        exec qvac-provider gen-config -o "$CONFIG_FILE" "${@:2}"
        ;;
    
    probe)
        validate_config
        exec qvac-provider probe --config "$CONFIG_FILE" "${@:2}"
        ;;
    
    test-workload)
        validate_config
        exec qvac-provider test-workload --config "$CONFIG_FILE" "${@:2}"
        ;;
    
    status)
        validate_config
        exec qvac-provider status --config "$CONFIG_FILE" "${@:2}"
        ;;
    
    register)
        validate_config
        exec qvac-provider register --config "$CONFIG_FILE" "${@:2}"
        ;;
    
    *)
        echo "Unknown command: $1"
        echo "Usage: $0 {start|gen-config|probe|test-workload|status|register} [args...]"
        exit 1
        ;;
esac