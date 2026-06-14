import { Logger } from '../core/Logger.js';

export class ChutesMiner {
  constructor(config, inferenceRouter = null) {
    this.config = config;
    this.inferenceRouter = inferenceRouter;
    this.name = 'chutes';
    this.logger = new Logger('ChutesMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'bittensor';
    this.requiresK8s = true; // Chutes requires Kubernetes for GPU validation
    this.stackCompatible = false; // Not compatible with QVAC/Hypercore/Pear stack
  }
  
  async initialize() {
    this.logger.info('Initializing Chutes miner...');
    
    // Validate wallet address if provided
    if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid Bittensor wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Chutes wallet configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No wallet address configured - rewards cannot be received');
    }
    
    // Chutes miner requires Kubernetes for GPU validation
    // This is not compatible with the QVAC/Hypercore/Pear decentralized stack
    this.logger.warn('Chutes miner requires Kubernetes (k8s) for GPU validation');
    this.logger.warn('Chutes is not compatible with QVAC/Hypercore/Pear stack');
    this.logger.warn('Chutes miner will run in compatibility mode - limited functionality');
    
    this.logger.info('Chutes miner initialized (compatibility mode)');
  }
  
  validateWalletAddress(address) {
    // Bittensor addresses are typically SS58 format (starts with specific prefix)
    return /^[a-zA-Z0-9]{47,}$/.test(address);
  }
  
  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Chutes miner already running');
      return;
    }
    
    this.logger.info('Starting Chutes miner in compatibility mode...');
    
    // Chutes requires Kubernetes for GPU validation
    // In QVAC/Hypercore/Pear stack, we run in compatibility mode
    // All inference should be routed through QVAC inference node
    
    this.isRunning = true;
    this.logger.info('Chutes miner started (compatibility mode - no k8s GPU validation)');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) {
      this.logger.warn('Chutes miner already in monitoring mode');
      return;
    }
    
    this.logger.info('Starting Chutes miner in monitoring mode...');
    
    // In compatibility mode, Chutes monitors for tasks but relies on QVAC for inference
    // All inference requests are routed through the QVAC inference node
    
    this.isRunning = true;
    this.monitoringMode = true;
    this.logger.info('Chutes miner monitoring mode started (compatibility mode)');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping Chutes miner...');
    
    // Stop chutes-miner process
    
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Chutes miner stopped');
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
      network: this.network,
      requiresK8s: this.requiresK8s,
      stackCompatible: this.stackCompatible,
      mode: 'compatibility' // Running in compatibility mode without k8s
    };
  }
}
