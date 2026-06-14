import { Logger } from '../core/Logger.js';

export class InferenceRouter {
  constructor(qvacInferenceLayer) {
    this.qvacInference = qvacInferenceLayer;
    this.logger = new Logger('InferenceRouter');
    this.activeRoutes = new Map();
    this.isRunning = false;
  }

  async initialize() {
    this.logger.info('Initializing centralized inference router...');
    this.logger.info('All miners will route through single QVAC inference instance');
    this.isRunning = true;
    this.logger.info('Centralized inference router initialized');
  }

  async routeInferenceRequest(task, minerName) {
    if (!this.isRunning) {
      throw new Error('Inference router not running');
    }

    this.logger.info(`Routing inference request from ${minerName}: ${task.id || 'unknown'}`);

    const routeId = `${minerName}-${task.id || Date.now()}`;
    
    try {
      // Route all inference through the centralized QVAC inference layer
      const result = await this.qvacInference.handleInferenceRequest({
        ...task,
        source: minerName,
        routeId
      });

      this.logger.info(`Inference completed for ${minerName}: ${routeId}`);
      
      return {
        success: true,
        routeId,
        miner: minerName,
        result
      };
    } catch (error) {
      this.logger.error(`Inference failed for ${minerName}: ${error.message}`);
      return {
        success: false,
        routeId,
        miner: minerName,
        error: error.message
      };
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Inference router already running');
      return;
    }
    
    this.logger.info('Starting centralized inference router...');
    this.isRunning = true;
    this.logger.info('Centralized inference router started');
  }

  async stop() {
    this.logger.info('Stopping centralized inference router...');
    this.isRunning = false;
    this.activeRoutes.clear();
    this.logger.info('Centralized inference router stopped');
  }

  getStatus() {
    return {
      running: this.isRunning,
      activeRoutes: this.activeRoutes.size,
      qvacInferenceStatus: this.qvacInference?.getStatus() || null
    };
  }
}
