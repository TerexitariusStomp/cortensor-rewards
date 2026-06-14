#!/usr/bin/env node

import { WebServer } from '../src/web/server.js';
import { Logger } from '../src/core/Logger.js';
import { promises as fs } from 'fs';
import path from 'path';

const logger = new Logger('InstallWeb');

// Load config
const configPath = path.join(process.cwd(), 'config.json');
const configContent = await fs.readFile(configPath, 'utf-8');
const config = JSON.parse(configContent);

async function main() {
  try {
    logger.info('Starting web installer...');
    
    const webServer = new WebServer(config);
    await webServer.initialize();
    await webServer.start();
    
    logger.info('Web installer running on http://localhost:3000');
    logger.info('Press Ctrl+C to stop');
    
  } catch (error) {
    logger.error('Failed to start web installer:', error);
    process.exit(1);
  }
}

main();
