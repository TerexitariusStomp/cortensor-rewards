import { Logger } from '../core/Logger.js';
import Hypercore from 'hypercore';
import { promises as fs } from 'fs';
import path from 'path';

export class HypercoreStore {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('HypercoreStore');
    this.core = null;
    this.isRunning = false;
  }
  
  async initialize() {
    this.logger.info('Initializing Hypercore data store...');
    
    // Ensure storage directory exists
    await fs.mkdir(this.config.storage, { recursive: true });
    
    // Initialize Hypercore
    const storagePath = path.join(this.config.storage, 'node-data');
    this.core = new Hypercore(storagePath);
    
    await this.core.ready();
    
    this.logger.info(`Hypercore initialized with key: ${this.core.key.toString('hex').substring(0, 16)}...`);
    this.logger.info('Hypercore data store initialized');
  }
  
  async start() {
    this.logger.info('Starting Hypercore data store...');
    
    if (this.config.replicate) {
      // Replication would be set up here with P2P network
      this.logger.info('Replication enabled');
    }
    
    this.isRunning = true;
    this.logger.info('Hypercore data store started');
  }
  
  async stop() {
    this.logger.info('Stopping Hypercore data store...');
    
    if (this.core) {
      await this.core.close();
    }
    
    this.isRunning = false;
    this.logger.info('Hypercore data store stopped');
  }
  
  async append(data) {
    if (!this.isRunning) {
      throw new Error('Data store not running');
    }
    
    const seq = await this.core.append(JSON.stringify(data));
    this.logger.debug(`Appended data at sequence ${seq}`);
    return seq;
  }
  
  async get(seq) {
    if (!this.isRunning) {
      throw new Error('Data store not running');
    }
    
    const data = await this.core.get(seq);
    return JSON.parse(data.toString());
  }
  
  async getLength() {
    if (!this.core) return 0;
    return this.core.length;
  }
  
  async query(filter) {
    const results = [];
    const length = await this.getLength();
    
    for (let i = 0; i < length; i++) {
      const data = await this.get(i);
      if (this.matchesFilter(data, filter)) {
        results.push(data);
      }
    }
    
    return results;
  }
  
  matchesFilter(data, filter) {
    for (const key in filter) {
      if (data[key] !== filter[key]) {
        return false;
      }
    }
    return true;
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      length: this.core?.length || 0,
      key: this.core?.key.toString('hex').substring(0, 16) + '...',
      writable: this.core?.writable || false
    };
  }
}
