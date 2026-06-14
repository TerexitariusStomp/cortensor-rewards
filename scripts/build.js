#!/usr/bin/env node

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function build() {
  try {
    logger.info('Building QVAC-Pear Miner Node...');
    
    // Create dist directory
    await fs.mkdir('dist', { recursive: true });
    
    // Copy source files
    await fs.cp('src', 'dist/src', { recursive: true });
    await fs.cp('config.json', 'dist/config.json');
    await fs.cp('package.json', 'dist/package.json');
    
    // Copy web assets
    await fs.cp('src/web/public', 'dist/web', { recursive: true });
    
    // Create installer script
    const installerScript = `#!/bin/bash
set -e

echo "Installing QVAC-Pear Miner Node..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed."
    echo "Please install Node.js 18 or higher from https://nodejs.org/"
    exit 1
fi

# Install dependencies
cd dist
npm install

# Initialize node
npm run init

echo "Installation complete!"
echo "Run 'npm start' to begin the node."
`;
    
    await fs.writeFile('dist/install.sh', installerScript);
    await runCommand('chmod +x dist/install.sh');
    
    logger.info('Build complete!');
    logger.info('Output: dist/');
    logger.info('Installer: dist/install.sh');
    
  } catch (error) {
    logger.error('Build failed:', error);
    process.exit(1);
  }
}

build();
