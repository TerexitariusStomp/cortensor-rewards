// x402-ton-server.js — Server-side x402 Payment Handler for USDT on TON
// This module provides server-side payment verification and settlement
// for the x402 protocol using USDT on the TON blockchain.

import { x402ResourceServer } from '@x402/core/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { registerExactTonScheme as registerServerScheme } from '../../ton-scheme/dist/server.js';
import { registerExactTonFacilitatorScheme } from '../../ton-scheme/dist/facilitator.js';

/**
 * TonAPI-based facilitator signer
 * Uses TonAPI to verify and settle transactions on TON
 */
export class TonApiFacilitatorSigner {
  #apiKey;
  #rpcUrl;
  #merchantWallet;

  constructor(config) {
    this.#apiKey = config.apiKey;
    this.#rpcUrl = config.rpcUrl;
    this.#merchantWallet = config.merchantWallet;
  }

  async getAddress() {
    return this.#merchantWallet;
  }

  async signTransaction(tx) {
    // Facilitator doesn't sign transactions for TON - it verifies on-chain
    throw new Error('Facilitator does not sign transactions');
  }

  async sendTransaction(signedTx) {
    // Facilitator doesn't send transactions for TON
    throw new Error('Facilitator does not send transactions');
  }

  async getBalance(address) {
    const response = await fetch(`${this.#rpcUrl}/v2/accounts/${address}`, {
      headers: this.#apiKey ? { 'Authorization': `Bearer ${this.#apiKey}` } : {}
    });
    if (!response.ok) throw new Error(`Failed to get balance: ${response.statusText}`);
    const data = await response.json();
    return data.balance || '0';
  }

  async getJettonWalletAddress(ownerAddress, jettonMaster) {
    // Query TonAPI for jetton wallet address
    const response = await fetch(`${this.#rpcUrl}/v2/accounts/${ownerAddress}/jettons/${jettonMaster}`, {
      headers: this.#apiKey ? { 'Authorization': `Bearer ${this.#apiKey}` } : {}
    });
    if (!response.ok) {
      // If not found, return a derived address (placeholder)
      return `${ownerAddress}_${jettonMaster}`;
    }
    const data = await response.json();
    return data.wallet_address || `${ownerAddress}_${jettonMaster}`;
  }

  async getJettonBalance(jettonWalletAddress) {
    const response = await fetch(`${this.#rpcUrl}/v2/accounts/${jettonWalletAddress}/jettons`, {
      headers: this.#apiKey ? { 'Authorization': `Bearer ${this.#apiKey}` } : {}
    });
    if (!response.ok) throw new Error(`Failed to get jetton balance: ${response.statusText}`);
    const data = await response.json();
    return data.balance || '0';
  }
}

/**
 * Create and configure the x402 resource server for TON payments
 * 
 * @param {Object} config - Server configuration
 * @param {string} config.merchantWallet - Merchant wallet address to receive payments
 * @param {string} config.rpcUrl - TON RPC endpoint (TonAPI)
 * @param {string} [config.apiKey] - TonAPI API key
 * @param {string} [config.usdtContract] - USDT Jetton contract address
 * @param {string} [config.minTonBalance='0.05'] - Minimum TON balance for gas
 * @param {string} [config.facilitatorUrl] - Optional external facilitator URL
 * @param {string[]} [config.networks=['ton:mainnet','ton:testnet']] - Networks to support
 * @returns {Promise<{resourceServer, facilitatorClient}>}
 */
export async function createTonPaymentServer(config) {
  const {
    merchantWallet,
    rpcUrl,
    apiKey,
    usdtContract,
    minTonBalance = '0.05',
    facilitatorUrl,
    networks = ['ton:mainnet', 'ton:testnet'],
  } = config;

  if (!merchantWallet) {
    throw new Error('merchantWallet is required');
  }

  // Create facilitator client
  let facilitatorClient;
  if (facilitatorUrl) {
    facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  } else {
    // Create local facilitator with TonAPI signer
    const { x402Facilitator } = await import('@x402/core/facilitator');
    const signer = new TonApiFacilitatorSigner({ rpcUrl, apiKey, merchantWallet });
    
    facilitatorClient = new x402Facilitator();
    facilitatorClient = registerExactTonFacilitatorScheme(facilitatorClient, {
      signer,
      networks,
      allowedJettonMasters: usdtContract ? [usdtContract] : undefined,
      minConfirmations: 1,
      rpcUrl,
      apiKey,
    });
  }

  // Create resource server
  const resourceServer = new x402ResourceServer(facilitatorClient);
  
  // Register TON schemes
  const schemeConfig = {
    merchantWallet,
    usdtContract,
    minTonBalance,
    rpcUrl,
    apiKey,
    networks,
  };
  
  registerServerScheme(resourceServer, schemeConfig);

  // Initialize (fetches supported kinds from facilitator)
  await resourceServer.initialize();

  return { resourceServer, facilitatorClient };
}

