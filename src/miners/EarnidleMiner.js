import { Logger } from '../core/Logger.js';

export class EarnidleMiner {
  constructor(config, inferenceRouter = null) {
    this.config = config;
    this.inferenceRouter = inferenceRouter;
    this.name = 'earnidle';
    this.logger = new Logger('EarnidleMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'solana';
  }
  
  async initialize() {
    this.logger.info('Initializing Earnidle miner...');
    
    // Validate wallet address if provided
    if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid Solana wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Earnidle wallet configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No wallet address configured - rewards cannot be received');
    }
    
    // Earnidle integration would go here
    // This would involve connecting to the IDLE Protocol
    
    this.logger.info('Earnidle miner initialized');
  }
  
  validateWalletAddress(address) {
    // Solana addresses are base58 encoded, typically 32-44 characters
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  
  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Earnidle miner already running');
      return;
    }
    
    this.logger.info('Starting Earnidle miner...');
    
    // Start earnidle agent
    // In real implementation, this would connect to earnidle.com API
    
    this.isRunning = true;
    this.logger.info('Earnidle miner started');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) {
      this.logger.warn('Earnidle miner already in monitoring mode');
      return;
    }
    
    this.logger.info('Starting Earnidle miner in monitoring mode...');
    
    // Start earnidle agent in monitoring mode
    
    this.isRunning = true;
    this.monitoringMode = true;
    this.logger.info('Earnidle miner monitoring mode started');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping Earnidle miner...');
    
    // Stop earnidle agent
    
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Earnidle miner stopped');
  }
  
  async onInferenceTask(task) {
    this.logger.info(`Inference task detected: ${task.id || 'unknown'}`);
    
    if (this.inferenceRouter) {
      this.logger.info('Routing task through centralized inference router');
      const result = await this.inferenceRouter.routeInferenceRequest(task, this.name);
      this.logger.info(`Inference result: ${result.success ? 'success' : 'failed'}`);
      return result;
    } else {
      this.logger.warn('No inference router available - task not processed');
      return { success: false, error: 'No inference router available' };
    }
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      monitoringMode: this.monitoringMode,
      name: this.name,
      walletConfigured: !!this.walletAddress,
      network: this.network
    };
  }
}
