import { Logger } from '../core/Logger.js';

export class TaskMonitor {
  constructor() {
    this.logger = new Logger('TaskMonitor');
    this.inferenceTasks = new Map();
    this.minerListeners = [];
    this.isRunning = false;
  }
  
  async initialize() {
    this.logger.info('Initializing task monitor...');
    this.logger.info('Task monitor initialized');
  }
  
  async start() {
    this.logger.info('Starting task monitor...');
    this.isRunning = true;
    this.logger.info('Task monitor started');
  }
  
  async stop() {
    this.logger.info('Stopping task monitor...');
    this.isRunning = false;
    this.inferenceTasks.clear();
    this.logger.info('Task monitor stopped');
  }
  
  registerInferenceTask(task) {
    const taskId = task.id || Math.random().toString(36).substring(7);
    
    this.inferenceTasks.set(taskId, {
      ...task,
      id: taskId,
      timestamp: Date.now(),
      status: 'pending'
    });
    
    this.logger.info(`New inference task registered: ${taskId}`);
    this.notifyMiners(taskId, task);
    
    return taskId;
  }
  
  updateTaskStatus(taskId, status) {
    const task = this.inferenceTasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      this.logger.debug(`Task ${taskId} status: ${status}`);
    }
  }
  
  completeTask(taskId) {
    this.updateTaskStatus(taskId, 'completed');
    setTimeout(() => {
      this.inferenceTasks.delete(taskId);
    }, 60000); // Keep completed tasks for 1 minute
  }
  
  notifyMiners(taskId, task) {
    this.logger.info(`Notifying ${this.minerListeners.length} miners about task ${taskId}`);
    
    this.minerListeners.forEach(listener => {
      try {
        listener({
          type: 'inference-task',
          taskId,
          task,
          timestamp: Date.now()
        });
      } catch (error) {
        this.logger.error('Error notifying miner:', error);
      }
    });
  }
  
  registerMinerListener(listener) {
    this.minerListeners.push(listener);
    this.logger.info(`Miner listener registered. Total: ${this.minerListeners.length}`);
  }
  
  getActiveTasks() {
    return Array.from(this.inferenceTasks.values()).filter(
      task => task.status !== 'completed'
    );
  }
  
  getTaskCount() {
    return this.inferenceTasks.size;
  }
  
  hasActiveTasks() {
    return this.getActiveTasks().length > 0;
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      activeTasks: this.getActiveTasks().length,
      totalTasks: this.inferenceTasks.size,
      minerListeners: this.minerListeners.length
    };
  }
}