/**
 * Create HTTP middleware for Express/Connect-compatible frameworks
 * 
 * @param {Object} config - Server configuration (same as createTonPaymentServer)
 * @returns {Function} Express/Connect middleware function
 */
export async function createTonPaymentMiddleware(config) {
  const { resourceServer } = await createTonPaymentServer(config);
  const { x402HTTPResourceServer } = await import('@x402/core/http');
  
  // Define routes that require payment
  const routes = {
    'POST /api/inference/job': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.01', // $0.01 per job
      },
      description: 'Inference job processing',
      mimeType: 'application/json',
    },
    'POST /api/vm/execute': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.05', // $0.05 per VM execution
      },
      description: 'VM execution',
      mimeType: 'application/json',
    },
    'POST /api/qvac/skill': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.02', // $0.02 per skill execution
      },
      description: 'QVAC skill execution',
      mimeType: 'application/json',
    },
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  await httpServer.initialize();

  // Return middleware function
  return async (req, res, next) => {
    // Convert Express/Connect request to HTTPAdapter
    const adapter = {
      getHeader: (name) => req.headers[name.toLowerCase()],
      getMethod: () => req.method,
      getPath: () => req.path || req.url,
      getUrl: () => req.protocol + '://' + req.get('host') + req.originalUrl,
      getAcceptHeader: () => req.headers.accept || '*/*',
      getUserAgent: () => req.headers['user-agent'] || '',
      getQueryParams: () => req.query || {},
      getQueryParam: (name) => req.query?.[name],
      getBody: () => req.body,
    };

    const context = { adapter };
    
    try {
      const result = await httpServer.processHTTPRequest(context);
      
      if (result.type === 'no-payment-required') {
        // No payment needed, continue to route handler
        return next();
      }
      
      if (result.type === 'payment-verified') {
        // Payment verified, attach payment info and continue
        req.x402 = {
          paymentPayload: result.paymentPayload,
          paymentRequirements: result.paymentRequirements,
          cancellationDispatcher: result.cancellationDispatcher,
        };
        return next();
      }
      
      if (result.type === 'payment-error') {
        // Payment required or error, send 402 response
        res.status(result.response.status);
        Object.entries(result.response.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        if (result.response.body !== undefined) {
          res.json(result.response.body);
        } else {
          res.end();
        }
        return;
      }
    } catch (error) {
      console.error('x402 middleware error:', error);
      return next(error);
    }
  };
}

/**
 * Settlement middleware - call after route handler to settle payment
 * 
 * @param {Object} config - Server configuration (same as createTonPaymentServer)
 * @returns {Function} Express/Connect middleware function
 */
export async function createTonSettlementMiddleware(config) {
  const { resourceServer } = await createTonPaymentServer(config);
  const { x402HTTPResourceServer } = await import('@x402/core/http');
  
  const routes = {
    'POST /api/inference/job': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.01',
      },
    },
    'POST /api/vm/execute': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.05',
      },
    },
    'POST /api/qvac/skill': {
      accepts: {
        scheme: 'exact-ton',
        network: 'ton:testnet',
        payTo: config.merchantWallet,
        price: '$0.02',
      },
    },
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  await httpServer.initialize();

  return async (req, res, next) => {
    // Only settle if payment was verified
    if (!req.x402?.paymentPayload || !req.x402?.paymentRequirements) {
      return next();
    }

    try {
      const adapter = {
        getHeader: (name) => req.headers[name.toLowerCase()],
        getMethod: () => req.method,
        getPath: () => req.path || req.url,
        getUrl: () => req.protocol + '://' + req.get('host') + req.originalUrl,
        getAcceptHeader: () => req.headers.accept || '*/*',
        getUserAgent: () => req.headers['user-agent'] || '',
        getQueryParams: () => req.query || {},
        getQueryParam: (name) => req.query?.[name],
        getBody: () => req.body,
      };

      const transportContext = {
        request: adapter,
      };

      const settleResult = await httpServer.processSettlement(
        req.x402.paymentPayload,
        req.x402.paymentRequirements,
        {}, // declared extensions
        transportContext
      );

      // Add settlement headers to response
      Object.entries(settleResult.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      if (!settleResult.success) {
        res.status(402);
        if (settleResult.errorMessage) {
          res.json({ error: settleResult.errorMessage });
        }
        return;
      }

      next();
    } catch (error) {
      console.error('Settlement error:', error);
      next(error);
    }
  };
}