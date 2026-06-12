// JobDashboard — Dashboard for querying and managing user's posted jobs
// Combines Nostr relay queries (kind 30402) with local JobStateDB for status tracking

import { Relay } from 'nostr-tools/relay';
import { nip19 } from 'nostr-tools';
import { JOB_EVENT_KIND, JOB_D_TAG_PREFIX, parseJobEvent } from './job-types.js';
import { getJobs as getLocalJobs, getJobState, updateJobStatus } from '../core/job-state-db.js';

// Replaceable event kind for job status updates (NIP-33 parameterized replaceable events)
export const JOB_STATUS_KIND = 30078;

// Default relays for queries
export const DEFAULT_DASHBOARD_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
];

/**
 * Job status values
 * @readonly
 * @enum {string}
 */
export const JobStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
};

/**
 * Dashboard job entry combining Nostr event data with local state
 * @typedef {Object} DashboardJob
 * @property {string} jobId - Job d-tag
 * @property {string} jobEventId - Nostr event ID of the job posting
 * @property {string} title - Job title
 * @property {string} description - Job description
 * @property {string} category - Job category
 * @property {Object} pricing - Pricing object
 * @property {string[]} paymentMethods - Payment methods from pricing
 * @property {string} employerPubkey - Employer's public key (hex)
 * @property {string} employerNpub - Employer's npub
 * @property {number} createdAt - Job creation timestamp (ms)
 * @property {string} status - Current status
 * @property {string} relay - Relay where found
 * @property {Object} localState - Local JobStateDB record if exists
 */

/**
 * Create a job status update event (kind 30078)
 * @param {Object} params
 * @param {string} params.jobId - Job d-tag
 * @param {string} params.jobEventId - Job event ID
 * @param {string} params.newStatus - New status value
 * @param {string} params.pubkey - Publisher's public key (hex)
 * @param {string} [params.reason] - Reason for status change
 * @returns {Object} Unsigned Nostr event
 */
