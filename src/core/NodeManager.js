import { Logger } from './Logger.js';
import { QVACInferenceLayer } from '../inference/QVACInferenceLayer.js';
import { InferenceRouter } from '../inference/InferenceRouter.js';
import { HypercoreStore } from '../storage/HypercoreStore.js';
import { PearP2P } from '../p2p/PearP2P.js';
import { MinerManager } from '../miners/MinerManager.js';
import { AuthService } from '../auth/AuthService.js';
import { TimeScheduler } from '../scheduler/TimeScheduler.js';
import { TaskMonitor } from '../scheduler/TaskMonitor.js';
import { WebServer } from '../web/server.js';
import { WalletManager } from './WalletManager.js';

export class NodeManager {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('NodeManager');
    this.inferenceLayer = null;
    this.inferenceRouter = null;
    this.dataStore = null;
    this.p2pNetwork = null;
    this.minerManager = null;
    this.authService = null;
    this.timeScheduler = null;
    this.taskMonitor = null;
    this.webServer = null;
    this.walletManager = null;
    this.isRunning = false;
  }
  
  async initialize() {
    this.logger.info('Initializing node components...');
    
    // Initialize authentication
    this.authService = new AuthService(this.config.auth);
    await this.authService.initialize();
    
    // Initialize data store (Hypercore)
    this.dataStore = new HypercoreStore(this.config.p2p.hypercore);
    await this.dataStore.initialize();
    
    // Initialize P2P network (Pear)
    this.p2pNetwork = new PearP2P(this.config.p2p.pear);
    await this.p2pNetwork.initialize();
    
    // Initialize wallet manager
    this.walletManager = new WalletManager(this.config.miners);
    await this.walletManager.initialize();
    
    // Initialize time scheduler
    this.timeScheduler = new TimeScheduler(this.config.scheduler || {});
    await this.timeScheduler.initialize();
    
    // Initialize task monitor
    this.taskMonitor = new TaskMonitor();
    await this.taskMonitor.initialize();
    
    // Initialize inference layer (QVAC)
    this.inferenceLayer = new QVACInferenceLayer(this.config.inference, this.taskMonitor);
    await this.inferenceLayer.initialize();
    
    // Initialize centralized inference router
    this.inferenceRouter = new InferenceRouter(this.inferenceLayer);
    await this.inferenceRouter.initialize();
    
    // Initialize miner manager with task monitor and inference router
    this.minerManager = new MinerManager(this.config.miners, this.dataStore, this.taskMonitor, this.inferenceRouter);
    await this.minerManager.initialize();
    
    // Set up mode change handler
    this.timeScheduler.onModeChange((newMode) => {
      this.handleModeChange(newMode);
    });
    
    // Initialize web server for dashboard API
    this.webServer = new WebServer(this.config.web || {}, this);
    await this.webServer.initialize();
    
    this.logger.info('All components initialized successfully');
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Node is already running');
      return;
    }
    
    this.logger.info('Starting node...');
    
    // Start data store
    await this.dataStore.start();
    
    // Start P2P network
    await this.p2pNetwork.start();
    
    // Connect wallet manager
    await this.walletManager.connectAllWallets();
    
    // Start task monitor
    await this.taskMonitor.start();
    
    // Start inference layer
    await this.inferenceLayer.start();
    
    // Start centralized inference router
    await this.inferenceRouter.start();
    
    // Start miner manager
    await this.minerManager.start();
    
    // Start web server for dashboard API
    await this.webServer.start();
    
    this.isRunning = true;
    this.logger.info('Node started successfully');
    this.logger.info(`Node ID: ${this.config.node.id}`);
    this.logger.info(`Current mode: ${this.timeScheduler.getCurrentMode()}`);
    this.logger.info(`Dashboard API available at http://localhost:3000/api/status`);
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping node...');
    
    // Stop components in reverse order
    await this.webServer.stop();
    await this.minerManager.stop();
    await this.inferenceRouter.stop();
    await this.inferenceLayer.stop();
    await this.taskMonitor.stop();
    await this.walletManager.disconnectAllWallets();
    await this.p2pNetwork.stop();
    await this.dataStore.stop();
    
    this.isRunning = false;
    this.logger.info('Node stopped successfully');
  }
  
  handleModeChange(newMode) {
    this.logger.info(`Mode changed to: ${newMode}`);
    
    if (newMode === 'night') {
      // Night mode: Stellar app active, miners in monitoring mode
      this.logger.info('Night mode: Stellar app active, miners monitoring');
    } else {
      // Day mode: Inference earning active
      this.logger.info('Day mode: Inference earning active');
    }
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      nodeId: this.config.node.id,
      mode: this.timeScheduler?.getStatus(),
      inference: this.inferenceLayer?.getStatus(),
      inferenceRouter: this.inferenceRouter?.getStatus(),
      mining: this.minerManager?.getStatus(),
      tasks: this.taskMonitor?.getStatus(),
      p2p: this.p2pNetwork?.getStatus(),
      wallets: this.walletManager?.getStatus()
    };
  }
}
