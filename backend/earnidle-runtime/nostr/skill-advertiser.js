// SkillAdvertiser - Publishes agent skills to Nostr
// Automatically manages keys, publishes skills, handles updates/retractions

import { NostrClient, createNostrClient, generatePrivateKey, privateKeyToNsec, nsecToPrivateKey, privateKeyToNpub } from './nostr-client.js';
import {
  skillMetadataToTags,
  createSkillEventContent,
  skillTagsToNostrTags,
  SKILL_EVENT_KIND,
  SKILL_D_TAG_PREFIX,
} from './skill-types.js';

/**
 * SkillAdvertiser configuration
 * @typedef {Object} SkillAdvertiserConfig
 * @property {string[]} relays - Nostr relay URLs
 * @property {string} agentId - Unique agent identifier
 * @property {string} agentName - Human-readable agent name
 * @property {string} [agentDescription] - Agent description
 * @property {number} [refreshInterval=300000] - Periodic refresh interval (ms)
 * @property {Uint8Array|string} [privateKey] - Private key (bytes or nsec)
 * @property {string} [privateKeyPath='./nostr-keys.json'] - Path to store keys
 * @property {boolean} [autoGenerateKeys=true] - Auto-generate keys if missing
 */

/**
 * Stored keys format
 * @typedef {Object} StoredKeys
 * @property {string} privateKey - Hex private key
 * @property {string} publicKey - Hex public key
 * @property {string} nsec - nsec encoded private key
 * @property {string} npub - npub encoded public key
 */

/**
 * Skill registry interface
 * @typedef {Object} SkillRegistry
 * @property {Function} getSkills - Returns array of SkillMetadata
 * @property {Function} [onChange] - Called when skills change, returns unsubscribe
 */

export class SkillAdvertiser {
  constructor(config, skillRegistry, client) {
    this.config = {
      relays: config.relays,
      agentId: config.agentId,
      agentName: config.agentName,
      agentDescription: config.agentDescription ?? '',
      refreshInterval: config.refreshInterval ?? 300000,
      privateKey: config.privateKey,
      privateKeyPath: config.privateKeyPath ?? './nostr-keys.json',
      autoGenerateKeys: config.autoGenerateKeys ?? true,
    };

    this.skillRegistry = skillRegistry;
    this.client = client;
    this.refreshTimer = null;
    this.changeUnsubscribe = null;
    this.isRunning = false;
    this.lastPublishedHash = '';
    this.listeners = new Map();
    this.privateKey = null;

    if (!this.client) {
      this.client = new NostrClient({
        relays: this.config.relays,
        reconnectInterval: 3000,
        maxReconnectAttempts: 5,
      });
    }

    this._setupClientListeners();
  }

  _setupClientListeners() {
    this.client.on('relayError', (url, error) => {
      this._emit('error', error);
    });

    this.client.on('stateChange', (state) => {
      if (state === ConnectionState.CONNECTED && this.isRunning) {
        this.publishSkills();
      }
    });
  }

  /**
   * Start the advertiser
   */
  async start() {
    if (this.isRunning) return;

    await this._loadOrGenerateKeys();

    this.isRunning = true;
    this._startPeriodicRefresh();

    if (this.skillRegistry.onChange) {
      this.changeUnsubscribe = this.skillRegistry.onChange(() => {
        if (this.isRunning) {
          this.publishSkills();
        }
      });
    }

    await this.client.connect();
    this._emit('started');
  }

