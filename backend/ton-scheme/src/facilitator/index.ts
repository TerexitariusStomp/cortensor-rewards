/**
 * TON x402 Facilitator Scheme Implementation
 * 
 * Facilitator-side implementation for verifying and settling USDT payments on TON.
 */

import { 
  SchemeNetworkFacilitator, 
  PaymentPayload, 
  PaymentRequirements, 
  FacilitatorContext, 
  VerifyResponse, 
  SettleResponse,
  Network,
  TonFacilitatorSigner,
  TON_SCHEME, 
  USDT_CONTRACTS, 
  TON_NETWORKS, 
  USDT_DECIMALS, 
  TonNetwork,
  TonSchemeConfig,
  TonVerifyResponse
} from '../types/index.js';

/** TON Jetton transfer event from TonAPI */
interface TonJettonTransferEvent {
  type: 'jetton_transfer';
  tx_hash: string;
  timestamp: number;
  in_progress: boolean;
  jetton_transfer: {
    sender: string;
    recipient: string;
    amount: string;
    jetton: {
      address: string;
      symbol: string;
      decimals: number;
    };
  };
}

/** TonAPI account events response */
interface TonApiEventsResponse {
  events: TonJettonTransferEvent[];
}

/** Transaction details from TonAPI */
interface TonTransaction {
  hash: string;
  status: string;
  confirmations: number;
  in_progress: boolean;
  in_msg: {
    source: string;
    destination: string;
    value: string;
    msg_type: string;
  };
  out_msgs: Array<{
    source: string;
    destination: string;
    value: string;
    msg_type: string;
  }>;
}

/** 
 * TON facilitator scheme configuration 
 */
export interface TonFacilitatorConfig {
  /** Allowlist of allowed Jetton master contracts (optional) */
  allowedJettonMasters?: string[];
  /** Minimum confirmation blocks for settlement */
  minConfirmations?: number;
  /** RPC endpoint for TON blockchain (TonAPI base URL) */
  rpcUrl: string;
  /** API key for TonAPI (optional) */
  apiKey?: string;
}

/** 
 * TON facilitator scheme for the "exact-ton" payment scheme 
 */
