// WOT Integration — Jeletor ai-wot Web of Trust for QVAC Skill Discovery
// Integrates ai-wot trust scoring with Nostr-based agent skill discovery
// Provides trust-based filtering, ranking, and attestation management

import { NostrClient, createNostrClient } from './nostr-client.js';
import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';

// Dynamic import of ai-wot (Node.js/CommonJS) - handle in try/catch for browser compatibility
let aiWot = null;
let aiWotLoaded = false;

async function loadAiWot() {
  if (aiWotLoaded) return aiWot;
  try {
    // ai-wot is a CommonJS package; use dynamic import with default interop
    const mod = await import('ai-wot');
    aiWot = mod.default || mod;
    aiWotLoaded = true;
    return aiWot;
  } catch (error) {
    aiWotLoaded = true; // Don't retry
    console.warn('ai-wot not available:', error.message);
    return null;
  }
}

// ─── Constants ──────────────────────────────────────────────────
const WOT_NAMESPACE = 'ai.wot';
const ATTESTATION_KIND = 1985; // NIP-32 label events
const REVOCATION_KIND = 5;     // NIP-09 deletion events
const ZAP_KIND = 9735;         // NIP-57 zap receipts

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
];

const TRUST_SCORE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HALF_LIFE_DAYS = 90;

// ─── Attestation Types (matching ai-wot) ──────────────────────
export const AttestationType = {
  SERVICE_QUALITY: 'service-quality',
  IDENTITY_CONTINUITY: 'identity-continuity',
  GENERAL_TRUST: 'general-trust',
  DISPUTE: 'dispute',
  WARNING: 'warning',
};

export const POSITIVE_TYPES = [
  AttestationType.SERVICE_QUALITY,
  AttestationType.IDENTITY_CONTINUITY,
  AttestationType.GENERAL_TRUST,
];

export const NEGATIVE_TYPES = [
  AttestationType.DISPUTE,
  AttestationType.WARNING,
];

export const TYPE_MULTIPLIERS = {
  [AttestationType.SERVICE_QUALITY]: 1.0,
  [AttestationType.IDENTITY_CONTINUITY]: 1.2,
  [AttestationType.GENERAL_TRUST]: 0.8,
  [AttestationType.DISPUTE]: -1.5,
  [AttestationType.WARNING]: -0.8,
};

// ─── Types ─────────────────────────────────────────────────────

/**
 * Trust score result with breakdown
 * @typedef {Object} TrustScore
 * @property {number} raw - Raw score (can be negative)
 * @property {number} display - Normalized 0-100 score
 * @property {number} attestationCount - Total attestations
 * @property {number} positiveCount - Positive attestations
 * @property {number} negativeCount - Negative attestations
 * @property {number} gatedCount - Gate-filtered attestations
 * @property {TrustBreakdown[]} breakdown - Per-attestation breakdown
 * @property {DiversityInfo} diversity - Sybil resistance metrics
 */

/**
 * @typedef {Object} TrustBreakdown
 * @property {string} attester - Attester pubkey (hex)
 * @property {string} type - Attestation type
 * @property {number} contribution - Score contribution
 * @property {number} timestamp - Event timestamp
 * @property {number} zapSats - Zap amount in sats
 * @property {number} zapWeight - Zap multiplier
 * @property {boolean} gated - Whether this was filtered by gate
 * @property {string} [comment] - Attestation comment
 */

/**
 * @typedef {Object} DiversityInfo
 * @property {number} diversity - 0=concentrated, 1=distributed
 * @property {number} uniqueAttesters - Number of unique attesters
 * @property {number} maxAttesterShare - Largest single attester share
 * @property {string} [topAttester] - Pubkey of top attester
 */

/**
 * @typedef {Object} AttestationRecord
 * @property {string} id - Event ID
 * @property {string} pubkey - Attester pubkey
 * @property {string} targetPubkey - Target pubkey
 * @property {string} type - Attestation type
 * @property {string} comment - Comment
 * @property {number} createdAt - Timestamp
 * @property {string} [eventRef] - Referenced event
 * @property {number} [expiration] - Expiration timestamp
 */

