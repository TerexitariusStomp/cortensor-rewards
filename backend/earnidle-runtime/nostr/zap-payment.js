// ZapPayment — NIP-57 Lightning Zaps for job payments
// Handles zap request creation (kind 9734), NIP-07 signing, and zap receipt listening (kind 9735)

import { finalizeEvent, nip19, nip98 } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';

export const ZAP_REQUEST_KIND = 9734;
export const ZAP_RECEIPT_KIND = 9735;

// Default relays for zap communication
export const DEFAULT_ZAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
];

/**
 * Zap request data structure
 * @typedef {Object} ZapRequest
 * @property {string} amount - Amount in millisats (1/1000 sat)
 * @property {string} recipientPubkey - Recipient's public key (hex)
 * @property {string} description - Description with job reference
 * @property {string} [lightningAddress] - Optional lightning address for lnurl-pay
 * @property {string} [lnurl] - Optional lnurl pay request
 * @property {string} [jobId] - Job d-tag reference
 * @property {string} [jobEventId] - Job event ID reference
 */

/**
 * Zap receipt data structure (from kind 9735 event)
 * @typedef {Object} ZapReceipt
 * @property {string} eventId - Receipt event ID
 * @property {string} requestId - Original zap request event ID
 * @property {string} senderPubkey - Sender's public key
 * @property {string} recipientPubkey - Recipient's public key
 * @property {number} amount - Amount received in millisats
 * @property {string} description - Description from receipt
 * @property {string} bolt11 - BOLT11 invoice
 * @property {string} preimage - Payment preimage (if available)
 * @property {number} createdAt - Event timestamp
 * @property {string} relay - Relay where received
 */

/**
 * ZapPayment configuration
 * @typedef {Object} ZapPaymentConfig
 * @property {string[]} [relays=DEFAULT_ZAP_RELAYS] - Relay URLs
 * @property {number} [timeout=30000] - Timeout for zap operations (ms)
 * @property {number} [receiptTimeout=120000] - Timeout waiting for zap receipt (ms)
 */

/**
 * NIP-07 signer interface
 * @typedef {Object} Nip07Signer
 * @property {Function} signEvent - Signs an event
 * @property {Function} getPublicKey - Gets user's public key
 */

/**
 * Extract NIP-07 signer from window
 * @returns {Promise<Nip07Signer|null>}
 */
export async function getNip07Signer() {
  if (typeof window === 'undefined') return null;

  // Check for Alby, nos2x, and other NIP-07 providers
  if (window.nostr) {
    return window.nostr;
  }
  if (window.nos2x) {
    return window.nos2x;
  }
  return null;
}

/**
 * Get user's public key from NIP-07 signer
 * @param {Nip07Signer} signer
 * @returns {Promise<string>} Hex public key
 */
export async function getUserPubkey(signer) {
  const pubkey = await signer.getPublicKey();
  return pubkey;
}

/**
 * Create a zap request event (kind 9734)
 * @param {ZapRequest} zapRequest
 * @param {string} senderPubkey - Sender's hex public key
 * @returns {Object} Unsigned zap request event
 */
