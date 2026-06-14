import { Logger } from '../core/Logger.js';
import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
  constructor(config, nodeManager = null) {
    this.config = config;
    this.nodeManager = nodeManager;
    this.logger = new Logger('WebServer');
    this.server = null;
    this.port = 3000;
  }
  
  async initialize() {
    this.logger.info('Initializing web server...');
    this.logger.info('Web server initialized');
  }
  
  async start() {
    this.logger.info('Starting web server...');
    
    this.server = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });
    
    this.server.listen(this.port, () => {
      this.logger.info(`Web server listening on port ${this.port}`);
    });
  }
  
  async stop() {
    this.logger.info('Stopping web server...');
    
    if (this.server) {
      this.server.close();
    }
    
    this.logger.info('Web server stopped');
  }
  
  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    this.logger.debug(`${req.method} ${url.pathname}`);
    
    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      await this.serveFile(res, 'index.html', 'text/html');
    } else if (url.pathname === '/styles.css') {
      await this.serveFile(res, 'styles.css', 'text/css');
    } else if (url.pathname === '/app.js') {
      await this.serveFile(res, 'app.js', 'application/javascript');
    } else if (url.pathname === '/api/consent' && req.method === 'POST') {
      await this.handleConsent(req, res);
    } else if (url.pathname === '/api/signin' && req.method === 'POST') {
      await this.handleSignIn(req, res);
    } else if (url.pathname === '/api/download' && req.method === 'GET') {
      await this.handleDownload(req, res);
    } else if (url.pathname === '/api/status' && req.method === 'GET') {
      await this.handleStatus(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
  
  async serveFile(res, filename, contentType) {
    try {
      const filePath = path.join(__dirname, 'public', filename);
      const content = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      this.logger.error(`Error serving ${filename}:`, error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
  
  async handleConsent(req, res) {
    try {
      const body = await this.parseBody(req);
      
      // Store consent
      const consentData = {
        accepted: body.accepted,
        timestamp: Date.now(),
        userAgent: req.headers['user-agent']
      };
      
      // Save consent to data store
      const consentPath = path.join(process.cwd(), 'data', 'consent.json');
      await fs.mkdir(path.dirname(consentPath), { recursive: true });
      await fs.writeFile(consentPath, JSON.stringify(consentData, null, 2));
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      this.logger.error('Error handling consent:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  
  async handleSignIn(req, res) {
    try {
      const body = await this.parseBody(req);
      
      // Handle sign-in
      const signInData = {
        method: body.method || 'email',
        email: body.email,
        timestamp: Date.now()
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, signInData }));
    } catch (error) {
      this.logger.error('Error handling sign-in:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  
  async handleDownload(req, res) {
    try {
      // Check if consent was given
      const consentPath = path.join(process.cwd(), 'data', 'consent.json');
      try {
        await fs.access(consentPath);
      } catch (error) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Consent required' }));
        return;
      }
      
      // In real implementation, this would serve the actual installer
      // For now, return a placeholder
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Download link would be provided here',
        downloadUrl: '/install/qvac-pear-miner-node-installer.sh'
      }));
    } catch (error) {
      this.logger.error('Error handling download:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  
  async handleStatus(req, res) {
    try {
      if (!this.nodeManager) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Node manager not available' }));
        return;
      }

      const status = this.nodeManager.getStatus();
      
      // Add CORS headers for frontend
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end(JSON.stringify({ success: true, data: status }));
    } catch (error) {
      this.logger.error('Error handling status:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }
}
