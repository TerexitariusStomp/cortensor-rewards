#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './core/Logger.js';
import { generateNodeId } from './core/utils.js';

const logger = new Logger('Init');

async function initialize() {
  try {
    logger.info('Initializing QVAC-Pear Miner Node...');
    
    // Create data directories
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(dataDir, 'hypercore'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'qvac'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'miners'), { recursive: true });
    
    // Generate node ID if not exists
    const configPath = path.join(process.cwd(), 'config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    if (!config.node.id) {
      config.node.id = generateNodeId();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      logger.info(`Generated node ID: ${config.node.id}`);
    }
    
    logger.info('Initialization complete!');
    logger.info('Run "npm start" to begin the node.');
    
  } catch (error) {
    logger.error('Initialization failed:', error);
    process.exit(1);
  }
}

initialize();