export function createZapRequestEvent(zapRequest, senderPubkey) {
  const tags = [
    ['p', zapRequest.recipientPubkey], // Recipient pubkey
    ['amount', zapRequest.amount.toString()], // Amount in millisats
    ['description', zapRequest.description], // Description with job reference
  ];

  // Add job reference tags if provided
  if (zapRequest.jobId) {
    tags.push(['job', zapRequest.jobId]);
  }
  if (zapRequest.jobEventId) {
    tags.push(['e', zapRequest.jobEventId, '', 'job']);
  }

  // Add lightning address or lnurl if provided
  if (zapRequest.lightningAddress) {
    tags.push(['lightning', zapRequest.lightningAddress]);
  }
  if (zapRequest.lnurl) {
    tags.push(['lnurl', zapRequest.lnurl]);
  }

  // Add zap marker
  tags.push(['zap', '']);

  return {
    kind: ZAP_REQUEST_KIND,
    content: zapRequest.description,
    tags,
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Parse a zap receipt event (kind 9735)
 * @param {Object} event - Nostr event
 * @param {string} relayUrl
 * @returns {ZapReceipt|null}
 */
export function parseZapReceiptEvent(event, relayUrl) {
  if (event.kind !== ZAP_RECEIPT_KIND) return null;

  const getTag = (name) => {
    const tag = event.tags.find(([k]) => k === name);
    return tag ? tag[1] : undefined;
  };

  const amountTag = getTag('amount');
  const bolt11Tag = getTag('bolt11');
  const preimageTag = getTag('preimage');
  const descriptionTag = getTag('description');
  const eTag = getTag('e');
  const jobTag = getTag('job');
  const pTag = getTag('p');

  if (!amountTag || !pTag) return null;

  return {
    eventId: event.id,
    requestId: eTag || '',
    senderPubkey: event.pubkey,
    recipientPubkey: pTag,
    amount: Number(amountTag),
    description: descriptionTag || '',
    bolt11: bolt11Tag || '',
    preimage: preimageTag || '',
    createdAt: event.created_at,
    relay: relayUrl,
    jobId: jobTag,
  };
}

/**
 * Publish event to multiple relays
 * @param {Object} event - Signed event
 * @param {string[]} relays
 * @param {number} timeout
 * @returns {Promise<string[]>} URLs of successful relays
 */
export async function publishToRelays(event, relays, timeout = 10000) {
  const results = [];

  const publishPromises = relays.map(async (url) => {
    try {
      const relay = await Relay.connect(url, { timeout });
      const published = await relay.publish(event);
      relay.close();
      if (published) {
        results.push(url);
      }
    } catch (err) {
      console.warn(`Failed to publish to ${url}:`, err.message);
    }
  });

  await Promise.allSettled(publishPromises);
  return results;
}

/**
 * Subscribe to zap receipts on relays
 * @param {string[]} relays
 * @param {Function} onReceipt - Callback with ZapReceipt
 * @param {Function} [onError] - Error callback
 * @returns {Promise<Function>} Unsubscribe function
 */
export async function subscribeToZapReceipts(relays, onReceipt, onError) {
  const subscriptions = [];

  for (const url of relays) {
    try {
      const relay = await Relay.connect(url, { timeout: 10000 });

      const sub = relay.subscribe(
        [{ kinds: [ZAP_RECEIPT_KIND] }],
        {
          onevent: (event) => {
            const receipt = parseZapReceiptEvent(event, url);
            if (receipt) {
              onReceipt(receipt);
            }
          },
          oneose: () => {},
          onclose: (reason) => {
            if (onError) onError(new Error(`Subscription closed: ${reason}`), url);
          },
        }
      );

      subscriptions.push({ relay, sub });
    } catch (err) {
      if (onError) onError(err, url);
    }
  }

  return () => {
    for (const { sub, relay } of subscriptions) {
      sub.close();
      relay.close();
    }
  };
}

/**
 * ZapPayment class for managing job payments via NIP-57
 */
export class ZapPayment {
  constructor(config = {}) {
    this.config = {
      relays: config.relays || DEFAULT_ZAP_RELAYS,
      timeout: config.timeout ?? 30000,
      receiptTimeout: config.receiptTimeout ?? 120000,
    };

    this.signer = null;
    this.userPubkey = null;
    this.receiptSubscription = null;
    this.listeners = new Map();
    this.pendingPayments = new Map(); // jobId -> { resolve, reject, timeout }
  }

  /**
   * Check if NIP-07 signer is available
   * @returns {Promise<boolean>}
   */
  async checkNip07() {
    this.signer = await getNip07Signer();
    if (this.signer) {
      this.userPubkey = await getUserPubkey(this.signer);
      return true;
    }
    return false;
  }

  /**
   * Get user's hex public key
   * @returns {Promise<string|null>}
   */
  async getUserPubkey() {
    if (this.userPubkey) {
      return this.userPubkey;
    }
    if (await this.checkNip07()) {
      return this.userPubkey;
    }
    return null;
  }

  /**
   * Get user's npub
   * @returns {Promise<string|null>}
   */
  async getUserNpub() {
    if (this.userPubkey) {
      return nip19.npubEncode(this.userPubkey);
    }
    if (await this.checkNip07()) {
      return nip19.npubEncode(this.userPubkey);
    }
    return null;
  }

  /**
   * Sign an event using NIP-07
   * @param {Object} event - Unsigned event
   * @returns {Promise<Object>} Signed event
   */
  async signEvent(event) {
    if (!this.signer) {
      await this.checkNip07();
    }
    if (!this.signer) {
      throw new Error('No NIP-07 signer available. Please install Alby, nos2x, or another Nostr extension.');
    }

    return this.signer.signEvent(event);
  }

  /**
   * Create and send a zap request for a job
   * @param {Object} params
   * @param {string} params.jobId - Job d-tag
   * @param {string} params.jobEventId - Job event ID
   * @param {string} params.recipientPubkey - Agent's public key (hex)
   * @param {string} params.recipientLightningAddress - Agent's lightning address
   * @param {number} params.amountSats - Amount in satoshis
   * @param {string} [params.description] - Custom description
   * @returns {Promise<Object>} Result with requestEventId and published relays
   */
  async sendZapForJob(params) {
    const {
      jobId,
      jobEventId,
      recipientPubkey,
      recipientLightningAddress,
      amountSats,
      description,
    } = params;

    // Validate
    if (!recipientPubkey || !recipientLightningAddress || !amountSats) {
      throw new Error('Missing required parameters: recipientPubkey, recipientLightningAddress, amountSats');
    }

    // Ensure signer is available
    if (!this.signer) {
      await this.checkNip07();
    }
    if (!this.signer) {
      throw new Error('No NIP-07 signer available');
    }

    // Convert sats to millisats (1 sat = 1000 millisats)
    const amountMillisats = Math.round(amountSats * 1000);

    // Build description with job reference
    const zapDescription = description || `Payment for job ${jobId} (event: ${jobEventId})`;

    // Create zap request
    const zapRequest = {
      amount: amountMillisats.toString(),
      recipientPubkey,
      description: zapDescription,
      lightningAddress: recipientLightningAddress,
      jobId,
      jobEventId,
    };

    const unsignedEvent = createZapRequestEvent(zapRequest, this.userPubkey);

    // Sign with NIP-07
    let signedEvent;
    try {
      signedEvent = await this.signEvent(unsignedEvent);
    } catch (err) {
      throw new Error(`Failed to sign zap request: ${err.message}`);
    }

    // Publish to relays
    const publishedRelays = await publishToRelays(signedEvent, this.config.relays, this.config.timeout);

    if (publishedRelays.length === 0) {
      throw new Error('Failed to publish zap request to any relay');
    }

    this._emit('zapSent', {
      requestEventId: signedEvent.id,
      amountSats,
      recipientPubkey,
      jobId,
      jobEventId,
      publishedRelays,
    });

    return {
      success: true,
      requestEventId: signedEvent.id,
      publishedRelays,
      amountSats,
      recipientPubkey,
    };
  }

  /**
   * Wait for a zap receipt for a specific job
   * @param {Object} params
   * @param {string} params.jobId - Job d-tag
   * @param {string} params.jobEventId - Job event ID
   * @param {string} params.recipientPubkey - Recipient pubkey (should match agent's)
   * @param {number} [params.timeout] - Custom timeout in ms
   * @returns {Promise<ZapReceipt>} The zap receipt
   */
  async waitForZapReceipt(params) {
    const { jobId, jobEventId, recipientPubkey, timeout = this.config.receiptTimeout } = params;

    return new Promise((resolve, reject) => {
      const key = `${jobId}:${jobEventId}`;
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingPayments.delete(key);
        this._cleanupSubscription();
        reject(new Error(`Zap receipt timeout after ${timeout}ms`));
      }, timeout);

      // Store pending payment
      this.pendingPayments.set(key, { resolve, reject, timeoutId });

      // Start listening if not already
      this._startReceiptListener();
    });
  }

  /**
   * Start listening for zap receipts
   */
  _startReceiptListener() {
    if (this.receiptSubscription) return;

    this.receiptSubscription = subscribeToZapReceipts(
      this.config.relays,
      (receipt) => this._handleZapReceipt(receipt),
      (error, url) => this._emit('receiptError', error, url)
    ).then(unsub => {
      this._unsubscribeReceipts = unsub;
    });
  }

  /**
   * Stop listening for zap receipts
   */
  _cleanupSubscription() {
    if (this.pendingPayments.size === 0 && this._unsubscribeReceipts) {
      this._unsubscribeReceipts();
      this._unsubscribeReceipts = null;
      this.receiptSubscription = null;
    }
  }

  /**
   * Handle incoming zap receipt
   * @param {ZapReceipt} receipt
   */
  _handleZapReceipt(receipt) {
    // Check if this receipt matches any pending payment
    for (const [key, pending] of this.pendingPayments) {
      const [jobId, jobEventId] = key.split(':');
      
      // Match by job ID or event ID in description
      const matches = (
        receipt.jobId === jobId ||
        receipt.description.includes(jobId) ||
        receipt.description.includes(jobEventId) ||
        receipt.requestId === jobEventId
      );

      // Also verify recipient
      if (matches && receipt.recipientPubkey === receipt.recipientPubkey) {
        clearTimeout(pending.timeoutId);
        this.pendingPayments.delete(key);
        
        this._emit('zapReceived', receipt);
        pending.resolve(receipt);
        
        this._cleanupSubscription();
        return;
      }
    }

    // Emit for any other listeners
    this._emit('zapReceipt', receipt);
  }

  /**
   * Complete payment flow: send zap and wait for receipt
   * @param {Object} params - Same as sendZapForJob
   * @returns {Promise<Object>} Result with receipt
   */
  async payForJob(params) {
    const sendResult = await this.sendZapForJob(params);
    const receipt = await this.waitForZapReceipt({
      jobId: params.jobId,
      jobEventId: params.jobEventId,
      recipientPubkey: params.recipientPubkey,
    });

    // Verify amount matches
    const expectedMillisats = Math.round(params.amountSats * 1000);
    if (receipt.amount !== expectedMillisats) {
      throw new Error(`Amount mismatch: expected ${expectedMillisats} millisats, got ${receipt.amount}`);
    }

    return {
      success: true,
      requestEventId: sendResult.requestEventId,
      receipt,
      amountSats: params.amountSats,
    };
  }

  /**
   * Cancel pending payment
   * @param {string} jobId
   * @param {string} jobEventId
   */
  cancelPendingPayment(jobId, jobEventId) {
    const key = `${jobId}:${jobEventId}`;
    const pending = this.pendingPayments.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Payment cancelled'));
      this.pendingPayments.delete(key);
      this._cleanupSubscription();
    }
  }

  /**
   * Subscribe to events
   * @param {string} event
   * @param {Function} listener
   * @returns {Function} Unsubscribe
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  _emit(event, ...args) {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(...args);
      } catch (e) {
        console.error(`Error in ${event} listener:`, e);
      }
    });
  }
}

/**
 * Create a ZapPayment instance
 * @param {ZapPaymentConfig} config
 * @returns {ZapPayment}
 */
