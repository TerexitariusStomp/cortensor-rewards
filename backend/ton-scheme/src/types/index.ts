/**
 * TON x402 Scheme Types
 * 
 * Implements the x402 protocol for USDT payments on TON blockchain
 * using the Jetton standard (TEP-74).
 * 
 * Core x402 types are defined locally to avoid module resolution issues.
 */

/**
 * Base x402 types (simplified from @x402/core)
 */
export type Network = `${string}:${string}`;
export type Money = string | number;
export type Price = Money | { asset: string; amount: string; extra?: Record<string, unknown> };

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface PaymentPayloadContext {
  extensions?: Record<string, unknown>;
}

export interface PaymentPayloadResult {
  x402Version: number;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: Network;
  amount?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
}

export interface AssetAmount {
  asset: string;
  amount: string;
  extra?: Record<string, unknown>;
}

export interface FacilitatorContext {
  getExtension<T extends { key: string } = { key: string }>(key: string): T | undefined;
}

export interface SchemeNetworkClient {
  readonly scheme: string;
  readonly schemeHooks?: any;
  createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements, context?: any): Promise<{ x402Version: number; payload: Record<string, unknown>; extensions?: Record<string, unknown> }>;
}

export interface SchemeNetworkServer {
  readonly scheme: string;
  readonly schemeHooks?: any;
  enrichPaymentRequiredResponse?: SchemeEnrichPaymentRequiredResponseHook;
  enrichSettlementPayload?: SchemeEnrichSettlementPayloadHook;
  enrichSettlementResponse?: SchemeEnrichSettlementResponseHook;
  parsePrice(price: Price, network: Network): Promise<AssetAmount>;
  enhancePaymentRequirements(paymentRequirements: PaymentRequirements, supportedKind: SupportedKind, facilitatorExtensions: string[]): Promise<PaymentRequirements>;
}

export type SchemeEnrichPaymentRequiredResponseHook = (ctx: SchemePaymentRequiredContext) => Promise<PaymentRequirements[] | void>;
export type SchemeEnrichSettlementPayloadHook = (ctx: any) => Promise<Record<string, unknown> | void>;
export type SchemeEnrichSettlementResponseHook = (ctx: any) => Promise<Record<string, unknown> | void>;

export interface SchemeNetworkFacilitator {
  readonly scheme: string;
  readonly caipFamily: string;
  getExtra(network: Network): Record<string, unknown> | undefined;
  getSigners(network: string): string[];
  verify(payload: PaymentPayload, requirements: PaymentRequirements, context?: FacilitatorContext): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements, context?: FacilitatorContext): Promise<SettleResponse>;
}

export interface SchemePaymentRequiredContext {
  requirements: PaymentRequirements[];
  paymentPayload?: PaymentPayload;
  resourceInfo: ResourceInfo;
  error?: string;
  paymentRequiredResponse: PaymentRequired;
  transportContext?: unknown;
}

/**
 * TON Network identifiers (CAIP-2 format)
 */
export const TON_NETWORKS = {
  MAINNET: 'ton:mainnet',
  TESTNET: 'ton:testnet',
} as const;

export type TonNetwork = typeof TON_NETWORKS[keyof typeof TON_NETWORKS];

/**
 * USDT Jetton contract addresses
 */
export const USDT_CONTRACTS = {
  [TON_NETWORKS.MAINNET]: 'EQBynBO23nhYCkMZLCwV-G1DMZaXz1tM9w1cZOCt2fFnKacC',
  [TON_NETWORKS.TESTNET]: 'kQBynBO23nhYCkMZLCwV-G1DMZaXz1tM9w1cZOCt2fFnKacC',
} as const;

/**
 * USDT decimals on TON (Jetton standard uses 9 decimals, but USDT uses 6)
 */
export const USDT_DECIMALS = 6;

/**
 * TON scheme identifier
 */
export const TON_SCHEME = 'exact-ton';

/**
 * TON payment payload structure
 */
export interface TonPaymentPayload extends PaymentPayload {
  x402Version: 2;
  payload: {
    /** The signed Jetton transfer message */
    transfer: TonTransferMessage;
    /** The payer's TON wallet address */
    payer: string;
    /** Optional memo for the transfer */
    memo?: string;
  };
}

/**
 * TON Jetton transfer message structure
 */
export interface TonTransferMessage {
  /** Destination address (merchant wallet) */
  destination: string;
  /** Amount in atomic units (USDT has 6 decimals) */
  amount: string;
  /** Jetton wallet address of the sender */
  jettonWallet: string;
  /** Forward payload for the transfer */
  forwardPayload?: string;
  /** Query ID for replay protection */
  queryId?: number;
}

/**
 * TON payment requirements extra fields
 */
export interface TonPaymentRequirementsExtra {
  /** USDT Jetton master contract address */
  jettonMaster: string;
  /** Jetton wallet code hash for verification */
  jettonWalletCodeHash?: string;
  /** Minimum TON balance required for gas */
  minTonBalance?: string;
  /** Whether to use testnet */
  testnet?: boolean;
  /** Asset decimals */
  decimals?: number;
  /** Allow any additional properties */
  [key: string]: unknown;
}

/**
 * Extended payment requirements for TON
 */
export interface TonPaymentRequirements extends Omit<PaymentRequirements, 'extra'> {
  scheme: typeof TON_SCHEME;
  network: TonNetwork;
  asset: string; // Should be the USDT contract address
  extra?: TonPaymentRequirementsExtra;
}

/**
 * TON scheme configuration
 */
export interface TonSchemeConfig {
  /** RPC endpoint for TON blockchain */
  rpcUrl: string;
  /** API key for TonAPI (optional) */
  apiKey?: string;
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  /** USDT contract address (defaults to mainnet/testnet based on network) */
  usdtContract?: string;
  /** Minimum TON balance for gas fees */
  minTonBalance?: string;
}

/**
 * TON client signer interface
 */
export interface TonClientSigner {
  /** Get the wallet address */
  getAddress(): Promise<string>;
  /** Sign a message */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Sign a transaction */
  signTransaction(tx: any): Promise<Uint8Array>;
  /** Send a signed transaction */
  sendTransaction(signedTx: Uint8Array): Promise<string>;
}

/**
 * TON facilitator signer interface
 */
export interface TonFacilitatorSigner {
  /** Get the facilitator wallet address */
  getAddress(): Promise<string>;
  /** Sign a transaction for verification/settlement */
  signTransaction(tx: any): Promise<Uint8Array>;
  /** Send a signed transaction */
  sendTransaction(signedTx: Uint8Array): Promise<string>;
  /** Get wallet balance */
  getBalance(address: string): Promise<string>;
  /** Get Jetton wallet address for an owner */
  getJettonWalletAddress(ownerAddress: string, jettonMaster: string): Promise<string>;
  /** Get Jetton balance */
  getJettonBalance(jettonWalletAddress: string): Promise<string>;
}

/**
 * Verification result for TON payments
 */
export interface TonVerifyResponse extends VerifyResponse {
  /** TON transaction hash if verified */
  transaction?: string;
  /** Jetton transfer details */
  jettonTransfer?: {
    from: string;
    to: string;
    amount: string;
    jettonMaster: string;
  };
}

/**
 * Settlement result for TON payments
 */
export interface TonSettleResponse extends SettleResponse {
  /** TON transaction hash */
  transaction: string;
  /** Jetton transfer details */
  jettonTransfer?: {
    from: string;
    to: string;
    amount: string;
    jettonMaster: string;
  };
}