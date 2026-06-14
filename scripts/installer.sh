#!/bin/bash

set -e

echo "=========================================="
echo "QVAC-Pear Miner Node Installer"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js 18 or higher from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required."
    echo "Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed."
    exit 1
fi

echo "✓ npm $(npm -v) detected"
echo ""

# Create installation directory
INSTALL_DIR="$HOME/qvac-pear-miner-node"
echo "Installing to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory already exists. Updating..."
else
    mkdir -p "$INSTALL_DIR"
fi

# Copy files
echo "Copying files..."
cp -r . "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# Install dependencies
echo "Installing dependencies..."
npm install

# Initialize node
echo "Initializing node..."
npm run init

echo ""
echo "=========================================="
echo "✓ Installation complete!"
echo "=========================================="
echo ""
echo "To start the node:"
echo "  cd $INSTALL_DIR"
echo "  npm start"
echo ""
echo "To run the web installer:"
echo "  cd $INSTALL_DIR"
echo "  npm run install-web"
echo ""
echo "Configuration file: $INSTALL_DIR/config.json"
echo "Data directory: $INSTALL_DIR/data"
echo ""