/**
 * @typedef {Object} WOTConfig
 * @property {string[]} [relays] - Nostr relay URLs
 * @property {number} [halfLifeDays=90] - Temporal decay half-life
 * @property {number} [maxDepth=2] - Recursive trust depth
 * @property {number} [cacheTtl=300000] - Cache TTL in ms
 */

/**
 * @typedef {Object} SkillWithTrust
 * @property {...SkillEntry} entry - Original skill entry
 * @property {TrustScore} trust - Trust score of the skill provider
 */

// ─── WOT Client Class ──────────────────────────────────────────

export class WOTClient {
  constructor(config = {}) {
    this.config = {
      relays: config.relays || DEFAULT_RELAYS,
      halfLifeDays: config.halfLifeDays || DEFAULT_HALF_LIFE_DAYS,
      maxDepth: config.maxDepth || 2,
      cacheTtl: config.cacheTtl || TRUST_SCORE_CACHE_TTL,
    };

    this.client = createNostrClient({ relays: this.config.relays });
    this._trustCache = new Map(); // pubkey -> { score, timestamp }
    this._attestationCache = new Map(); // pubkey -> { attestations, timestamp }
    this.listeners = new Map();
    this.isConnected = false;

    this.client.on('stateChange', (state) => {
      this.isConnected = state === 'connected';
      this._emit('stateChange', state);
    });
  }

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
    this.listeners.get(event)?.forEach(listener => {
      try { listener(...args); } catch (e) { console.error(`WOTClient ${event} error:`, e); }
    });
  }

  async connect() {
    if (this.isConnected) return;
    await this.client.connect();
  }

  async disconnect() {
    if (!this.isConnected) return;
    await this.client.disconnect();
    this.isConnected = false;
  }

  getConnectionState() {
    return this.client.getConnectionState();
  }

  getConnectedRelays() {
    return this.client.getConnectedRelays();
  }

  // ─── Trust Score Calculation ────────────────────────────────

  /**
   * Get trust score for a pubkey with caching
   * @param {string} pubkey - Hex pubkey
   * @param {Object} [opts] - Options override
   * @returns {Promise<TrustScore>}
   */
  async getTrustScore(pubkey, opts = {}) {
    const cacheKey = `${pubkey}:${opts.halfLifeDays || this.config.halfLifeDays}:${opts.maxDepth || this.config.maxDepth}`;
    const cached = this._trustCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.config.cacheTtl) {
      return cached.score;
    }

    // Load ai-wot if available
    const wot = await loadAiWot();
    if (!wot) {
      const fallback = this._emptyTrustScore();
      this._trustCache.set(cacheKey, { score: fallback, timestamp: now });
      return fallback;
    }

    try {
      const score = await wot.calculateTrustScore(pubkey, {
        relays: this.config.relays,
        halfLifeDays: opts.halfLifeDays || this.config.halfLifeDays,
        depth: opts.maxDepth || this.config.maxDepth,
      });

      this._trustCache.set(cacheKey, { score, timestamp: now });
      return score;
    } catch (error) {
      console.error(`Trust score calc failed for ${pubkey}:`, error);
      const fallback = this._emptyTrustScore();
      this._trustCache.set(cacheKey, { score: fallback, timestamp: now });
      return fallback;
    }
  }

  _emptyTrustScore() {
    return {
      raw: 0,
      display: 0,
      attestationCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      gatedCount: 0,
      breakdown: [],
      diversity: { diversity: 0, uniqueAttesters: 0, maxAttesterShare: 0, topAttester: null },
    };
  }

  /**
   * Get trust scores for multiple pubkeys in parallel
   * @param {string[]} pubkeys
   * @returns {Promise<Map<string, TrustScore>>}
   */
  async getTrustScores(pubkeys) {
    const results = new Map();
    await Promise.allSettled(pubkeys.map(async (pubkey) => {
      const score = await this.getTrustScore(pubkey);
      results.set(pubkey, score);
    }));
    return results;
  }

  // ─── Attestation Queries ────────────────────────────────────

  /**
   * Query all attestations about a pubkey
   * @param {string} pubkey
   * @param {Object} [opts]
   * @returns {Promise<AttestationRecord[]>}
   */
  async queryAttestations(pubkey, opts = {}) {
    const cacheKey = `${pubkey}:${opts.type || 'all'}:${opts.limit || 0}`;
    const cached = this._attestationCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.config.cacheTtl) {
      return cached.attestations;
    }

    const wot = await loadAiWot();
    if (!wot) return [];

    try {
      const attestations = await wot.queryAttestations(pubkey, {
        relays: this.config.relays,
        type: opts.type,
        limit: opts.limit,
        includeRevoked: opts.includeRevoked,
      });

      const records = attestations.map(e => this._eventToAttestationRecord(e));
      this._attestationCache.set(cacheKey, { attestations: records, timestamp: now });
      return records;
    } catch (error) {
      console.error(`Query attestations failed for ${pubkey}:`, error);
      return [];
    }
  }

  _eventToAttestationRecord(event) {
    const lTag = event.tags.find(t => t[0] === 'l' && t[2] === WOT_NAMESPACE);
    const pTag = event.tags.find(t => t[0] === 'p');
    const eTag = event.tags.find(t => t[0] === 'e');
    const expTag = event.tags.find(t => t[0] === 'expiration');

    return {
      id: event.id,
      pubkey: event.pubkey,
      targetPubkey: pTag?.[1] || '',
      type: lTag?.[1] || 'unknown',
      comment: event.content || '',
      createdAt: event.created_at,
      eventRef: eTag?.[1],
      expiration: expTag ? parseInt(expTag[1], 10) : null,
    };
  }

  // ─── Attestation Publishing ─────────────────────────────────

  /**
   * Publish an attestation
   * @param {Uint8Array|string} secretKey - Private key (bytes or nsec)
   * @param {string} targetPubkey - Target pubkey (hex)
   * @param {string} type - Attestation type
   * @param {string} comment - Human-readable comment
   * @param {Object} [opts] - { eventRef, relayHint, relays, expiration }
   * @returns {Promise<{event, results}>}
   */
  async publishAttestation(secretKey, targetPubkey, type, comment, opts = {}) {
    const wot = await loadAiWot();
    if (!wot) throw new Error('ai-wot not available');

    const sk = typeof secretKey === 'string' && secretKey.startsWith('nsec')
      ? nip19.decode(secretKey).data
      : secretKey;

    return wot.publishAttestation(sk, targetPubkey, type, comment, {
      relays: opts.relays || this.config.relays,
      eventRef: opts.eventRef,
      relayHint: opts.relayHint,
      expiration: opts.expiration,
    });
  }

  /**
   * Publish a revocation
   * @param {Uint8Array|string} secretKey
   * @param {string} attestationEventId
   * @param {string} reason
   * @param {Object} [opts]
   * @returns {Promise<{event, results}>}
   */
  async publishRevocation(secretKey, attestationEventId, reason, opts = {}) {
    const wot = await loadAiWot();
    if (!wot) throw new Error('ai-wot not available');

    const sk = typeof secretKey === 'string' && secretKey.startsWith('nsec')
      ? nip19.decode(secretKey).data
      : secretKey;

    return wot.publishRevocation(sk, attestationEventId, reason, {
      relays: opts.relays || this.config.relays,
    });
  }

  // ─── Profile/Summary ────────────────────────────────────────

  /**
   * Get human-readable trust profile summary
   * @param {string} pubkey
   * @returns {Promise<string>}
   */
  async getTrustProfile(pubkey) {
    const wot = await loadAiWot();
    if (!wot) return `Trust profile for ${pubkey.slice(0,16)}... (ai-wot unavailable)`;

    try {
      return await wot.getAttestationSummary(pubkey, { relays: this.config.relays });
    } catch (error) {
      console.error(`Trust profile failed for ${pubkey}:`, error);
      return `Trust profile for ${pubkey.slice(0,16)}... (error: ${error.message})`;
    }
  }

  // ─── Cache Management ────────────────────────────────────────

  clearCache() {
    this._trustCache.clear();
    this._attestationCache.clear();
    this._emit('cacheCleared');
  }

  getCacheStats() {
    return {
      trustEntries: this._trustCache.size,
      attestationEntries: this._attestationCache.size,
    };
  }

  /**
   * Get the(npub) of this WOT client's identity
   * Note: WOTClient doesn't hold keys by default; returns null
   * @returns {string|null}
   */
  getNpub() {
    return null; // WOTClient is read-only unless configured with keys
  }
}