export class ExactTonFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = TON_SCHEME;
  readonly caipFamily = 'ton:*';
  private readonly signer: TonFacilitatorSigner;
  private readonly config: TonFacilitatorConfig;

  constructor(signer: TonFacilitatorSigner, config: TonFacilitatorConfig) {
    this.signer = signer;
    this.config = config;
  }

  /** 
   * Returns TON-specific extra data for the supported response 
   */
  getExtra(network: Network): Record<string, unknown> | undefined {
    const tonNetwork = network as TonNetwork;
    const usdtContract = USDT_CONTRACTS[tonNetwork] || USDT_CONTRACTS[TON_NETWORKS.MAINNET];

    return {
      jettonMaster: usdtContract,
      decimals: USDT_DECIMALS,
      testnet: tonNetwork === TON_NETWORKS.TESTNET,
    };
  }

  /** 
   * Returns facilitator wallet addresses for the supported response 
   */
  getSigners(network: string): string[] {
    // In a real implementation, this would return the facilitator's wallet addresses
    // For now, we return a placeholder
    return ['facilitator_wallet_address'];
  }

  /** 
   * Verifies a payment payload for TON USDT payments 
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext
  ): Promise<TonVerifyResponse> {
    try {
      // Validate scheme
      if (payload.x402Version !== 2) {
        return this.createErrorResponse('TON scheme only supports x402 version 2');
      }

      if (requirements.scheme !== TON_SCHEME) {
        return this.createErrorResponse(`Invalid scheme: expected ${TON_SCHEME}`);
      }

      // Verify the Jetton transfer
      const tonPayload = payload as unknown as { payload: { transfer: any; payer: string } };
      const transfer = tonPayload.payload?.transfer;
      const payer = tonPayload.payload?.payer;

      if (!transfer || !payer) {
        return this.createErrorResponse('Invalid TON payment payload: missing transfer or payer');
      }

      // Check if the transfer matches requirements
      const amountMatch = this.verifyAmount(transfer.amount, requirements.amount);
      if (!amountMatch) {
        return this.createErrorResponse('Amount mismatch');
      }

      // Verify destination matches payTo
      if (transfer.destination !== requirements.payTo) {
        return this.createErrorResponse('Destination mismatch');
      }

      // Verify Jetton master matches
      const expectedJettonMaster = requirements.asset;
      if (this.config.allowedJettonMasters && 
          !this.config.allowedJettonMasters.includes(expectedJettonMaster)) {
        return this.createErrorResponse('Jetton master not allowed');
      }

      // Verify on-chain
      const verificationResult = await this.verifyOnChain(transfer, requirements, payer);

      if (!verificationResult.isValid) {
        return this.createErrorResponse(verificationResult.reason || 'On-chain verification failed');
      }

      return {
        isValid: true,
        payer,
        transaction: verificationResult.transactionHash,
        extensions: undefined,
        extra: {
          jettonTransfer: {
            from: verificationResult.jettonTransfer?.from || payer,
            to: verificationResult.jettonTransfer?.to || transfer.destination,
            amount: verificationResult.jettonTransfer?.amount || transfer.amount,
            jettonMaster: expectedJettonMaster,
          },
        },
      };
    } catch (error) {
      return this.createErrorResponse(`Verification error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 
   * Settles a payment for TON USDT payments 
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext
  ): Promise<SettleResponse> {
    try {
      // First verify
      const verifyResult = await this.verify(payload, requirements, context);
      
      if (!verifyResult.isValid) {
        return {
          success: false,
          transaction: '',
          network: requirements.network,
          amount: requirements.amount,
          payer: undefined,
          errorReason: 'verification_failed',
          errorMessage: verifyResult.invalidMessage,
        };
      }

      // For TON, settlement means the transaction is already on-chain
      // The facilitator confirms it and returns the transaction hash
      const tonPayload = payload as unknown as { payload: { transfer: any; payer: string } };
      const transfer = tonPayload.payload?.transfer;
      const payer = tonPayload.payload?.payer;

      // Confirm on-chain with required confirmations
      const confirmationResult = await this.confirmOnChain(transfer, requirements, payer);

      if (!confirmationResult.isConfirmed) {
        return {
          success: false,
          transaction: '',
          network: requirements.network,
          amount: requirements.amount,
          payer,
          errorReason: 'settlement_failed',
          errorMessage: confirmationResult.reason || 'Transaction not confirmed on-chain',
        };
      }

      return {
        success: true,
        transaction: confirmationResult.transactionHash || `ton_tx_${transfer.queryId || Date.now()}`,
        network: requirements.network,
        amount: requirements.amount,
        payer,
        errorReason: undefined,
        errorMessage: undefined,
        extensions: undefined,
        extra: {
          jettonTransfer: {
            from: payer,
            to: transfer.destination,
            amount: transfer.amount,
            jettonMaster: requirements.asset,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        transaction: '',
        network: requirements.network,
        amount: requirements.amount,
        payer: undefined,
        errorReason: 'settlement_error',
        errorMessage: `Settlement error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** 
   * Verify amount matches (accounting for decimals) 
   */
  private verifyAmount(transferAmount: string, requiredAmount: string): boolean {
    try {
      const transferBigInt = BigInt(transferAmount);
      const requiredBigInt = this.parseAmount(requiredAmount);
      return transferBigInt >= requiredBigInt;
    } catch {
      return false;
    }
  }

  /** 
   * Parse amount string to bigint with USDT decimals 
   */
  private parseAmount(amountStr: string): bigint {
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = (fraction + '0'.repeat(USDT_DECIMALS)).slice(0, USDT_DECIMALS);
    return BigInt(whole) * BigInt(10 ** USDT_DECIMALS) + BigInt(paddedFraction);
  }

  /** 
   * Verify transaction on-chain using TonAPI 
   */
  private async verifyOnChain(
    transfer: any,
    requirements: PaymentRequirements,
    payer: string
  ): Promise<{ 
    isValid: boolean; 
    reason?: string; 
    transactionHash?: string; 
    jettonTransfer?: { from: string; to: string; amount: string; jettonMaster: string } 
  }> {
    try {
      const jettonMaster = requirements.asset;
      const expectedAmount = transfer.amount;
      const expectedDestination = transfer.destination;

      // Query TonAPI for account events (Jetton transfers)
      const eventsUrl = `${this.config.rpcUrl}/v2/accounts/${payer}/events`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(eventsUrl, { headers });
      
      if (!response.ok) {
        return { 
          isValid: false, 
          reason: `TonAPI error: ${response.status} ${response.statusText}` 
        };
      }

      const data = await response.json() as TonApiEventsResponse;

      // Find matching Jetton transfer event
      for (const event of data.events) {
        if (event.type !== 'jetton_transfer') continue;
        if (event.in_progress) continue;

        const jt = event.jetton_transfer;
        
        // Check if this is the transfer we're looking for
        // Note: The sender in the event is the jetton wallet, not the owner
        // We need to verify the jetton master matches
        if (jt.jetton.address !== jettonMaster) continue;
        
        // Check amount (allow slight tolerance for gas)
        const eventAmount = BigInt(jt.amount);
        const expectedAmountBigInt = BigInt(expectedAmount);
        if (eventAmount < expectedAmountBigInt) continue;

        // The recipient should match our destination
        if (jt.recipient.toLowerCase() !== expectedDestination.toLowerCase()) continue;

        // Found matching transfer!
        return {
          isValid: true,
          transactionHash: event.tx_hash,
          jettonTransfer: {
            from: jt.sender,
            to: jt.recipient,
            amount: jt.amount,
            jettonMaster: jt.jetton.address,
          },
        };
      }

      // If not found in events, try looking up by transaction hash if provided
      if (transfer.queryId) {
        // Could also try to find by query_id if TonAPI supports it
      }

      return { isValid: false, reason: 'No matching Jetton transfer found on-chain' };
    } catch (error) {
      return { 
        isValid: false, 
        reason: `On-chain verification failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /** 
   * Confirm transaction is settled on-chain with required confirmations 
   */
  private async confirmOnChain(
    transfer: any,
    requirements: PaymentRequirements,
    payer: string
  ): Promise<{ 
    isConfirmed: boolean; 
    reason?: string; 
    transactionHash?: string 
  }> {
    try {
      // First verify the transfer exists
      const verification = await this.verifyOnChain(transfer, requirements, payer);
      
      if (!verification.isValid || !verification.transactionHash) {
        return { isConfirmed: false, reason: verification.reason || 'Transfer not found' };
      }

      // Check transaction confirmations
      const minConfirmations = this.config.minConfirmations || 1;
      
      const txUrl = `${this.config.rpcUrl}/v2/blockchain/transactions/${verification.transactionHash}`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(txUrl, { headers });
      
      if (!response.ok) {
        return { 
          isConfirmed: false, 
          reason: `TonAPI transaction lookup failed: ${response.status} ${response.statusText}` 
        };
      }

      const txData = await response.json() as TonTransaction;

      // Check if transaction has enough confirmations
      if (txData.confirmations >= minConfirmations && !txData.in_progress) {
        return { isConfirmed: true, transactionHash: verification.transactionHash };
      }

      return { 
        isConfirmed: false, 
        reason: `Transaction has ${txData.confirmations} confirmations, need ${minConfirmations}` 
      };
    } catch (error) {
      return { 
        isConfirmed: false, 
        reason: `Confirmation check failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /** 
   * Create error response 
   */
  private createErrorResponse(message: string): VerifyResponse {
    return {
      isValid: false,
      invalidReason: 'verification_failed',
      invalidMessage: message,
      payer: undefined,
      extensions: undefined,
      extra: undefined,
    };
  }
}

/** 
 * Configuration for registering TON facilitator schemes 
 */
export interface TonFacilitatorSchemeConfig {
  /** Facilitator signer */
  signer: TonFacilitatorSigner;
  /** Networks to register */
  networks: Network | Network[];
  /** Allowed Jetton masters (optional) */
  allowedJettonMasters?: string[];
  /** Minimum confirmations */
  minConfirmations?: number;
  /** RPC endpoint */
  rpcUrl: string;
  /** API key (optional) */
  apiKey?: string;
}

/** 
 * Register TON exact payment schemes to an x402Facilitator instance 
 */
export function registerExactTonFacilitatorScheme(
  facilitator: any,
  config: TonFacilitatorSchemeConfig
): any {
  const scheme = new ExactTonFacilitator(config.signer, {
    allowedJettonMasters: config.allowedJettonMasters,
    minConfirmations: config.minConfirmations,
    rpcUrl: config.rpcUrl,
    apiKey: config.apiKey,
  });

  const networks = Array.isArray(config.networks) ? config.networks : [config.networks];
  
  for (const network of networks) {
    facilitator.register(network, scheme);
    facilitator.registerV1?.(network, scheme); // Also register for v1 compatibility if available
  }

  return facilitator;
}