export function createJobStatusEvent(params) {
  const { jobId, jobEventId, newStatus, pubkey, reason } = params;
  
  const tags = [
    ['d', `${JOB_D_TAG_PREFIX}${jobId}`],
    ['job', jobId],
    ['e', jobEventId, '', 'job'],
    ['status', newStatus],
    ['updated_at', Math.floor(Date.now() / 1000).toString()],
  ];
  
  if (reason) {
    tags.push(['reason', reason]);
  }
  
  return {
    kind: JOB_STATUS_KIND,
    content: JSON.stringify({ jobId, jobEventId, status: newStatus, reason, updatedAt: Date.now() }),
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Parse a job status update event
 * @param {Object} event - Nostr event
 * @returns {Object|null} Parsed status update or null
 */
export function parseJobStatusEvent(event) {
  if (event.kind !== JOB_STATUS_KIND) return null;
  
  const getTag = (name) => {
    const tag = event.tags.find(([k]) => k === name);
    return tag ? tag[1] : undefined;
  };
  
  const jobId = getTag('job');
  const jobEventId = getTag('e');
  const status = getTag('status');
  const updatedAt = getTag('updated_at');
  const reason = getTag('reason');
  
  if (!jobId || !status) return null;
  
  return {
    jobId,
    jobEventId,
    status,
    updatedAt: updatedAt ? parseInt(updatedAt) * 1000 : Date.now(),
    reason,
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at * 1000,
  };
}

/**
 * JobDashboard class
 */
export class JobDashboard {
  constructor(config = {}) {
    this.config = {
      relays: config.relays || DEFAULT_DASHBOARD_RELAYS,
      queryTimeout: config.queryTimeout || 10000,
      signer: config.signer || null,
      userPubkey: config.userPubkey || null,
    };
    
    this.listeners = new Map();
    this.isLoading = false;
  }
  
  /**
   * Set the NIP-07 signer for status updates
   * @param {Object} signer - NIP-07 signer
   */
  setSigner(signer) {
    this.config.signer = signer;
  }
  
  /**
   * Set the user's public key
   * @param {string} pubkey - Hex public key
   */
  setUserPubkey(pubkey) {
    this.config.userPubkey = pubkey;
  }
  
  /**
   * Check if NIP-07 signer is available
   * @returns {Promise<boolean>}
   */
  async checkSigner() {
    if (this.config.signer) return true;
    
    if (typeof window !== 'undefined') {
      if (window.nostr) {
        this.config.signer = window.nostr;
        const pubkey = await window.nostr.getPublicKey();
        this.config.userPubkey = pubkey;
        return true;
      }
      if (window.nos2x) {
        this.config.signer = window.nos2x;
        const pubkey = await window.nos2x.getPublicKey();
        this.config.userPubkey = pubkey;
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get user's npub
   * @returns {Promise<string|null>}
   */
  async getUserNpub() {
    if (this.config.userPubkey) {
      return nip19.npubEncode(this.config.userPubkey);
    }
    if (await this.checkSigner()) {
      return nip19.npubEncode(this.config.userPubkey);
    }
    return null;
  }
  
  /**
   * Query relays for jobs posted by the user
   * @param {string} pubkey - User's hex public key
   * @returns {Promise<DashboardJob[]>}
   */
  async queryJobsFromRelays(pubkey) {
    const allJobs = new Map();
    
    const queryPromises = this.config.relays.map(async (url) => {
      try {
        const relay = await Relay.connect(url, { timeout: this.config.queryTimeout });
        
        const sub = relay.subscribe(
          [{ kinds: [JOB_EVENT_KIND], authors: [pubkey], limit: 100 }],
          {
            onevent: (event) => {
              const jobEntry = parseJobEvent(event, url);
              if (jobEntry) {
                const key = jobEntry.dTag;
                if (!allJobs.has(key) || event.created_at > allJobs.get(key).createdAt / 1000) {
                  allJobs.set(key, {
                    jobId: jobEntry.dTag,
                    jobEventId: event.id,
                    title: jobEntry.metadata.title,
                    description: jobEntry.metadata.description,
                    category: jobEntry.metadata.category,
                    pricing: jobEntry.metadata.pricing,
                    paymentMethods: jobEntry.metadata.pricing?.paymentMethods || [],
                    employerPubkey: event.pubkey,
                    employerNpub: nip19.npubEncode(event.pubkey),
                    createdAt: event.created_at * 1000,
                    relay: url,
                    event: event,
                  });
                }
              }
            },
            oneose: () => {},
            onclose: () => {},
          }
        );
        
        // Wait for events or timeout
        await new Promise((resolve) => {
          setTimeout(() => {
            sub.close();
            relay.close();
            resolve();
          }, this.config.queryTimeout);
        });
      } catch (err) {
        console.warn(`Failed to query jobs from ${url}:`, err.message);
      }
    });
    
    await Promise.allSettled(queryPromises);
    
    // Convert to array and sort by created date descending
    return Array.from(allJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  
  /**
   * Load dashboard jobs - combines relay data with local state
   * @returns {Promise<DashboardJob[]>}
   */
  async loadJobs() {
    this.isLoading = true;
    this._emit('loading', true);
    
    try {
      // Get user pubkey if not set
      if (!this.config.userPubkey && !(await this.checkSigner())) {
        throw new Error('No user pubkey available. Please connect a Nostr signer (Alby, nos2x, etc.)');
      }
      
      // Query relays for job postings
      const relayJobs = await this.queryJobsFromRelays(this.config.userPubkey);
      this._emit('relayJobsLoaded', relayJobs.length);
      
      // Get local job states
      const localJobs = await getLocalJobs({ employerPubkey: this.config.userPubkey });
      
      // Merge relay jobs with local state
      const mergedJobs = relayJobs.map((job) => {
        const localState = localJobs.find(
          (lj) => lj.jobId === job.jobId || lj.jobEventId === job.jobEventId
        );
        
        // Determine effective status (local state takes precedence for in-progress statuses)
        let effectiveStatus = localState?.status || JobStatus.OPEN;
        
        return {
          ...job,
          status: effectiveStatus,
          localState,
        };
      });
      
      // Also include any local jobs that weren't found on relays
      for (const local of localJobs) {
        if (!mergedJobs.some((mj) => mj.jobId === local.jobId || mj.jobEventId === local.jobEventId)) {
          mergedJobs.push({
            jobId: local.jobId,
            jobEventId: local.jobEventId,
            title: local.title,
            description: '',
            category: '',
            pricing: local.pricing,
            paymentMethods: local.pricing?.paymentMethods || [],
            employerPubkey: local.employerPubkey,
            employerNpub: nip19.npubEncode(local.employerPubkey),
            createdAt: local.createdAt,
            status: local.status,
            localState: local,
            relay: 'local',
          });
        }
      }
      
      // Sort by updatedAt (local) or createdAt (relay) descending
      mergedJobs.sort((a, b) => {
        const aTime = a.localState?.updatedAt || a.createdAt;
        const bTime = b.localState?.updatedAt || b.createdAt;
        return bTime - aTime;
      });
      
      this._emit('jobsLoaded', mergedJobs);
      return mergedJobs;
    } finally {
      this.isLoading = false;
      this._emit('loading', false);
    }
  }
  
  /**
   * Update job status via Nostr replaceable event (kind 30078)
   * @param {Object} params
   * @param {string} params.jobId - Job d-tag
   * @param {string} params.jobEventId - Job event ID
   * @param {string} params.newStatus - New status
   * @param {string} [params.reason] - Reason for change
   * @returns {Promise<Object>} Result
   */
  async updateJobStatus(params) {
    const { jobId, jobEventId, newStatus, reason } = params;
    
    // Verify we have a signer
    if (!(await this.checkSigner())) {
      throw new Error('No NIP-07 signer available. Please connect a Nostr signer.');
    }
    
    // Create status update event
    const unsignedEvent = createJobStatusEvent({
      jobId,
      jobEventId,
      newStatus,
      pubkey: this.config.userPubkey,
      reason,
    });
    
    // Sign with NIP-07
    let signedEvent;
    try {
      signedEvent = await this.config.signer.signEvent(unsignedEvent);
    } catch (err) {
      throw new Error(`Failed to sign status update: ${err.message}`);
    }
    
    // Publish to relays
    const results = { success: [], failed: [] };
    
    const publishPromises = this.config.relays.map(async (url) => {
      try {
        const relay = await Relay.connect(url, { timeout: this.config.queryTimeout });
        const published = await relay.publish(signedEvent);
        relay.close();
        if (published) {
          results.success.push(url);
        } else {
          results.failed.push({ url, error: 'Publish returned false' });
        }
      } catch (err) {
        results.failed.push({ url, error: err.message });
      }
    });
    
    await Promise.allSettled(publishPromises);
    
    if (results.success.length === 0) {
      throw new Error('Failed to publish status update to any relay');
    }
    
    // Update local state immediately for responsive UI
    await updateJobStatus(jobId, newStatus, { statusUpdateEventId: signedEvent.id });
    
    this._emit('statusUpdated', { jobId, jobEventId, newStatus, eventId: signedEvent.id, relays: results.success });
    
    return {
      success: true,
      eventId: signedEvent.id,
      publishedRelays: results.success,
      failedRelays: results.failed,
    };
  }
  
  /**
   * Cancel a job (if open)
   * @param {string} jobId
   * @param {string} jobEventId
   * @param {string} [reason]
   * @returns {Promise<Object>}
   */
  async cancelJob(jobId, jobEventId, reason) {
    return this.updateJobStatus({ jobId, jobEventId, newStatus: JobStatus.CANCELLED, reason });
  }
  
  /**
   * Dispute a job (if paid)
   * @param {string} jobId
   * @param {string} jobEventId
   * @param {string} [reason]
   * @returns {Promise<Object>}
   */
  async disputeJob(jobId, jobEventId, reason) {
    return this.updateJobStatus({ jobId, jobEventId, newStatus: JobStatus.DISPUTED, reason });
  }
  
  /**
   * Get formatted payment method string for display
   * @param {string[]} paymentMethods
   * @returns {string}
   */
  static formatPaymentMethods(paymentMethods) {
    if (!paymentMethods || paymentMethods.length === 0) return 'Not specified';
    return paymentMethods.map(m => m.toUpperCase()).join(', ');
  }
  
  /**
   * Get status badge class
   * @param {string} status
   * @returns {string}
   */
  static getStatusClass(status) {
    const classes = {
      [JobStatus.OPEN]: 'status-open',
      [JobStatus.IN_PROGRESS]: 'status-in_progress',
      [JobStatus.COMPLETED]: 'status-completed',
      [JobStatus.PAID]: 'status-paid',
      [JobStatus.CANCELLED]: 'status-cancelled',
      [JobStatus.DISPUTED]: 'status-disputed',
    };
    return classes[status] || 'status-open';
  }
  
  /**
   * Get human-readable status label
   * @param {string} status
   * @returns {string}
   */
  static getStatusLabel(status) {
    const labels = {
      [JobStatus.OPEN]: 'Open',
      [JobStatus.IN_PROGRESS]: 'In Progress',
      [JobStatus.COMPLETED]: 'Completed',
      [JobStatus.PAID]: 'Paid',
      [JobStatus.CANCELLED]: 'Cancelled',
      [JobStatus.DISPUTED]: 'Disputed',
    };
    return labels[status] || status;
  }
  
  /**
   * Check if action is available for status
   * @param {string} status
   * @param {string} action - 'view' | 'cancel' | 'dispute'
   * @returns {boolean}
   */
  static canPerformAction(status, action) {
    switch (action) {
      case 'view': return true;
      case 'cancel': return [JobStatus.OPEN].includes(status);
      case 'dispute': return [JobStatus.PAID].includes(status);
      default: return false;
    }
  }
  
  /**
   * Subscribe to events
   * @param {string} event - Event name
   * @param {Function} listener - Callback
   * @returns {Function} Unsubscribe
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }
  
  _emit(event, ...args) {
    this.listeners.get(event)?.forEach(listener => {
      try { listener(...args); } catch (e) { console.error(`Error in ${event} listener:`, e); }
    });
  }
}

/**
 * Create a JobDashboard instance
 * @param {Object} config
 * @returns {JobDashboard}
 */
export function createJobDashboard(config) {
  return new JobDashboard(config);
}

export default {
  JobDashboard,
  createJobDashboard,
  createJobStatusEvent,
  parseJobStatusEvent,
  JOB_STATUS_KIND,
  JobStatus,
  DEFAULT_DASHBOARD_RELAYS,
};