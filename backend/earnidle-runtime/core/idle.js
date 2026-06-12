// idle.js — QVAC EarnIdle browser SDK with Nostr skill advertisement
// Drop this into your app, call idle.start(), and agents can earn while advertising skills on Nostr.
//
// Entrypoints:
//  idle.start(config)              — start enabled resources
//  idle.stop()                     — stop all
//  idle.status()                   — current state
//  idle.contributions()            — current-user contribution metadata
//  idle.advertiseSkills(config)    — start advertising skills on Nostr
//  idle.discoverSkills(config)     — discover skills from other agents on Nostr
//  idle.createJob(config)          — create and publish a job posting to Nostr
//  idle.openJobDashboard(config)   — open job dashboard for managing posted jobs
//  idle.initWOT(config)            — initialize Web of Trust client
//  idle.findTrustedSkills(query, trustOpts) — trust-scored skill discovery
//  idle.getAgentTrust(pubkey)      — get trust score for an agent
//  idle.getAgentTrustProfile(pubkey) — human-readable trust profile
//  idle.attestServiceQuality(params) — publish service-quality attestation
//  idle.reportDispute(params)      — publish dispute attestation
//  idle.issueWarning(params)       — publish warning attestation
//  idle.confirmIdentity(params)    — confirm identity continuity

export const IDLE_KEY = Symbol.for('qvac.earnidle');

function existingRoot() {
  return typeof globalThis !== 'undefined' && globalThis[IDLE_KEY];
}

