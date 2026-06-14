import { Logger } from '../core/Logger.js';

export class FortytwoMiner {
  constructor(config, inferenceRouter = null) {
    this.config = config;
    this.inferenceRouter = inferenceRouter;
    this.name = 'fortytwo';
    this.logger = new Logger('FortytwoMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'evm';
  }
  
  async initialize() {
    this.logger.info('Initializing Fortytwo-Network miner...');
    
    // Validate wallet address if provided
    if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid EVM wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Fortytwo wallet configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No wallet address configured - rewards cannot be received');
    }
    
    // Fortytwo-Network integration would go here
    // This would involve setting up the fortytwo console app
    
    this.logger.info('Fortytwo-Network miner initialized');
  }
  
  validateWalletAddress(address) {
    // EVM address validation (0x + 40 hex characters)
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  
  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Fortytwo-Network miner already running');
      return;
    }
    
    this.logger.info('Starting Fortytwo-Network miner...');
    
    // Start fortytwo node
    // In real implementation, this would run the console app
    
    this.isRunning = true;
    this.logger.info('Fortytwo-Network miner started');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) {
      this.logger.warn('Fortytwo-Network miner already in monitoring mode');
      return;
    }
    
    this.logger.info('Starting Fortytwo-Network miner in monitoring mode...');
    
    // Start fortytwo node in monitoring mode
    
    this.isRunning = true;
    this.monitoringMode = true;
    this.logger.info('Fortytwo-Network miner monitoring mode started');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping Fortytwo-Network miner...');
    
    // Stop fortytwo node
    
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Fortytwo-Network miner stopped');
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
