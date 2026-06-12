// NostrClient — Browser-compatible Nostr client wrapper using nostr-tools v2
// Supports multiple relays, reconnection, event publishing, and subscriptions

import { Relay, finalizeEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { matchFilter, matchFilters, mergeFilters } from 'nostr-tools/filter';

// Define Event type locally since nostr-tools doesn't export it
const NostrEvent = Object;

/**
 * Configuration options for NostrClient
 * @typedef {Object} NostrClientConfig
 * @property {string[]} relays - Array of relay URLs (wss://)
 * @property {number} [reconnectInterval=5000] - Base reconnect interval in ms
 * @property {number} [maxReconnectAttempts=10] - Maximum reconnection attempts per relay
 * @property {number} [connectionTimeout=10000] - Connection timeout in ms
 */

export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed',
};

/**
 * NostrClient - Manages connections to multiple Nostr relays
 */
export class NostrClient {
  constructor(config) {
    this.config = {
      relays: config.relays || [],
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      connectionTimeout: config.connectionTimeout ?? 10000,
    };

    this.relayStates = new Map();
    this.eventHandlers = new Map();
    this.state = ConnectionState.DISCONNECTED;
    this.listeners = new Map();
    this.isShuttingDown = false;
    this.subscriptionFilters = new Map();
    this.subscriptionHandlers = new Map();

    for (const url of this.config.relays) {
      this.relayStates.set(url, {
        url,
        relay: null,
        connected: false,
        reconnectAttempts: 0,
        subscriptions: new Map(),
      });
    }
  }

  /**
   * Subscribe to client events
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);

    return () => {
      const current = this.listeners.get(event) || [];
      const idx = current.indexOf(listener);
      if (idx !== -1) current.splice(idx, 1);
    };
  }

  _emit(event, ...args) {
    const listeners = this.listeners.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(...args);
      } catch (e) {
        console.error(`Error in ${event} listener:`, e);
      }
    }
  }

  _setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this._emit('stateChange', newState);
    }
  }

  /**
   * Connect to all configured relays
   */
  async connect() {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return;
    }

    this._setState(ConnectionState.CONNECTING);
    this.isShuttingDown = false;

    const connectionPromises = this.config.relays.map(url => this._connectToRelay(url));
    await Promise.allSettled(connectionPromises);