export function createZapPayment(config) {
  return new ZapPayment(config);
}

/**
 * Utility: Convert sats to millisats
 * @param {number} sats
 * @returns {number}
 */
export function satsToMillisats(sats) {
  return Math.round(sats * 1000);
}

/**
 * Utility: Convert millisats to sats
 * @param {number} millisats
 * @returns {number}
 */
export function millisatsToSats(millisats) {
  return millisats / 1000;
}

/**
 * Utility: Format amount for display
 * @param {number} amountSats
 * @returns {string}
 */
/**
 * Fetch a user's Nostr profile (kind 0) to get lightning address
 * @param {string} pubkey - User's hex public key
 * @param {string[]} [relays=DEFAULT_ZAP_RELAYS] - Relays to query
 * @returns {Promise<Object|null>} Profile object with lightning address if found
 */
export async function fetchUserProfile(pubkey, relays = DEFAULT_ZAP_RELAYS) {
  const { Relay } = await import('nostr-tools/relay');

  for (const url of relays) {
    try {
      const relay = await Relay.connect(url, { timeout: 5000 });

      const sub = relay.subscribe(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        {
          onevent: (event) => {
            if (event.kind === 0) {
              try {
                const profile = JSON.parse(event.content);
                relay.close();
                return profile;
              } catch {
                // Ignore parse errors
              }
            }
          },
          oneose: () => {},
          onclose: () => {},
        }
      );

      // Wait for event or timeout
      await new Promise((resolve) => {
        setTimeout(() => {
          sub.close();
          relay.close();
          resolve();
        }, 5000);
      });
    } catch (err) {
      console.warn(`Failed to fetch profile from ${url}:`, err.message);
    }
  }

  return null;
}

