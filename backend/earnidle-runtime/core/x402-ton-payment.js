// x402-ton-payment.js — x402 Payment Integration for USDT on TON
// This module provides client-side payment handling for the x402 protocol
// using USDT on the TON blockchain (Jetton standard).

/**
 * USDT on TON configuration
 */
export const USDT_TON_CONFIG = {
  MAINNET: {
    network: 'ton:mainnet',
    contractAddress: 'EQBynBO23nhYCkMZLCwV-G1DMZaXz1tM9w1cZOCt2fFnKacC',
    decimals: 6,
  },
  TESTNET: {
    network: 'ton:testnet',
    contractAddress: 'kQBynBO23nhYCkMZLCwV-G1DMZaXz1tM9w1cZOCt2fFnKacC',
    decimals: 6,
  },
};

/**
 * Payment configuration from environment or defaults
 */
export const DEFAULT_PAYMENT_CONFIG = {
  network: 'ton:testnet',
  merchantWallet: '',
  rpcUrl: 'https://testnet.tonapi.io',
  apiKey: undefined,
  usdtContract: USDT_TON_CONFIG.TESTNET.contractAddress,
  minTonBalance: '0.05',
};

/**
 * Parse payment configuration from environment variables
 */
export function parsePaymentConfig() {
  return {
    network: process.env.TON_NETWORK || DEFAULT_PAYMENT_CONFIG.network,
    merchantWallet: process.env.MERCHANT_WALLET || DEFAULT_PAYMENT_CONFIG.merchantWallet,
    rpcUrl: process.env.TON_RPC_URL || DEFAULT_PAYMENT_CONFIG.rpcUrl,
    apiKey: process.env.TON_API_KEY || DEFAULT_PAYMENT_CONFIG.apiKey,
    usdtContract: process.env.USDT_CONTRACT || DEFAULT_PAYMENT_CONFIG.usdtContract,
    minTonBalance: process.env.MIN_TON_BALANCE || DEFAULT_PAYMENT_CONFIG.minTonBalance,
  };
}

/**
 * TonConnect-based signer for client-side payments
 * This integrates with TonConnect to sign transactions via user's wallet
 */
export class TonConnectSigner {
  #walletAddress = null;
  #tonConnect = null;

  constructor(tonConnectInstance) {
    this.#tonConnect = tonConnectInstance;
  }

  /**
   * Connect to wallet if not already connected
   */
  async connect() {
    if (this.#walletAddress) {
      return this.#walletAddress;
    }
    
    if (!this.#tonConnect) {
      throw new Error('TonConnect instance not provided');
    }

    // Wait for connection
    if (!this.#tonConnect.connected) {
      await this.#tonConnect.connect();
    }

    this.#walletAddress = this.#tonConnect.wallet?.account?.address || 
                          this.#tonConnect.account?.address;
    
    if (!this.#walletAddress) {
      throw new Error('Failed to get wallet address from TonConnect');
    }

    return this.#walletAddress;
  }

  async getAddress() {
    return this.connect();
  }

  async signMessage(message) {
    if (!this.#tonConnect) {
      throw new Error('TonConnect not initialized');
    }
    // TonConnect signMessage returns a base64 string
    const signature = await this.#tonConnect.signMessage(Buffer.from(message).toString('base64'));
    return Uint8Array.from(Buffer.from(signature, 'base64'));
  }

  async signTransaction(tx) {
    if (!this.#tonConnect) {
      throw new Error('TonConnect not initialized');
    }
    // TonConnect sendTransaction returns a boc (base64)
    const boc = await this.#tonConnect.sendTransaction(tx);
    return Uint8Array.from(Buffer.from(boc, 'base64'));
  }

  async sendTransaction(signedTx) {
    if (!this.#tonConnect) {
      throw new Error('TonConnect not initialized');
    }
    // The signedTx is already a boc, send it
    const boc = Buffer.from(signedTx).toString('base64');
    return await this.#tonConnect.sendTransaction({ boc });
  }
}

/**
 * x402 Payment flow handler
 * Manages the complete payment flow: 402 response -> payment -> verification
 */
export class X402PaymentFlow {
  #config;
  #signer;
  #client = null;

  constructor(config, signer) {
    this.#config = config;
    this.#signer = signer;
  }

  /**
   * Initialize the x402 client
   */
  async initialize() {
    // Dynamic import to avoid loading x402 until needed
    const { x402Client } = await import('@x402/core/client');
    const { registerExactTonScheme } = await import('../../ton-scheme/dist/client.js');

    this.#client = new x402Client();
    
    registerExactTonScheme(this.#client, {
      signer: this.#signer,
      schemeConfig: {
        rpcUrl: this.#config.rpcUrl,
        apiKey: this.#config.apiKey,
        merchantWallet: this.#config.merchantWallet,
        usdtContract: this.#config.usdtContract,
        minTonBalance: this.#config.minTonBalance,
      },
      networks: [this.#config.network],
    });
  }

  /**
   * Make a request that may require payment
   */
  async fetchWithPayment(url, options = {}) {
    if (!this.#client) {
      await this.initialize();
    }

    const { x402HTTPClient } = await import('@x402/core/http');
    const httpClient = new x402HTTPClient(this.#client);

    let response = await fetch(url, options);

    // Handle 402 Payment Required
    if (response.status === 402) {
      const paymentRequired = httpClient.getPaymentRequiredResponse(
        (name) => response.headers.get(name),
        await response.json()
      );

      // Create payment payload
      const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

      // Retry with payment header
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
      
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...paymentHeaders,
        },
      });

      // Process payment result
      const result = await httpClient.processPaymentResult(paymentPayload, 
        (name) => response.headers.get(name), 
        response.status
      );

      if (!result.recovered && result.settleResponse?.success === false) {
        throw new Error(`Payment settlement failed: ${result.settleResponse.errorMessage}`);
      }
    }

    return response;
  }

  /**
   * Check if a URL requires payment (without making the actual request)
   */
  async checkPaymentRequired(url) {
    if (!this.#client) {
      await this.initialize();
    }

    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status === 402) {
        const { x402HTTPClient } = await import('@x402/core/http');
        const httpClient = new x402HTTPClient(this.#client);
        const paymentRequired = httpClient.getPaymentRequiredResponse(
          (name) => response.headers.get(name),
          await response.json()
        );
        
        const firstOption = paymentRequired.accepts[0];
        return {
          required: true,
          amount: firstOption?.amount,
          asset: firstOption?.asset,
        };
      }
    } catch {
      // Ignore errors
    }
    return { required: false };
  }
}

/**
 * Create a complete payment integration for EarnIdle
 */
export async function createEarnIdlePaymentIntegration(config = {}, tonConnectInstance = null) {
  const paymentConfig = { ...DEFAULT_PAYMENT_CONFIG, ...config, ...parsePaymentConfig() };
  
  if (!paymentConfig.merchantWallet) {
    throw new Error('MERCHANT_WALLET must be set in environment or config');
  }

  const signer = tonConnectInstance 
    ? new TonConnectSigner(tonConnectInstance)
    : new TonConnectSigner(null); // Will need to be set later

  const paymentFlow = new X402PaymentFlow(paymentConfig, signer);
  
  return { paymentFlow, signer };
}