// ─── Skill Discovery with Trust Integration ────────────────────

/**
 * Enhances SkillDiscovery with trust-aware filtering and ranking
 */
export class TrustedSkillDiscovery {
  constructor(skillDiscovery, wotClient) {
    this.skillDiscovery = skillDiscovery;
    this.wotClient = wotClient;
    this.trustThresholdCache = new Map();
  }

  /**
   * Find skills with optional trust filtering
   * @param {FindSkillsQuery} query
   * @param {Object} [trustOpts] - { minTrustScore, requirePositiveTrust, maxNegativeAttestations }
   * @returns {Promise<SkillWithTrust[]>}
   */
  async findSkillsWithTrust(query, trustOpts = {}) {
    const skills = this.skillDiscovery.findSkills(query);

    if (skills.length === 0) return [];

    // Get unique pubkeys
    const pubkeys = [...new Set(skills.map(s => s.pubkey))];

    // Fetch trust scores in parallel
    const trustScores = await this.wotClient.getTrustScores(pubkeys);

    // Apply trust filtering
    let results = skills.map(skill => ({
      ...skill,
      trust: trustScores.get(skill.pubkey) || this.wotClient._emptyTrustScore(),
    }));

    if (trustOpts.minTrustScore !== undefined) {
      results = results.filter(s => s.trust.display >= trustOpts.minTrustScore);
    }

    if (trustOpts.requirePositiveTrust) {
      results = results.filter(s => s.trust.positiveCount > s.trust.negativeCount);
    }

    if (trustOpts.maxNegativeAttestations !== undefined) {
      results = results.filter(s => s.trust.negativeCount <= trustOpts.maxNegativeAttestations);
    }

    if (trustOpts.requireDiversity !== undefined && trustOpts.requireDiversity) {
      results = results.filter(s => s.trust.diversity.diversity >= 0.3);
    }

    // Sort by trust score (descending) then by recency
    results.sort((a, b) => {
      const trustDiff = b.trust.display - a.trust.display;
      if (Math.abs(trustDiff) > 5) return trustDiff;
      return b.createdAt - a.createdAt;
    });

    return results;
  }