/**
 * Extract lightning address from Nostr profile
 * @param {Object} profile - Nostr profile (kind 0)
 * @returns {string|null} Lightning address or null
 */
export function extractLightningAddress(profile) {
  if (!profile) return null;

  // Check various fields where lightning address might be stored
  // NIP-57 suggests 'lud16' or 'lightning' in profile
  return profile.lud16 || profile.lightning || profile.lnurl || null;
}

/**
 * Fetch lightning address for a pubkey from their Nostr profile
 * @param {string} pubkey - User's hex public key
 * @param {string[]} [relays=DEFAULT_ZAP_RELAYS] - Relays to query
 * @returns {Promise<string|null>} Lightning address or null
 */
export async function fetchLightningAddress(pubkey, relays = DEFAULT_ZAP_RELAYS) {
  const profile = await fetchUserProfile(pubkey, relays);
  return extractLightningAddress(profile);
}

export function formatAmount(amountSats) {
  if (amountSats >= 100000000) {
    return `${(amountSats / 100000000).toFixed(8)} BTC`;
  }
  if (amountSats >= 100000) {
    return `${(amountSats / 100000).toFixed(2)} kSats`;
  }
  return `${amountSats.toLocaleString()} sats`;
}

export default {
  ZapPayment,
  createZapPayment,
  createZapRequestEvent,
  parseZapReceiptEvent,
  publishToRelays,
  subscribeToZapReceipts,
  getNip07Signer,
  getUserPubkey,
  satsToMillisats,
  millisatsToSats,
  formatAmount,
  ZAP_REQUEST_KIND,
  ZAP_RECEIPT_KIND,
  DEFAULT_ZAP_RELAYS,
};