if (!existingRoot()) {
  const state = {
    resources: [],
    running: false,
    optInStatus: new Map(), // contributionId -> { wallet, nodeId, tier, acceptedAt, status }
    skillAdvertiser: null,
    skillDiscovery: null,
    trustedSkillDiscovery: null,
    wotClient: null,
    jobCreator: null,
    zapPayment: null,
    jobDashboard: null,
  };

  const api = {
    /**
     * Start EarnIdle resources
     * @param {Object} config
     * @param {string[]} [config.resources=['inference']} - Resources to start ('inference', 'vm', 'qvac')
     * @param {string} config.wallet - Wallet address
     * @param {string} config.nodeId - Node identifier
     * @param {string} [config.tier='high'] - Contribution tier
     */
    async start({ resources = ['inference'], wallet, nodeId, tier = 'high' } = {}) {
      if (state.running) return;
      state.running = true;
      state.resources = resources;

      for (const resource of resources) {
        const worker = new Worker(
          new URL(`./resources/${resource}.worker.js`, import.meta.url),
          { type: 'module' }
        );
        const contributionId = `${resource}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        state.optInStatus.set(contributionId, {
          wallet,
          nodeId,
          tier,
          acceptedAt: new Date().toISOString(),
          status: 'starting',
          resource,
        });
        worker.onmessage = (event) => {
          const current = state.optInStatus.get(contributionId);
          if (!current) return;
          const next = { ...current, lastEvent: event.data, status: event.data.status || current.status };
          if (event.data.payout) next.lastPayout = event.data.payout;
          state.optInStatus.set(contributionId, next);
          idle.emit('contribution', { contributionId, ...next });
        };
        worker.onerror = (error) => {
          const current = state.optInStatus.get(contributionId);
          if (!current) return;
          state.optInStatus.set(contributionId, { ...current, status: 'error', error: error.message });
          idle.emit('contribution', { contributionId, ...state.optInStatus.get(contributionId) });
        };
        worker.postMessage({ type: 'start', data: { wallet, nodeId, tier } });
        idle.emit('started', { contributionId, resource });
      }
    },

    /**
     * Stop all resources
     */
    stop() {
      state.running = false;
      if (state.skillAdvertiser) {
        state.skillAdvertiser.stop();
        state.skillAdvertiser = null;
      }
      if (state.skillDiscovery) {
        state.skillDiscovery.stop();
        state.skillDiscovery = null;
      }
      if (state.trustedSkillDiscovery) {
        state.trustedSkillDiscovery = null;
      }
      if (state.wotClient) {
        state.wotClient.disconnect();
        state.wotClient = null;
      }
      if (state.jobCreator) {
        if (state.jobCreator._eventUnsubs) {
          state.jobCreator._eventUnsubs.forEach(unsub => unsub());
        }
        state.jobCreator = null;
      }
      if (state.zapPayment) {
        if (state.zapPayment._eventUnsubs) {
          state.zapPayment._eventUnsubs.forEach(unsub => unsub());
        }
        state.zapPayment = null;
      }
      if (state.jobDashboard) {
        state.jobDashboard = null;
      }
    },

    /**
     * Get current status
     * @returns {Object}
     */
    status() {
      return {
        running: state.running,
        resources: state.resources,
        contributions: Object.fromEntries(state.optInStatus),
        skillAdvertiser: state.skillAdvertiser ? {
          running: state.skillAdvertiser.getIsRunning(),
          npub: state.skillAdvertiser.getNpub(),
          agentId: state.skillAdvertiser.getAgentId(),
          relays: state.skillAdvertiser.getConnectedRelays(),
        } : null,
        skillDiscovery: state.skillDiscovery ? {
          running: state.skillDiscovery.getConnectionState() === 'connected',
          indexSize: state.skillDiscovery.getIndexSize(),
          relays: state.skillDiscovery.getConnectedRelays(),
        } : null,
        trustedSkillDiscovery: state.trustedSkillDiscovery ? {
          available: true,
          indexSize: state.skillDiscovery?.getIndexSize() || 0,
          wotConnected: state.wotClient?.isConnected || false,
          relays: state.wotClient?.getConnectedRelays() || [],
          cacheStats: state.wotClient?.getCacheStats() || { trustEntries: 0, attestationEntries: 0 },
        } : null,
        jobCreator: state.jobCreator ? {
          available: true,
          relays: state.jobCreator.config.relays,
        } : null,
        zapPayment: state.zapPayment ? {
          available: true,
          relays: state.zapPayment.config.relays,
        } : null,
        jobDashboard: state.jobDashboard ? {
          available: true,
        } : null,
      };
    },

    /**
     * Get contribution metadata
     * @returns {Object}
     */
    contributions() {
      return Object.fromEntries(state.optInStatus);
    },

    /**
     * Start advertising agent skills on Nostr
     * @param {Object} config
     * @param {string[]} config.relays - Nostr relay URLs
     * @param {string} config.agentId - Unique agent identifier
     * @param {string} config.agentName - Agent name
     * @param {string} [config.agentDescription] - Agent description
     * @param {Object[]} config.skills - Array of skill definitions
     * @param {number} [config.refreshInterval=300000] - Refresh interval (ms)
     * @param {string} [config.privateKey] - Optional private key (nsec)
     * @returns {Promise<Object>} Advertiser instance info
     */
    async advertiseSkills(config) {
      if (!config.relays || !config.agentId || !config.agentName || !config.skills) {
        throw new Error('advertiseSkills requires relays, agentId, agentName, and skills');
      }

      // Dynamic import to avoid loading Nostr modules until needed
      const { SkillAdvertiser, NostrClient } = await import('../nostr/index.js');

      // Create skill registry
      const skillRegistry = {
        getSkills: () => config.skills,
        onChange: config.onSkillsChange ? (callback) => {
          const unsubscribe = config.onSkillsChange(callback);
          return unsubscribe || (() => {});
        } : undefined,
      };

      // Create Nostr client
      const client = new NostrClient({
        relays: config.relays,
        reconnectInterval: 3000,
        maxReconnectAttempts: 5,
      });

      // Create and start advertiser
      const advertiser = new SkillAdvertiser({
        relays: config.relays,
        agentId: config.agentId,
        agentName: config.agentName,
        agentDescription: config.agentDescription,
        refreshInterval: config.refreshInterval,
        privateKey: config.privateKey,
        autoGenerateKeys: true,
      }, skillRegistry, client);

      state.skillAdvertiser = advertiser;

      // Forward events
      advertiser.on('started', () => idle.emit('skillAdvertiserStarted', { npub: advertiser.getNpub() }));
      advertiser.on('published', (skillTags) => idle.emit('skillPublished', skillTags));
      advertiser.on('error', (error) => idle.emit('skillAdvertiserError', error));
      advertiser.on('keyGenerated', (keys) => idle.emit('skillKeysGenerated', keys));
      advertiser.on('keyLoaded', (npub) => idle.emit('skillKeysLoaded', npub));

      await advertiser.start();
      return {
        npub: advertiser.getNpub(),
        agentId: advertiser.getAgentId(),
        relays: advertiser.getConnectedRelays(),
      };
    },

    /**
     * Stop skill advertisement
     */
    async stopAdvertising() {
      if (state.skillAdvertiser) {
        await state.skillAdvertiser.stop();
        state.skillAdvertiser = null;
      }
    },

    /**
     * Start discovering skills on Nostr
     * @param {Object} config
     * @param {string[]} config.relays - Nostr relay URLs
     * @param {Object} [config.initialFilter] - Optional additional filters
     * @returns {Promise<Object>} Discovery instance
     */
    async discoverSkills(config) {
      if (!config.relays) {
        throw new Error('discoverSkills requires relays');
      }

      const { SkillDiscovery } = await import('./nostr/index.js');

      const discovery = new SkillDiscovery({
        relays: config.relays,
        initialFilter: config.initialFilter,
      });

      state.skillDiscovery = discovery;

      // Forward events
      discovery.on('skillDiscovered', (skill) => idle.emit('skillDiscovered', skill));
      discovery.on('skillUpdated', (skill) => idle.emit('skillUpdated', skill));
      discovery.on('skillRetracted', (dTag, pubkey) => idle.emit('skillRetracted', { dTag, pubkey }));
      discovery.on('error', (error) => idle.emit('skillDiscoveryError', error));

      await discovery.start();
      return {
        indexSize: discovery.getIndexSize(),
        relays: discovery.getConnectedRelays(),
      };
    },

    /**
     * Find skills matching criteria
     * @param {Object} query - Search query
     * @returns {Object[]} Matching skills
     */
    findSkills(query) {
      if (!state.skillDiscovery) {
        return [];
      }
      return state.skillDiscovery.findSkills(query);
    },

    /**
     * Publish a skill directly using SkillDiscovery
     * @param {Object} params
     * @param {string} params.privateKey - Private key (nsec)
     * @param {string} params.dTag - Skill identifier
     * @param {Object} params.metadata - Skill metadata
     * @returns {Promise<string[]>} Relay URLs
     */
    async publishSkill(params) {
      if (!state.skillDiscovery) {
        throw new Error('Skill discovery not started. Call discoverSkills first.');
      }
      return state.skillDiscovery.publishSkill(params.privateKey, params.dTag, params.metadata);
    },

    /**
     * Retract a skill
     * @param {Object} params
     * @param {string} params.privateKey - Private key (nsec)
     * @param {string} params.dTag - Skill identifier
     * @returns {Promise<string[]>} Relay URLs
     */
    async retractSkill(params) {
      if (!state.skillDiscovery) {
        throw new Error('Skill discovery not started. Call discoverSkills first.');
      }
      return state.skillDiscovery.retractSkill(params.privateKey, params.dTag);
    },

    /**
     * Initialize Web of Trust (WOT) client for trust-scored skill discovery
     * @param {Object} config
     * @param {string[]} [config.relays] - Nostr relay URLs
     * @param {number} [config.halfLifeDays=90] - Temporal decay half-life
     * @param {number} [config.maxDepth=2] - Recursive trust depth
     * @returns {Promise<Object>} WOT client instance info
     */
    async initWOT(config = {}) {
      const { createWOTClient, createTrustedSkillDiscovery } = await import('../nostr/index.js');

      const wotClient = createWOTClient({
        relays: config.relays || [
          'wss://relay.damus.io',
          'wss://nos.lol',
          'wss://relay.primal.net',
          'wss://relay.snort.social',
        ],
        halfLifeDays: config.halfLifeDays,
        maxDepth: config.maxDepth,
      });

      state.wotClient = wotClient;

      // If skill discovery is running, wrap it with trust-aware discovery
      if (state.skillDiscovery) {
        state.trustedSkillDiscovery = createTrustedSkillDiscovery(state.skillDiscovery, wotClient);
      }

      // Forward events
      wotClient.on('stateChange', (state) => idle.emit('wotStateChange', { state, relays: wotClient.getConnectedRelays() }));

      await wotClient.connect();
      return {
        npub: wotClient.getNpub ? wotClient.getNpub() : null,
        relays: wotClient.getConnectedRelays(),
        cacheStats: wotClient.getCacheStats(),
      };
    },

    /**
     * Find skills with trust-based filtering and ranking
     * @param {Object} query - Search query (same as findSkills)
     * @param {Object} [trustOpts] - Trust filter options
     * @param {number} [trustOpts.minTrustScore] - Minimum 0-100 trust score
     * @param {boolean} [trustOpts.requirePositiveTrust] - Require more positive than negative attestations
     * @param {number} [trustOpts.maxNegativeAttestations] - Maximum negative attestations
     * @param {boolean} [trustOpts.requireDiversity] - Require diversity score >= 0.3
     * @returns {Promise<Object[]>} Skills with trust scores, sorted by trust
     */
    async findTrustedSkills(query = {}, trustOpts = {}) {
      if (!state.trustedSkillDiscovery) {
        if (!state.skillDiscovery) {
          throw new Error('Skill discovery not started. Call discoverSkills first.');
        }
        if (!state.wotClient) {
          await idle.initWOT({ relays: state.skillDiscovery.config.relays });
        }
        return state.trustedSkillDiscovery.findSkillsWithTrust(query, trustOpts);
      }
      return state.trustedSkillDiscovery.findSkillsWithTrust(query, trustOpts);
    },

    /**
     * Get trust score for a specific agent/provider
     * @param {string} pubkey - Agent pubkey (hex or npub)
     * @returns {Promise<Object>} Trust score with breakdown
     */
    async getAgentTrust(pubkey) {
      if (!state.wotClient) {
        throw new Error('WOT not initialized. Call initWOT first.');
      }
      // Convert npub to hex if needed
      const hexPubkey = pubkey.startsWith('npub1') ? pubkey.slice(5) : pubkey;
      return state.wotClient.getTrustScore(hexPubkey);
    },

    /**
     * Get human-readable trust profile for an agent
     * @param {string} pubkey - Agent pubkey (hex or npub)
     * @returns {Promise<string>} Formatted trust profile
     */
    async getAgentTrustProfile(pubkey) {
      if (!state.wotClient) {
        throw new Error('WOT not initialized. Call initWOT first.');
      }
      const hexPubkey = pubkey.startsWith('npub1') ? pubkey.slice(5) : pubkey;
      return state.wotClient.getTrustProfile(hexPubkey);
    },

    /**
     * Attest to a service provider (service-quality attestation)
     * Requires active skill advertiser (for private key) and WOT client
     * @param {Object} params
     * @param {string} params.targetPubkey - Provider pubkey (hex or npub)
     * @param {string} params.jobId - Job/event ID reference
     * @param {number} [params.rating] - Rating 1-5
     * @param {string} [params.comment] - Optional comment
     * @returns {Promise<Object>} Attestation event and relay results
     */
    async attestServiceQuality(params) {
      if (!state.skillAdvertiser || !state.wotClient) {
        throw new Error('Both skill advertiser and WOT required. Call advertiseSkills and initWOT first.');
      }

      const { createWOTSkillAdvertiser } = await import('../nostr/index.js');
      const wotAdvertiser = createWOTSkillAdvertiser(state.skillAdvertiser, state.wotClient);

      return wotAdvertiser.attestServiceQuality({
        targetPubkey: params.targetPubkey.startsWith('npub1') ? params.targetPubkey.slice(5) : params.targetPubkey,
        jobId: params.jobId,
        rating: params.rating,
        comment: params.comment,
      });
    },

    /**
     * Report a dispute about a service provider
     * @param {Object} params
     * @param {string} params.targetPubkey
     * @param {string} params.jobId
     * @param {string} params.reason
     * @returns {Promise<Object>}
     */
    async reportDispute(params) {
      if (!state.skillAdvertiser || !state.wotClient) {
        throw new Error('Both skill advertiser and WOT required.');
      }
      const { createWOTSkillAdvertiser } = await import('../nostr/index.js');
      const wotAdvertiser = createWOTSkillAdvertiser(state.skillAdvertiser, state.wotClient);
      return wotAdvertiser.reportDispute({
        targetPubkey: params.targetPubkey.startsWith('npub1') ? params.targetPubkey.slice(5) : params.targetPubkey,
        jobId: params.jobId,
        reason: params.reason,
      });
    },

    /**
     * Issue a warning about a service provider
     * @param {Object} params
     * @param {string} params.targetPubkey
     * @param {string} params.jobId
     * @param {string} params.reason
     * @returns {Promise<Object>}
     */
    async issueWarning(params) {
      if (!state.skillAdvertiser || !state.wotClient) {
        throw new Error('Both skill advertiser and WOT required.');
      }
      const { createWOTSkillAdvertiser } = await import('../nostr/index.js');
      const wotAdvertiser = createWOTSkillAdvertiser(state.skillAdvertiser, state.wotClient);
      return wotAdvertiser.issueWarning({
        targetPubkey: params.targetPubkey.startsWith('npub1') ? params.targetPubkey.slice(5) : params.targetPubkey,
        jobId: params.jobId,
        reason: params.reason,
      });
    },

    /**
     * Confirm identity continuity of an agent
     * @param {Object} params
     * @param {string} params.targetPubkey
     * @param {string} [params.comment]
     * @returns {Promise<Object>}
     */
    async confirmIdentity(params) {
      if (!state.skillAdvertiser || !state.wotClient) {
        throw new Error('Both skill advertiser and WOT required.');
      }
      const { createWOTSkillAdvertiser } = await import('../nostr/index.js');
      const wotAdvertiser = createWOTSkillAdvertiser(state.skillAdvertiser, state.wotClient);
      return wotAdvertiser.confirmIdentity({
        targetPubkey: params.targetPubkey.startsWith('npub1') ? params.targetPubkey.slice(5) : params.targetPubkey,
        comment: params.comment,
      });
    },

    /**
     * Create and publish a job posting to Nostr (NIP-99 kind 30402)
     * @param {Object} config
     * @param {Object} config.jobData - Job metadata object
     * @param {string[]} [config.relays] - Nostr relay URLs (uses defaults if not provided)
     * @returns {Promise<Object>} Result with eventId, publishedRelays, and nostrBandUrl
     */
    async createJob(config) {
      if (!config.jobData) {
        throw new Error('createJob requires jobData');
      }

      const { JobCreator, createJobCreator } = await import('../nostr/index.js');

      // Create or reuse job creator
      if (!state.jobCreator) {
        state.jobCreator = createJobCreator({
          relays: config.relays || [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.nostr.band',
            'wss://relay.primal.net',
          ],
        });
      }

      // If relays changed, recreate
      if (config.relays && state.jobCreator.config.relays.join(',') !== config.relays.join(',')) {
        state.jobCreator = createJobCreator({ relays: config.relays });
      }

      // Forward events
      const unsubs = [];
      unsubs.push(state.jobCreator.on('jobCreated', (data) => idle.emit('jobCreated', data)));

      const result = await state.jobCreator.createJob(config.jobData);

      // Store unsubscribe functions
      state.jobCreator._eventUnsubs = unsubs;

      return result;
    },

    /**
     * Initialize Job Dashboard for managing posted jobs
     * @param {Object} config
     * @param {string[]} [config.relays] - Nostr relay URLs
     * @returns {Promise<Object>} Dashboard instance info
     */
    async openJobDashboard(config = {}) {
      const { JobDashboard, createJobDashboard, DEFAULT_DASHBOARD_RELAYS } = await import('../nostr/index.js');

      if (!state.jobDashboard) {
        state.jobDashboard = createJobDashboard({
          relays: config.relays || DEFAULT_DASHBOARD_RELAYS,
        });
      }

      // Forward events
      const unsubs = [];
      unsubs.push(state.jobDashboard.on('jobsLoaded', (jobs) => idle.emit('jobsLoaded', jobs)));
      unsubs.push(state.jobDashboard.on('statusUpdated', (data) => idle.emit('jobStatusUpdated', data)));
      unsubs.push(state.jobDashboard.on('loading', (isLoading) => idle.emit('dashboardLoading', isLoading)));

      state.jobDashboard._eventUnsubs = unsubs;

      return {
        available: true,
        relays: config.relays || DEFAULT_DASHBOARD_RELAYS,
      };
    },

    /**
     * Get or initialize the JobDashboard instance
     * @param {string[]} [relays] - Nostr relay URLs
     * @returns {Promise<JobDashboard>}
     */
    async getJobDashboard(relays) {
      if (!state.jobDashboard) {
        await idle.openJobDashboard({ relays });
      }
      return state.jobDashboard;
    },

    /**
     * Initialize Zap payment for Lightning Network payments via NIP-57
     * @param {Object} config
     * @param {string[]} [config.relays] - Nostr relay URLs
     * @returns {Promise<Object>} Zap payment instance info
     */
    async initZapPayment(config = {}) {
      const { ZapPayment, createZapPayment, DEFAULT_ZAP_RELAYS } = await import('./nostr/index.js');

      if (!state.zapPayment) {
        state.zapPayment = createZapPayment({
          relays: config.relays || DEFAULT_ZAP_RELAYS,
        });
      }

      // Forward events
      const unsubs = [];
      unsubs.push(state.zapPayment.on('zapSent', (data) => idle.emit('zapSent', data)));
      unsubs.push(state.zapPayment.on('zapReceived', (receipt) => idle.emit('zapReceived', receipt)));
      unsubs.push(state.zapPayment.on('zapReceipt', (receipt) => idle.emit('zapReceipt', receipt)));
      unsubs.push(state.zapPayment.on('receiptError', (error, url) => idle.emit('zapReceiptError', { error, url })));

      state.zapPayment._eventUnsubs = unsubs;

      return {
        available: true,
        relays: config.relays || DEFAULT_ZAP_RELAYS,
      };
    },

    /**
     * Pay for a completed job using Zap (NIP-57 Lightning payment)
     * @param {Object} config
     * @param {Object} config.job - Job entry with metadata and event info
     * @param {string} config.lightningAddress - Agent's lightning address
     * @param {number} [config.amountSats] - Amount in satoshis (uses job pricing if not provided)
     * @param {string} [config.description] - Payment description
     * @returns {Promise<Object>} Result with receipt
     */
    async payForJob(config) {
      if (!config.job || !config.lightningAddress) {
        throw new Error('payForJob requires job and lightningAddress');
      }

      if (!state.zapPayment) {
        await idle.initZapPayment(config);
      }

      const job = config.job;
      const amountSats = config.amountSats || job.metadata?.pricing?.amount || job.metadata?.pricing?.minAmount || 0;
      const recipientPubkey = job.pubkey || job.metadata?.employer;

      if (!recipientPubkey) {
        throw new Error('Cannot determine recipient pubkey for job');
      }

      const description = config.description || `Payment for job ${job.dTag} (event: ${job.eventId?.slice(0, 16)}...)`;

      return state.zapPayment.payForJob({
        jobId: job.dTag,
        jobEventId: job.eventId,
        recipientPubkey,
        recipientLightningAddress: config.lightningAddress,
        amountSats,
        description,
      });
    },

    /**
     * Get or initialize the ZapPayment instance
     * @param {string[]} [relays] - Nostr relay URLs
     * @returns {Promise<ZapPayment>}
     */
    async getZapPayment(relays) {
      if (!state.zapPayment) {
        await idle.initZapPayment({ relays });
      }
      return state.zapPayment;
    },

    /**
     * Get or initialize the JobCreator for NIP-07 direct usage
     * @param {string[]} [relays] - Nostr relay URLs
     * @returns {Promise<JobCreator>}
     */
    async getJobCreator(relays) {
      if (!state.jobCreator) {
        const { createJobCreator } = await import('./nostr/index.js');
        state.jobCreator = createJobCreator({
          relays: relays || [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.nostr.band',
            'wss://relay.primal.net',
          ],
        });
      }
      return state.jobCreator;
    },
  };

  const listeners = new Set();
  const idle = {
    ...api,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(name, payload) { for (const fn of listeners) fn(name, payload); },
  };

  globalThis[IDLE_KEY] = idle;
  Object.defineProperty(globalThis, 'idle', { value: idle, configurable: true, writable: true, enumerable: true });
}

export default globalThis[IDLE_KEY];