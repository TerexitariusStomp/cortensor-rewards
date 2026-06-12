/**
 * @x402/ton - TON Blockchain Implementation for x402 Payment Protocol
 * 
 * Provides support for USDT payments on TON using the Jetton standard (TEP-74).
 */

// Types
export * from './types';

// Client
export { 
  ExactTonScheme, 
  registerExactTonScheme,
  type TonClientConfig 
} from './client';

// Server
export { 
  ExactTonServer, 
  registerExactTonScheme as registerExactTonServerScheme,
  type TonServerConfig,
  type TonServerSchemeConfig 
} from './server';

// Facilitator
export { 
  ExactTonFacilitator, 
  registerExactTonFacilitatorScheme,
  type TonFacilitatorConfig,
  type TonFacilitatorSchemeConfig 
} from './facilitator';

// Constants
export { 
  TON_SCHEME, 
  TON_NETWORKS, 
  USDT_CONTRACTS, 
  USDT_DECIMALS 
} from './types';

export type { 
  TonNetwork, 
  TonPaymentPayload, 
  TonTransferMessage,
  TonPaymentRequirementsExtra,
  TonPaymentRequirements,
  TonSchemeConfig,
  TonClientSigner,
  TonFacilitatorSigner,
  TonVerifyResponse,
  TonSettleResponse 
} from './types';