  /**
   * Get trust score for a specific skill's provider
   * @param {string} pubkey
   * @returns {Promise<TrustScore>}
   */
  async getSkillProviderTrust(pubkey) {
    return this.wotClient.getTrustScore(pubkey);
  }

  /**
   * Get all skills with trust scores
   * @param {Object} [trustOpts]
   * @returns {Promise<SkillWithTrust[]>}
   */
  async getAllSkillsWithTrust(trustOpts = {}) {
    return this.findSkillsWithTrust({}, trustOpts);
  }
}

// ─── Skill Advertiser with WOT Attestation ────────────────────

/**
 * Extends SkillAdvertiser to automatically publish attestations for completed jobs
 */
export class WOTSkillAdvertiser {
  constructor(skillAdvertiser, wotClient, config = {}) {
    this.skillAdvertiser = skillAdvertiser;
    this.wotClient = wotClient;
    this.config = {
      autoAttestOnJobComplete: config.autoAttestOnJobComplete ?? true,
      defaultAttestationType: config.defaultAttestationType || AttestationType.SERVICE_QUALITY,
      attestationRelays: config.attestationRelays || DEFAULT_RELAYS,
    };
  }

  /**
   * Attest to a service provider after job completion
   * @param {Object} params - { targetPubkey, jobId, rating, comment }
   * @returns {Promise<{event, results}>}
   */
  async attestServiceQuality({ targetPubkey, jobId, rating, comment }) {
    const type = AttestationType.SERVICE_QUALITY;
    const attestationComment = comment || `Job ${jobId} completed${rating ? ` - rating: ${rating}/5` : ''}`;

    return this.wotClient.publishAttestation(
      this.skillAdvertiser.privateKey,
      targetPubkey,
      type,
      attestationComment,
      { eventRef: jobId, relays: this.config.attestationRelays }
    );
  }