    const connectedCount = Array.from(this.relayStates.values()).filter(s => s.connected).length;
    if (connectedCount > 0) {
      this._setState(ConnectionState.CONNECTED);
    } else {
      this._setState(ConnectionState.FAILED);
      throw new Error('Failed to connect to any relay');
    }
  }

  async _connectToRelay(url) {
    const state = this.relayStates.get(url);
    if (!state || state.connected) return;

    try {
      const relay = await this._createRelayConnection(url);
      state.relay = relay;
      state.connected = true;
      state.reconnectAttempts = 0;

      this._emit('relayConnect', url);
      this._setupRelayEventHandlers(url);
      this._resubscribeRelay(url);
    } catch (error) {
      state.reconnectAttempts++;
      this._emit('relayError', url, error);

      if (!this.isShuttingDown && state.reconnectAttempts < this.config.maxReconnectAttempts) {
        this._scheduleReconnect(url);
      } else if (state.reconnectAttempts >= this.config.maxReconnectAttempts) {
        this._emit('relayDisconnect', url, 'Max reconnect attempts reached');
      }
    }
  }

  _createRelayConnection(url) {
    const relay = new Relay(url);

    return relay.connect({ timeout: this.config.connectionTimeout }).then(() => {
      return relay;
    }).catch((err) => {
      relay.close();
      throw err;
    });
  }

  _setupRelayEventHandlers(url) {
    const state = this.relayStates.get(url);
    if (!state || !state.relay) return;

    state.relay.onclose = () => {
      state.connected = false;
      this._emit('relayDisconnect', url);
      if (!this.isShuttingDown) {
        this._scheduleReconnect(url);
      }
    };
  }

  _scheduleReconnect(url) {
    const state = this.relayStates.get(url);
    if (!state || this.isShuttingDown) return;

    this._setState(ConnectionState.RECONNECTING);

    const delay = this.config.reconnectInterval * Math.min(state.reconnectAttempts, 5);
    setTimeout(() => {
      if (!this.isShuttingDown) {
        this._connectToRelay(url);
      }
    }, delay);
  }

  _resubscribeRelay(url) {
    const state = this.relayStates.get(url);
    if (!state || !state.relay || !state.connected) return;

    for (const [subId] of state.subscriptions) {
      const filters = this.subscriptionFilters.get(subId);
      const handlers = this.subscriptionHandlers.get(subId);
      if (filters && handlers) {
        const sub = state.relay.subscribe(filters, {
          onevent: (event) => handlers.onevent(event, url),
          oneose: () => handlers.oneose?.(url),
          onclose: (reason) => handlers.onclose?.(reason, url),
        });
        state.subscriptions.set(subId, sub);
      }
    }
  }

  /**
   * Publish an event to all connected relays
   * @param {NostrEvent} event - The event to publish
   * @returns {Promise<string[]>} Array of relay URLs where publish succeeded
   */
  async publishEvent(event) {
    const results = [];

    for (const [url, state] of this.relayStates) {
      if (state.connected && state.relay) {
        try {
          const published = await state.relay.publish(event);
          if (published) {
            results.push(url);
          }
        } catch (err) {
          this._emit('relayError', url, err);
        }
      }
    }

    return results;
  }

  /**
   * Sign and publish an event with a private key
   * @param {Object} unsignedEvent - Event without id, sig, pubkey
   * @param {string|Uint8Array} privateKey - Private key (nsec or hex/bytes)
   * @returns {Promise<string[]>} Array of relay URLs where publish succeeded
   */
  async signAndPublishEvent(unsignedEvent, privateKey) {
    const decoded = typeof privateKey === 'string' && privateKey.startsWith('nsec')
      ? nip19.decode(privateKey)
      : { data: privateKey };
    const sk = decoded.data instanceof Uint8Array ? decoded.data : new Uint8Array(decoded.data);
    const event = finalizeEvent(unsignedEvent, sk);
    return this.publishEvent(event);
  }

  /**
   * Subscribe to events matching filters
   * @param {Filter|Filter[]} filters - Nostr filters
   * @param {Object} handlers - Event handlers
   * @param {Function} handlers.onevent - Called for each event
   * @param {Function} [handlers.oneose] - Called on end of stored events
   * @param {Function} [handlers.onclose] - Called when subscription closes
   * @returns {string} Subscription ID
   */
  subscribe(filters, handlers) {
    const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const filterArray = Array.isArray(filters) ? filters : [filters];

    this.subscriptionFilters.set(subId, filterArray);
    this.subscriptionHandlers.set(subId, handlers);

    for (const [url, state] of this.relayStates) {
      if (state.connected && state.relay) {
        const sub = state.relay.subscribe(filterArray, {
          onevent: (event) => handlers.onevent(event, url),
          oneose: () => handlers.oneose?.(url),
          onclose: (reason) => handlers.onclose?.(reason, url),
        });
        state.subscriptions.set(subId, sub);
      }
    }

    return subId;
  }

  /**
   * Unsubscribe from a subscription
   * @param {string} subId - Subscription ID
   */
  unsubscribe(subId) {
    this.subscriptionFilters.delete(subId);
    this.subscriptionHandlers.delete(subId);

    for (const [url, state] of this.relayStates) {
      const sub = state.subscriptions.get(subId);
      if (sub) {
        sub.close();
        state.subscriptions.delete(subId);
      }
    }
  }

  /**
   * Get current connection state
   * @returns {ConnectionState}
   */
  getConnectionState() {
    return this.state;
  }

  /**
   * Get list of connected relay URLs
   * @returns {string[]}
   */
  getConnectedRelays() {
    return Array.from(this.relayStates.entries())
      .filter(([, state]) => state.connected)
      .map(([url]) => url);
  }

  /**
   * Get relay connection status
   * @returns {Map<string, {connected: boolean, reconnectAttempts: number}>}
   */
  getRelayStatus() {
    const status = new Map();
    for (const [url, state] of this.relayStates) {
      status.set(url, {
        connected: state.connected,
        reconnectAttempts: state.reconnectAttempts,
      });
    }
    return status;
  }

  /**
   * Disconnect from all relays
   */
  async disconnect() {
    this.isShuttingDown = true;
    this._setState(ConnectionState.DISCONNECTED);

    for (const [url, state] of this.relayStates) {
      for (const [, sub] of state.subscriptions) {
        sub.close();
      }
      state.subscriptions.clear();

      if (state.relay) {
        state.relay.close();
        state.relay = null;
      }
      state.connected = false;
      state.reconnectAttempts = 0;
    }

    this.subscriptionFilters.clear();
    this.subscriptionHandlers.clear();
  }
}

/**
 * Create a new NostrClient instance
 * @param {NostrClientConfig} config
 * @returns {NostrClient}
 */
export function createNostrClient(config) {
  return new NostrClient(config);
}

/**
 * Create an unsigned Nostr event
 * @param {number} kind - Event kind
 * @param {string} content - Event content
 * @param {string[][]} [tags=[]] - Event tags
 * @param {string} [pubkey=''] - Publisher public key
 * @returns {Object} Unsigned event
 */
export function createEvent(kind, content, tags = [], pubkey = '') {
  return {
    kind,
    content,
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

// Export utility functions for key handling
export function generatePrivateKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function privateKeyToNsec(privateKey) {
  return nip19.nsecEncode(privateKey);
}

export function nsecToPrivateKey(nsec) {
  const decoded = nip19.decode(nsec);
  return decoded.data;
}

export function privateKeyToNpub(privateKey) {
  const { getPublicKey } = require('nostr-tools');
  const pubkey = getPublicKey(privateKey);
  return nip19.npubEncode(pubkey);
}