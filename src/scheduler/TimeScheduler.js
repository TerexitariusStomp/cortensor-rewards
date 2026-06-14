import { Logger } from '../core/Logger.js';

export class TimeScheduler {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('TimeScheduler');
    this.currentMode = null;
    this.listeners = [];
  }
  
  async initialize() {
    this.logger.info('Initializing time-based scheduler...');
    
    // Determine initial mode
    this.currentMode = this.getCurrentMode();
    this.logger.info(`Initial mode: ${this.currentMode}`);
    
    // Start mode monitoring
    this.startModeMonitoring();
    
    this.logger.info('Time-based scheduler initialized');
  }
  
  getCurrentMode() {
    const now = new Date();
    const hour = now.getHours();
    
    // Night mode: 8 PM to 6 AM (20:00 - 06:00)
    // Day mode: 6 AM to 8 PM (06:00 - 20:00)
    if (hour >= 20 || hour < 6) {
      return 'night';
    }
    return 'day';
  }
  
  startModeMonitoring() {
    // Check every minute for mode changes
    setInterval(() => {
      const newMode = this.getCurrentMode();
      
      if (newMode !== this.currentMode) {
        this.logger.info(`Mode changed: ${this.currentMode} -> ${newMode}`);
        this.currentMode = newMode;
        this.notifyModeChange(newMode);
      }
    }, 60000); // Check every minute
  }
  
  onModeChange(callback) {
    this.listeners.push(callback);
  }
  
  notifyModeChange(newMode) {
    this.listeners.forEach(callback => {
      try {
        callback(newMode);
      } catch (error) {
        this.logger.error('Error in mode change callback:', error);
      }
    });
  }
  
  isNightMode() {
    return this.currentMode === 'night';
  }
  
  isDayMode() {
    return this.currentMode === 'day';
  }
  
  getStatus() {
    return {
      currentMode: this.currentMode,
      isNight: this.isNightMode(),
      isDay: this.isDayMode()
    };
  }
}
