import { CortensorMiner } from './src/miners/CortensorMiner.js';
import { ChutesMiner } from './src/miners/ChutesMiner.js';
import { FortytwoMiner } from './src/miners/FortytwoMiner.js';
import { EarnidleMiner } from './src/miners/EarnidleMiner.js';
import { RoutstrMiner } from './src/miners/RoutstrMiner.js';
import { Logger } from './src/core/Logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));

const logger = new Logger('MinerTest');

async function testMiners() {
  logger.info('Starting miner integration test...');
  
  const miners = {
    cortensor: new CortensorMiner(config.miners.cortensor.config),
    chutes: new ChutesMiner(config.miners.chutes.config),
    fortytwo: new FortytwoMiner(config.miners.fortytwo.config),
    earnidle: new EarnidleMiner(config.miners.earnidle.config),
    routstr: new RoutstrMiner(config.miners.routstr.config)
  };
  
  const testResults = {};
  
  for (const [name, miner] of Object.entries(miners)) {
    logger.info(`Testing ${name}...`);
    
    try {
      // Initialize miner
      await miner.initialize();
      logger.info(`${name} initialized`);
      
      // Start in monitoring mode
      await miner.startMonitoring();
      logger.info(`${name} started in monitoring mode`);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get status
      const status = miner.getStatus();
      logger.info(`${name} status: ${JSON.stringify(status)}`);
      
      // Simulate inference task
      const testTask = {
        id: `test-${name}-${Date.now()}`,
        type: 'inference',
        model: 'llama-2-7b',
        prompt: 'Test task for miner integration',
        timestamp: Date.now()
      };
      
      miner.onInferenceTask(testTask);
      logger.info(`${name} received inference task`);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Stop miner
      await miner.stop();
      logger.info(`${name} stopped`);
      
      testResults[name] = { 
        success: true, 
        status: status,
        taskProcessed: true 
      };
      
      logger.info(`${name} test passed`);
      
    } catch (error) {
      testResults[name] = { success: false, error: error.message };
      logger.error(`${name} test failed: ${error.message}`);
    }
  }
  
  // Print results
  logger.info('=== Test Results ===');
  for (const [miner, result] of Object.entries(testResults)) {
    logger.info(`${miner}: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
    if (!result.success) {
      logger.info(`  Error: ${result.error}`);
    } else {
      logger.info(`  Status: ${JSON.stringify(result.status)}`);
    }
  }
  
  // Overall summary
  const passed = Object.values(testResults).filter(r => r.success).length;
  const total = Object.keys(testResults).length;
  
  logger.info(`=== Summary: ${passed}/${total} miners passed ===`);
  
  logger.info('Miner test completed');
  
  return testResults;
}

// Run the test
testMiners()
  .then(results => {
    console.log('\n=== Final Results ===');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