  /**
   * Stop the advertiser
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.changeUnsubscribe) {
      this.changeUnsubscribe();
      this.changeUnsubscribe = null;
    }

    await this.client.disconnect();
    this._emit('stopped');
  }

  async _loadOrGenerateKeys() {
    // If private key provided directly
    if (this.config.privateKey) {
      this.privateKey = typeof this.config.privateKey === 'string'
        ? nsecToPrivateKey(this.config.privateKey)
        : this.config.privateKey;
      return;
    }

    // Try to load from storage (IndexedDB in browser, filesystem in Node)
    const stored = await this._loadKeysFromStorage();
    if (stored) {
      this.privateKey = nsecToPrivateKey(stored.nsec);
      this._emit('keyLoaded', stored.npub);
      return;
    }

    // Generate new keys
    if (this.config.autoGenerateKeys) {
      this.privateKey = generatePrivateKey();
      const nsec = privateKeyToNsec(this.privateKey);
      const npub = privateKeyToNpub(this.privateKey);

      const stored = {
        privateKey: Buffer.from(this.privateKey).toString('hex'),
        publicKey: this._getPublicKeyHex(),
        nsec,
        npub,
      };

      await this._saveKeysToStorage(stored);
      this._emit('keyGenerated', stored);
    } else {
      throw new Error('No private key provided and auto-generate is disabled');
    }
  }

  async _loadKeysFromStorage() {
    // Browser: use IndexedDB or localStorage
    if (typeof window !== 'undefined' && window.indexedDB) {
      return this._loadFromIndexedDB();
    }
    // Node: use filesystem (if available)
    if (typeof process !== 'undefined' && process.versions?.node) {
      return this._loadFromFilesystem();
    }
    return null;
  }

  async _saveKeysToStorage(stored) {
    if (typeof window !== 'undefined' && window.indexedDB) {
      return this._saveToIndexedDB(stored);
    }
    if (typeof process !== 'undefined' && process.versions?.node) {
      return this._saveToFilesystem(stored);
    }
  }

  async _loadFromIndexedDB() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('qvac-nostr-keys', 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keys', 'readonly');
          const store = tx.objectStore('keys');
          const getReq = store.get('agent-keys');
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('keys')) {
            db.createObjectStore('keys');
          }
        };
      } catch {
        resolve(null);
      }
    });
  }

  async _saveToIndexedDB(stored) {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('qvac-nostr-keys', 1);
        request.onerror = resolve;
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keys', 'readwrite');
          tx.objectStore('keys').put(stored, 'agent-keys');
          tx.oncomplete = resolve;
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('keys')) {
            db.createObjectStore('keys');
          }
        };
      } catch {
        resolve();
      }
    });
  }

  _loadFromFilesystem() {
    try {
      const fs = require('fs');
      const path = require('path');
      if (fs.existsSync(this.config.privateKeyPath)) {
        const stored = JSON.parse(fs.readFileSync(this.config.privateKeyPath, 'utf-8'));
        return stored;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  _saveToFilesystem(stored) {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(this.config.privateKeyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.config.privateKeyPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
    } catch {
      // Ignore errors in browser
    }
  }

  _getPublicKeyHex() {
    const { getPublicKey } = require('nostr-tools');
    const pubkey = getPublicKey(this.privateKey);
    return pubkey;
  }

  _startPeriodicRefresh() {
    this.refreshTimer = setInterval(() => {
      if (this.isRunning) {
        this.publishSkills();
      }
    }, this.config.refreshInterval);
  }

  /**
   * Publish all skills to Nostr
   */
  async publishSkills() {
    const skills = this.skillRegistry.getSkills();
    if (skills.length === 0) return;

    const registry = {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      agentDescription: this.config.agentDescription,
      skills,
      updatedAt: Date.now(),
    };

    const content = createSkillEventContent(registry);
    const contentHash = this._hashContent(content);

    if (contentHash === this.lastPublishedHash) {
      return; // No changes
    }

    for (const skill of skills) {
      const skillTags = skillMetadataToTags(
        skill,
        this.config.agentId,
        this.config.agentName,
        this.config.agentDescription
      );

      const eventTemplate = createEvent(SKILL_EVENT_KIND, content, skillTagsToNostrTags(skillTags));

      try {
        await this.client.signAndPublishEvent(eventTemplate, this.privateKey);
        this.lastPublishedHash = contentHash;
        this._emit('published', skillTags);
      } catch (error) {
        this._emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  _hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Publish an update for a specific skill
   * @param {string} skillId - Skill d-tag
   */
  async publishSkillUpdate(skillId) {
    const skills = this.skillRegistry.getSkills();
    const skill = skills.find(s => s.d === skillId);
    if (!skill) {
      throw new Error(`Skill with id ${skillId} not found`);
    }

    const skillTags = skillMetadataToTags(
      skill,
      this.config.agentId,
      this.config.agentName,
      this.config.agentDescription
    );

    const registry = {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      agentDescription: this.config.agentDescription,
      skills: [skill],
      updatedAt: Date.now(),
    };

    const content = createSkillEventContent(registry);
    const eventTemplate = createEvent(SKILL_EVENT_KIND, content, skillTagsToNostrTags(skillTags));

    try {
      await this.client.signAndPublishEvent(eventTemplate, this.privateKey);
      this._emit('published', skillTags);
    } catch (error) {
      this._emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Retract a skill (mark as retracted on Nostr)
   * @param {string} skillId - Skill d-tag
   */
  async retractSkill(skillId) {
    const skills = this.skillRegistry.getSkills();
    const skill = skills.find(s => s.d === skillId);
    if (!skill) {
      throw new Error(`Skill with id ${skillId} not found`);
    }

    const skillTags = skillMetadataToTags(
      skill,
      this.config.agentId,
      this.config.agentName,
      this.config.agentDescription
    );

    // Create retraction event
    const retractedSkill = {
      ...skill,
      description: '',
      pricing: { model: 'free', amount: '0', currency: 'sats' },
    };

    const registry = {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      agentDescription: this.config.agentDescription,
      skills: [retractedSkill],
      updatedAt: Date.now(),
    };

    const content = createSkillEventContent(registry);
    const eventTemplate = createEvent(SKILL_EVENT_KIND, 'retracted', skillTagsToNostrTags({
      ...skillTags,
      pricing: JSON.stringify({ model: 'free', amount: '0', currency: 'sats' }),
    }));
    // Override content to 'retracted' for retraction
    eventTemplate.content = 'retracted';

    try {
      await this.client.signAndPublishEvent(eventTemplate, this.privateKey);
      this._emit('published', skillTags);
    } catch (error) {
      this._emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get agent's npub
   * @returns {string}
   */
  getNpub() {
    return privateKeyToNpub(this.privateKey);
  }

  /**
   * Get agent ID
   * @returns {string}
   */
  getAgentId() {
    return this.config.agentId;
  }

  /**
   * Check if running
   * @returns {boolean}
   */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * Get connected relays
   * @returns {string[]}
   */
  getConnectedRelays() {
    return this.client.getConnectedRelays();
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
      } catch {
        // Ignore listener errors
      }
    });
  }
}

/**
 * Create a SkillAdvertiser instance
 * @param {SkillAdvertiserConfig} config
 * @param {SkillRegistry} skillRegistry
 * @param {NostrClient} [client]
 * @returns {SkillAdvertiser}
 */
export function createSkillAdvertiser(config, skillRegistry, client) {
  return new SkillAdvertiser(config, skillRegistry, client);
}

// Import ConnectionState from nostr-client
import { ConnectionState } from './nostr-client.js';