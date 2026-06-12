// SkillDiscovery - Discovers agent skills on Nostr
// Subscribes to Kind 30000 events, maintains queryable index

import { NostrClient, createNostrClient } from './nostr-client.js';
import { matchFilter, matchFilters, mergeFilters } from 'nostr-tools/filter';
import { parseSkillEvent, buildSearchableText, compareVersions, SKILL_EVENT_KIND } from './skill-types.js';

// Define Event type locally since nostr-tools doesn't export it
const NostrEvent = Object;

export { SKILL_EVENT_KIND };

/**
 * Skill metadata as discovered from Nostr
 * @typedef {Object} SkillMetadata
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {Record<string, unknown>} inputSchema
 * @property {Record<string, unknown>} outputSchema
 * @property {Object} [pricing]
 * @property {string[]} capabilities
 * @property {string} [category]
 * @property {string} [repository]
 * @property {string} [documentation]
 * @property {string} [license]
 */

/**
 * Skill entry with discovery metadata
 * @typedef {Object} SkillEntry
 * @property {string} pubkey - Agent pubkey
 * @property {SkillMetadata} metadata - Skill metadata
 * @property {string} relay - Relay URL where discovered
 * @property {string} eventId - Nostr event ID
 * @property {number} createdAt - Event timestamp
 * @property {string} dTag - Skill d-tag
 * @property {string} [content] - Event content
 */

/**
 * SkillDiscovery configuration
 * @typedef {Object} SkillDiscoveryConfig
 * @property {string[]} relays - Nostr relay URLs
 * @property {number} [reconnectInterval=5000]
 * @property {number} [maxReconnectAttempts=10]
 * @property {number} [connectionTimeout=10000]
 * @property {Filter} [initialFilter] - Optional additional filter
 */

/**
 * Find skills query
 * @typedef {Object} FindSkillsQuery
 * @property {string} [name] - Fuzzy name match
 * @property {string} [category] - Category filter
 * @property {string[]} [capabilities] - Required capabilities
 * @property {string} [pubkey] - Agent pubkey filter
 * @property {string} [dTag] - Exact d-tag match
 * @property {string} [minVersion] - Minimum version
 * @property {string} [maxVersion] - Maximum version
 */

export class SkillDiscovery {
  constructor(config) {
    this.config = {
      relays: config.relays,
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      connectionTimeout: config.connectionTimeout ?? 10000,
      initialFilter: config.initialFilter ?? {},
    };

    this.client = createNostrClient(this.config);
    this.index = new Map(); // pubkey:dTag -> { entry, searchableText }
    this.listeners = new Map();
    this.subscriptionId = null;
    this.isRunning = false;

    this.client.on('stateChange', (state) => {
      if (state === 'connected' && this.isRunning) {
        this.subscribeToSkills();
      }
    });

    this.client.on('relayError', (url, error) => {
      this._emit('error', new Error(`Relay ${url} error: ${error.message}`));
    });
  }

