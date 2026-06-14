#!/usr/bin/env node

import { NodeManager } from './core/NodeManager.js';
import { Logger } from './core/Logger.js';
import { promises as fs } from 'fs';
import path from 'path';

const logger = new Logger('Main');

// Load config
const configPath = path.join(process.cwd(), 'config.json');
const configContent = await fs.readFile(configPath, 'utf-8');
const config = JSON.parse(configContent);

async function main() {
  try {
    logger.info('Starting QVAC-Pear Miner Node...');
    logger.info(`Version: ${config.node.version}`);
    
    const nodeManager = new NodeManager(config);
    await nodeManager.initialize();
    await nodeManager.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await nodeManager.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await nodeManager.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start node:', error);
    process.exit(1);
  }
}

main();
