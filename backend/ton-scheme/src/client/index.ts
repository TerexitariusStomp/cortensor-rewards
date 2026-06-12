/**
 * TON x402 Client Scheme Implementation
 * 
 * Client-side implementation for creating USDT payment payloads on TON.
 */

import { 
  SchemeNetworkClient, 
  PaymentRequirements, 
  PaymentPayloadContext, 
  PaymentPayloadResult,
  TonSchemeConfig, 
  TonClientSigner, 
  TonPaymentPayload, 
  TonTransferMessage, 
  TON_SCHEME, 
  USDT_CONTRACTS, 
  TON_NETWORKS, 
  USDT_DECIMALS, 
  TonNetwork 
} from '../types/index.js';

/**
 * TON client scheme for the "exact-ton" payment scheme
 */
export class ExactTonScheme implements SchemeNetworkClient {
  readonly scheme = TON_SCHEME;
  private readonly signer: TonClientSigner;
  private readonly config: TonSchemeConfig;

  constructor(signer: TonClientSigner, config: TonSchemeConfig) {
    this.signer = signer;
    this.config = config;
  }

  /**
   * Creates a payment payload for the TON USDT payment scheme
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext
  ): Promise<PaymentPayloadResult> {
    if (x402Version !== 2) {
      throw new Error(`TON scheme only supports x402 version 2, got ${x402Version}`);
    }

    if (paymentRequirements.scheme !== TON_SCHEME) {
      throw new Error(`Invalid scheme: expected ${TON_SCHEME}, got ${paymentRequirements.scheme}`);
    }

    const payerAddress = await this.signer.getAddress();
    const network = paymentRequirements.network as TonNetwork;
    const usdtContract = this.getUsdtContract(network);
    // Amount in payment requirements is already in atomic units (set by server's parsePrice)
    const amount = paymentRequirements.amount;

    // Get the Jetton wallet address for the payer
    const jettonWallet = await this.getJettonWalletAddress(payerAddress, usdtContract);

    // Create the Jetton transfer message
    const transferMessage: TonTransferMessage = {
      destination: paymentRequirements.payTo,
      amount: amount.toString(),
      jettonWallet,
      forwardPayload: this.createForwardPayload(paymentRequirements),
      queryId: Date.now(),
    };

    // Create the payment payload
    const paymentPayload: TonPaymentPayload = {
      x402Version: 2,
      resource: {
        url: '',
        description: 'Payment for service',
        mimeType: 'application/json',
      },
      accepted: paymentRequirements,
      payload: {
        transfer: transferMessage,
        payer: payerAddress,
        memo: `Payment for ${(paymentRequirements.extra?.description as string) || 'service'}`,
      },
      extensions: context?.extensions,
    };

    return {
      x402Version: 2,
      payload: paymentPayload as unknown as Record<string, unknown>,
      extensions: context?.extensions,
    };
  }

  /**
   * Get the USDT contract address for the network
   */
  private getUsdtContract(network: TonNetwork): string {
    return this.config.usdtContract || USDT_CONTRACTS[network] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];
  }

  /**
   * Parse amount string to atomic units
   */
  private parseAmount(amountStr: string, decimals: number): bigint {
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction);
  }

  /**
   * Get Jetton wallet address for an owner
   * This is a simplified version - in production, you'd query the blockchain
   */
  private async getJettonWalletAddress(ownerAddress: string, jettonMaster: string): Promise<string> {
    // In a real implementation, this would query the Jetton minter contract
    // or use a standard derivation. For now, we'll return a placeholder.
    // The actual wallet should be obtained via TonAPI or on-chain query.
    return `jetton_wallet_${ownerAddress}_${jettonMaster}`;
  }

  /**
   * Create forward payload for the Jetton transfer
   */
  private createForwardPayload(requirements: PaymentRequirements): string {
    // Encode payment metadata in the forward payload
    const payload = {
      paymentId: (requirements.extra?.paymentId as string) || `pay_${Date.now()}`,
      description: (requirements.extra?.description as string) || 'Payment for service',
      maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
}

/**
 * Configuration for registering TON client schemes
 */
export interface TonClientConfig {
  /** The TON signer to use for creating payment payloads */
  signer: TonClientSigner;
  /** Optional payment requirements selector function */
  paymentRequirementsSelector?: (requirements: PaymentRequirements[]) => PaymentRequirements;
  /** Optional policies to apply to the client */
  policies?: any[];
  /** TON scheme configuration */
  schemeConfig: TonSchemeConfig;
  /** Optional specific networks to register */
  networks?: TonNetwork[];
}

/**
 * Register TON exact payment schemes to an x402Client instance
 */
export function registerExactTonScheme(
  client: any,
  config: TonClientConfig
): any {
  const scheme = new ExactTonScheme(config.signer, config.schemeConfig);
  
  const networks = config.networks || [TON_NETWORKS.MAINNET, TON_NETWORKS.TESTNET];
  
  for (const network of networks) {
    client.register(network, scheme);
  }

  return client;
}