  /**
   * Subscribe to events
   * @param {string} event
   * @param {Function} listener
   * @returns {Function} Unsubscribe
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

  /**
   * Start discovery
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.client.connect();
    this.subscribeToSkills();
  }

  /**
   * Stop discovery
   */
  async stop() {
    this.isRunning = false;
    if (this.subscriptionId) {
      this.client.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
    await this.client.disconnect();
  }

  subscribeToSkills() {
    const filters = {
      kinds: [SKILL_EVENT_KIND],
      ...this.config.initialFilter,
    };

    this.subscriptionId = this.client.subscribe([filters], {
      onevent: (event, relayUrl) => this.handleSkillEvent(event, relayUrl),
      oneose: () => {},
      onclose: () => {},
    });
  }

  handleSkillEvent(event, relayUrl) {
    try {
      const skillEntry = parseSkillEvent(event, relayUrl);
      if (!skillEntry) return;

      const existingKey = this._getIndexKey(skillEntry.pubkey, skillEntry.dTag);
      const isRetracted = skillEntry.content === 'retracted';

      if (isRetracted) {
        if (this.index.has(existingKey)) {
          this.index.delete(existingKey);
        }
        this._emit('skillRetracted', skillEntry.dTag, skillEntry.pubkey);
        return;
      }

      if (this.index.has(existingKey)) {
        const existing = this.index.get(existingKey);
        if (skillEntry.createdAt > existing.entry.createdAt) {
          this.index.set(existingKey, {
            entry: skillEntry,
            searchableText: buildSearchableText(skillEntry),
          });
          this._emit('skillUpdated', skillEntry);
        }
      } else {
        this.index.set(existingKey, {
          entry: skillEntry,
          searchableText: buildSearchableText(skillEntry),
        });
        this._emit('skillDiscovered', skillEntry);
      }
    } catch (error) {
      this._emit('error', error);
    }
  }

  _getIndexKey(pubkey, dTag) {
    return `${pubkey}:${dTag}`;
  }

  /**
   * Find skills matching query
   * @param {FindSkillsQuery} query
   * @returns {SkillEntry[]}
   */
  findSkills(query) {
    const results = [];

    for (const [, indexed] of this.index) {
      const entry = indexed.entry;
      const searchable = indexed.searchableText;

      let matches = true;

      if (query.name) {
        const nameLower = query.name.toLowerCase();
        matches = matches && (
          entry.metadata.name.toLowerCase().includes(nameLower) ||
          searchable.includes(nameLower)
        );
      }

      if (query.category) {
        matches = matches && entry.metadata.category?.toLowerCase() === query.category.toLowerCase();
      }

      if (query.capabilities && query.capabilities.length > 0) {
        matches = matches && query.capabilities.every(cap =>
          entry.metadata.capabilities.some(ec => ec.toLowerCase() === cap.toLowerCase())
        );
      }

      if (query.pubkey) {
        matches = matches && entry.pubkey === query.pubkey;
      }

      if (query.dTag) {
        matches = matches && entry.dTag === query.dTag;
      }

      if (query.minVersion) {
        matches = matches && compareVersions(entry.metadata.version, query.minVersion) >= 0;
      }

      if (query.maxVersion) {
        matches = matches && compareVersions(entry.metadata.version, query.maxVersion) <= 0;
      }

      if (matches) {
        results.push(entry);
      }
    }

    results.sort((a, b) => b.createdAt - a.createdAt);
    return results;
  }

  /**
   * Get skill by pubkey and dTag
   * @param {string} pubkey
   * @param {string} dTag
   * @returns {SkillEntry|null}
   */
  getSkillByDTag(pubkey, dTag) {
    const key = this._getIndexKey(pubkey, dTag);
    return this.index.get(key)?.entry || null;
  }

  /**
   * Get all skills
   * @returns {SkillEntry[]}
   */
  getAllSkills() {
    return Array.from(this.index.values())
      .map(v => v.entry)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get skills by agent pubkey
   * @param {string} pubkey
   * @returns {SkillEntry[]}
   */
  getSkillsByPubkey(pubkey) {
    return this.getAllSkills().filter(s => s.pubkey === pubkey);
  }

  /**
   * Get skills by category
   * @param {string} category
   * @returns {SkillEntry[]}
   */
  getSkillsByCategory(category) {
    return this.getAllSkills().filter(s => s.metadata.category?.toLowerCase() === category.toLowerCase());
  }

  /**
   * Get skills by capability
   * @param {string} capability
   * @returns {SkillEntry[]}
   */
  getSkillsByCapability(capability) {
    const capLower = capability.toLowerCase();
    return this.getAllSkills().filter(s => s.metadata.capabilities.some(c => c.toLowerCase() === capLower));
  }

  /**
   * Get index size
   * @returns {number}
   */
  getIndexSize() {
    return this.index.size;
  }

  /**
   * Get connected relays
   * @returns {string[]}
   */
  getConnectedRelays() {
    return this.client.getConnectedRelays();
  }

  /**
   * Get connection state
   * @returns {string}
   */
  getConnectionState() {
    return this.client.getConnectionState();
  }

  /**
   * Publish a skill (helper for agents)
   * @param {string} privateKey - nsec or hex
   * @param {string} dTag - Skill d-tag
   * @param {SkillMetadata} metadata - Skill metadata
   * @returns {Promise<string[]>} Relay URLs
   */
  async publishSkill(privateKey, dTag, metadata) {
    const tags = [
      ['d', `${metadata.d || dTag}`],
      ['name', metadata.name],
      ['description', metadata.description],
      ['version', metadata.version],
      ['input_schema', JSON.stringify(metadata.inputSchema)],
      ['output_schema', JSON.stringify(metadata.outputSchema)],
    ];

    if (metadata.pricing) {
      tags.push(['pricing', JSON.stringify(metadata.pricing)]);
    }

    for (const cap of metadata.capabilities) {
      tags.push(['capabilities', cap]);
    }

    if (metadata.category) tags.push(['category', metadata.category]);
    if (metadata.repository) tags.push(['repository', metadata.repository]);
    if (metadata.documentation) tags.push(['documentation', metadata.documentation]);
    if (metadata.license) tags.push(['license', metadata.license]);

    const event = {
      kind: SKILL_EVENT_KIND,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    };

    return this.client.signAndPublishEvent(event, privateKey);
  }

  /**
   * Retract a skill
   * @param {string} privateKey
   * @param {string} dTag
   * @returns {Promise<string[]>}
   */
  async retractSkill(privateKey, dTag) {
    const event = {
      kind: SKILL_EVENT_KIND,
      content: 'retracted',
      tags: [
        ['d', dTag],
        ['status', 'retracted'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    };

    return this.client.signAndPublishEvent(event, privateKey);
  }
}

/**
 * Create a SkillDiscovery instance
 * @param {SkillDiscoveryConfig} config
 * @returns {SkillDiscovery}
 */
export function createSkillDiscovery(config) {
  return new SkillDiscovery(config);
}