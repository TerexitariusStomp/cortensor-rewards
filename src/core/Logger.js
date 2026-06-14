export class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }
  
  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return `${timestamp} ${level} ${prefix} ${message}`;
  }
  
  info(message, ...args) {
    console.log(this.formatMessage('INFO', message), ...args);
  }
  
  error(message, ...args) {
    console.error(this.formatMessage('ERROR', message), ...args);
  }
  
  warn(message, ...args) {
    console.warn(this.formatMessage('WARN', message), ...args);
  }
  
  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message), ...args);
    }
  }
}
