/**
 * TON x402 Server Scheme Implementation
 * 
 * Server-side implementation for handling USDT payment requirements on TON.
 */

import { 
  SchemeNetworkServer, 
  PaymentRequirements, 
  SchemeEnrichPaymentRequiredResponseHook,
  SchemePaymentRequiredContext,
  ResourceInfo,
  SupportedKind,
  AssetAmount,
  Price,
  Network,
  TON_SCHEME, 
  USDT_CONTRACTS, 
  TON_NETWORKS, 
  USDT_DECIMALS, 
  TonNetwork,
  TonPaymentRequirementsExtra,
  TonSchemeConfig 
} from '../types/index.js';

/**
 * TON server scheme configuration
 */
export interface TonServerConfig {
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  /** USDT contract address (optional, defaults based on network) */
  usdtContract?: string;
  /** Minimum TON balance required for gas fees */
  minTonBalance?: string;
  /** RPC endpoint for TON blockchain */
  rpcUrl: string;
  /** API key for TonAPI (optional) */
  apiKey?: string;
}

/**
 * TON server scheme for the "exact-ton" payment scheme
 */
export class ExactTonServer implements SchemeNetworkServer {
  readonly scheme = TON_SCHEME;
  private readonly config: TonServerConfig;

  constructor(config: TonServerConfig) {
    this.config = config;
  }

  /**
   * Enrich payment requirements with TON-specific data
   */
  enrichPaymentRequiredResponse: SchemeEnrichPaymentRequiredResponseHook = async (
    context: SchemePaymentRequiredContext
  ) => {
    const { requirements } = context;
    
    for (const req of requirements) {
      if (req.scheme !== TON_SCHEME) {
        continue;
      }

      const tonNetwork = req.network as TonNetwork;
      const usdtContract = this.config.usdtContract || USDT_CONTRACTS[tonNetwork] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

      // Enrich the requirements with TON-specific extra fields
      const extra: TonPaymentRequirementsExtra = {
        jettonMaster: usdtContract,
        minTonBalance: this.config.minTonBalance || '0.05',
        testnet: tonNetwork === TON_NETWORKS.TESTNET,
        decimals: USDT_DECIMALS,
      };

      // Update the requirements with enriched data (only if fields are vacant)
      if (!req.asset || req.asset.trim() === '') {
        req.asset = usdtContract;
      }

      if (!req.payTo || req.payTo.trim() === '') {
        req.payTo = this.config.merchantWallet;
      }

      if (!req.extra) {
        req.extra = {};
      }

      // Merge extra fields
      req.extra = {
        ...req.extra,
        ...extra,
      };
    }
  };

  /**
   * Get extra data for the supported response
   */
  getExtra(network: Network): Record<string, unknown> | undefined {
    const tonNetwork = network as TonNetwork;
    const usdtContract = this.config.usdtContract || USDT_CONTRACTS[tonNetwork] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

    return {
      jettonMaster: usdtContract,
      minTonBalance: this.config.minTonBalance || '0.05',
      testnet: tonNetwork === TON_NETWORKS.TESTNET,
      decimals: USDT_DECIMALS,
    };
  }

  /**
   * Get merchant wallet addresses for the supported response
   */
  getSigners(network: string): string[] {
    return [this.config.merchantWallet];
  }

  /**
   * Convert a user-friendly price to the scheme's specific amount and asset format
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    const tonNetwork = network as TonNetwork;
    const usdtContract = this.config.usdtContract || USDT_CONTRACTS[tonNetwork] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

    let amountStr: string;
    
    if (typeof price === 'number') {
      amountStr = price.toString();
    } else if (typeof price === 'string') {
      // Handle dollar strings like "$0.10"
      amountStr = price.replace('$', '');
    } else if (typeof price === 'object' && price !== null && 'amount' in price) {
      amountStr = price.amount as string;
    } else {
      throw new Error(`Unsupported price format: ${JSON.stringify(price)}`);
    }

    // Convert to atomic units (USDT has 6 decimals on TON)
    const amount = this.parseAmount(amountStr);

    return {
      amount: amount.toString(),
      asset: usdtContract,
    };
  }

  /**
   * Build payment requirements for this scheme/network combination
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements, 
    supportedKind: SupportedKind, 
    facilitatorExtensions: string[]
  ): Promise<PaymentRequirements> {
    const network = supportedKind.network;
    const tonNetwork = network as TonNetwork;
    const usdtContract = this.config.usdtContract || USDT_CONTRACTS[tonNetwork] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

    // The paymentRequirements already has amount and asset from parsePrice
    // We just need to ensure the extra fields are set
    const enhanced: PaymentRequirements = {
      ...paymentRequirements,
      scheme: TON_SCHEME,
      network,
      asset: paymentRequirements.asset || usdtContract,
      payTo: paymentRequirements.payTo || this.config.merchantWallet,
      maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds || 300,
      extra: {
        ...paymentRequirements.extra,
        jettonMaster: usdtContract,
        minTonBalance: this.config.minTonBalance || '0.05',
        testnet: tonNetwork === TON_NETWORKS.TESTNET,
        decimals: USDT_DECIMALS,
      },
    };

    return enhanced;
  }

  /**
   * Parse amount string to bigint
   */
  private parseAmount(amountStr: string): bigint {
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = (fraction + '0'.repeat(USDT_DECIMALS)).slice(0, USDT_DECIMALS);
    return BigInt(whole) * BigInt(10 ** USDT_DECIMALS) + BigInt(paddedFraction);
  }

  /**
   * Build payment requirements for a route (static helper)
   */
  static buildRequirements(
    config: TonServerConfig,
    network: TonNetwork,
    amount: string,
    description: string
  ): PaymentRequirements {
    const usdtContract = config.usdtContract || USDT_CONTRACTS[network] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

    return {
      scheme: TON_SCHEME,
      network,
      amount,
      asset: usdtContract,
      payTo: config.merchantWallet,
      maxTimeoutSeconds: 300,
      extra: {
        jettonMaster: usdtContract,
        minTonBalance: config.minTonBalance || '0.05',
        testnet: network === TON_NETWORKS.TESTNET,
        decimals: USDT_DECIMALS,
      },
    };
  }
}

/**
 * Configuration for registering TON server schemes
 */
export interface TonServerSchemeConfig {
  /** Merchant wallet address */
  merchantWallet: string;
  /** USDT contract address (optional) */
  usdtContract?: string;
  /** Minimum TON balance for gas */
  minTonBalance?: string;
  /** RPC endpoint */
  rpcUrl: string;
  /** API key (optional) */
  apiKey?: string;
  /** Networks to register */
  networks?: TonNetwork[];
}

/**
 * Register TON exact payment schemes to an x402ResourceServer instance
 */
export function registerExactTonScheme(
  server: any,
  config: TonServerSchemeConfig
): any {
  const scheme = new ExactTonServer({
    merchantWallet: config.merchantWallet,
    usdtContract: config.usdtContract,
    minTonBalance: config.minTonBalance,
    rpcUrl: config.rpcUrl,
    apiKey: config.apiKey,
  });

  const networks = config.networks || [TON_NETWORKS.MAINNET, TON_NETWORKS.TESTNET];

  for (const network of networks) {
    server.register(network, scheme);
  }

  return server;
}