  /**
   * Report a dispute
   * @param {Object} params - { targetPubkey, jobId, reason }
   * @returns {Promise<{event, results}>}
   */
  async reportDispute({ targetPubkey, jobId, reason }) {
    return this.wotClient.publishAttestation(
      this.skillAdvertiser.privateKey,
      targetPubkey,
      AttestationType.DISPUTE,
      reason,
      { eventRef: jobId, relays: this.config.attestationRelays }
    );
  }

  /**
   * Issue a warning
   * @param {Object} params - { targetPubkey, jobId, reason }
   * @returns {Promise<{event, results}>}
   */
  async issueWarning({ targetPubkey, jobId, reason }) {
    return this.wotClient.publishAttestation(
      this.skillAdvertiser.privateKey,
      targetPubkey,
      AttestationType.WARNING,
      reason,
      { eventRef: jobId, relays: this.config.attestationRelays }
    );
  }

  /**
   * Confirm identity continuity
   * @param {string} targetPubkey
   * @param {string} comment
   * @returns {Promise<{event, results}>}
   */
  async confirmIdentity({ targetPubkey, comment }) {
    return this.wotClient.publishAttestation(
      this.skillAdvertiser.privateKey,
      targetPubkey,
      AttestationType.IDENTITY_CONTINUITY,
      comment || 'Identity continuity confirmed',
      { relays: this.config.attestationRelays }
    );
  }

  on(event, listener) {
    return this.skillAdvertiser.on(event, listener);
  }

  getNpub() {
    return this.skillAdvertiser.getNpub();
  }

  getAgentId() {
    return this.skillAdvertiser.getAgentId();
  }

  getIsRunning() {
    return this.skillAdvertiser.getIsRunning();
  }

  getConnectedRelays() {
    return this.skillAdvertiser.getConnectedRelays();
  }
}

// ─── Factory Functions ────────────────────────────────────────

/**
 * Create a WOTClient instance
 * @param {WOTConfig} config
 * @returns {WOTClient}
 */
export function createWOTClient(config) {
  return new WOTClient(config);
}

/**
 * Create a TrustedSkillDiscovery wrapper
 * @param {SkillDiscovery} skillDiscovery
 * @param {WOTClient} wotClient
 * @returns {TrustedSkillDiscovery}
 */
export function createTrustedSkillDiscovery(skillDiscovery, wotClient) {
  return new TrustedSkillDiscovery(skillDiscovery, wotClient);
}

/**
 * Create a WOTSkillAdvertiser wrapper
 * @param {SkillAdvertiser} skillAdvertiser
 * @param {WOTClient} wotClient
 * @param {Object} config
 * @returns {WOTSkillAdvertiser}
 */
export function createWOTSkillAdvertiser(skillAdvertiser, wotClient, config) {
  return new WOTSkillAdvertiser(skillAdvertiser, wotClient, config);
}

// ─── Utility: Npub <-> Hex ──────────────────────────────────

export function npubToHex(npub) {
  if (!npub || typeof npub !== 'string' || !npub.startsWith('npub1')) return null;
  try {
    return nip19.decode(npub).data.toString('hex');
  } catch {
    return null;
  }
}

export function hexToNpub(hex) {
  if (!hex || hex.length !== 64) return null;
  try {
    return nip19.npubEncode(Buffer.from(hex, 'hex'));
  } catch {
    return null;
  }
}

export function nsecToHex(nsec) {
  if (!nsec || typeof nsec !== 'string' || !nsec.startsWith('nsec1')) return null;
  try {
    return nip19.decode(nsec).data.toString('hex');
  } catch {
    return null;
  }
}

// ─── Default Exports ────────────────────────────────────────

export const WOT = {
  WOTClient,
  TrustedSkillDiscovery,
  WOTSkillAdvertiser,
  createWOTClient,
  createTrustedSkillDiscovery,
  createWOTSkillAdvertiser,
  npubToHex,
  hexToNpub,
  nsecToHex,
  AttestationType,
  POSITIVE_TYPES,
  NEGATIVE_TYPES,
  TYPE_MULTIPLIERS,
  DEFAULT_RELAYS,
};

export default WOT;