// JobCreator - Handles job posting form, validation, NIP-07 signing, and publishing to Nostr

import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';

import {
  JOB_EVENT_KIND,
  JOB_D_TAG_PREFIX,
  jobMetadataToTags,
  jobTagsToNostrTags,
  createJobEventContent,
  validateJobMetadata,
  JobCategory,
  EmploymentType,
  PaymentMethod,
} from './job-types.js';

/**
 * JobCreator configuration
 * @typedef {Object} JobCreatorConfig
 * @property {string[]} relays - Nostr relay URLs for publishing
 * @property {number} [publishTimeout=10000] - Timeout for publishing to each relay (ms)
 */

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
];

/**
 * Form field definitions for the job posting form
 * @type {FormField[]}
 */
export const JOB_FORM_FIELDS = [
  // Required fields
  { name: 'd', label: 'Job ID (slug)', type: 'text', required: true, placeholder: 'unique-job-id', help: 'Unique identifier using lowercase letters, numbers, and hyphens' },
  { name: 'title', label: 'Job Title', type: 'text', required: true, placeholder: 'Senior AI Engineer', help: 'Clear, descriptive title (max 200 chars)' },
  { name: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'Detailed job description...', help: 'Full job description (max 10000 chars)' },

  // Optional fields
  { name: 'category', label: 'Category', type: 'select', required: false, options: Object.entries(JobCategory).map(([k, v]) => ({ value: v, label: k.replace('_', ' ') })), help: 'Job category' },
  { name: 'employmentType', label: 'Employment Type', type: 'select', required: false, options: Object.entries(EmploymentType).map(([k, v]) => ({ value: v, label: k.replace('_', ' ') })), help: 'Type of employment' },

  // Pricing fields
  { name: 'pricing.model', label: 'Pricing Model', type: 'select', required: true, options: ['fixed', 'range', 'hourly', 'per_task', 'negotiable'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1).replace('_', ' ') })), help: 'How compensation is structured' },
  { name: 'pricing.currency', label: 'Currency', type: 'text', required: false, placeholder: 'usdt', help: 'Currency code (usdt, btc, sats, usd, eur, etc.)' },
  { name: 'pricing.amount', label: 'Amount', type: 'number', required: false, placeholder: '1000', step: '0.01', help: 'Fixed amount (for fixed/hourly/per_task models)' },
  { name: 'pricing.minAmount', label: 'Min Amount', type: 'number', required: false, placeholder: '500', step: '0.01', help: 'Minimum amount (for range model)' },
  { name: 'pricing.maxAmount', label: 'Max Amount', type: 'number', required: false, placeholder: '2000', step: '0.01', help: 'Maximum amount (for range model)' },
  { name: 'pricing.period', label: 'Period', type: 'select', required: false, options: ['hourly', 'daily', 'weekly', 'monthly', 'per_task'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })), help: 'Payment period' },
  { name: 'pricing.paymentMethods', label: 'Payment Methods', type: 'multiselect', required: false, options: Object.entries(PaymentMethod).map(([k, v]) => ({ value: v, label: k.replace('_', ' ') })), help: 'Accepted payment methods' },

  // Additional fields
  { name: 'deadline', label: 'Deadline', type: 'datetime-local', required: false, help: 'Application deadline (optional)' },
  { name: 'skills', label: 'Required Skills', type: 'text', required: false, placeholder: 'python, machine-learning, pytorch', help: 'Comma-separated required skills' },
  { name: 'capabilities', label: 'Required Capabilities', type: 'text', required: false, placeholder: 'inference, gpu-compute, web-scraping', help: 'Comma-separated agent capabilities' },
  { name: 'requirements', label: 'Requirements (JSON)', type: 'textarea', required: false, placeholder: '[{"type":"skill","name":"Python","required":true}]', help: 'Structured requirements as JSON array' },
  { name: 'remote', label: 'Remote Work', type: 'checkbox', required: false, default: true, help: 'Allow remote work' },
  { name: 'location', label: 'Location', type: 'text', required: false, placeholder: 'San Francisco, CA', help: 'Physical location if not remote' },
  { name: 'employer', label: 'Employer (npub)', type: 'text', required: false, placeholder: 'npub1...', help: 'Employer Nostr public key (auto-filled if signing with NIP-07)' },
  { name: 'repository', label: 'Repository URL', type: 'url', required: false, placeholder: 'https://github.com/...', help: 'Source code repository' },
  { name: 'documentation', label: 'Documentation URL', type: 'url', required: false, placeholder: 'https://docs...', help: 'Documentation link' },
  { name: 'image', label: 'Image URL', type: 'url', required: false, placeholder: 'https://...', help: 'Job image/icon URL' },
];

/**
 * Parse form data into JobMetadata
 * @param {FormData} formData
 * @returns {JobMetadata}
 */
export function parseFormData(formData) {
  const get = (name) => formData.get(name)?.toString().trim() || '';
  const getArray = (name) => {
    const val = get(name);
    return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
  };

  const pricingModel = get('pricing.model');

  // Build pricing object based on model
  let pricing = { model: pricingModel };

  if (pricingModel === 'negotiable') {
    pricing.currency = get('pricing.currency') || 'sats';
  } else {
    pricing.currency = get('pricing.currency') || 'usdt';
    pricing.period = get('pricing.period') || 'monthly';
  }

  if (pricingModel === 'fixed' || pricingModel === 'hourly' || pricingModel === 'per_task') {
    const amount = get('pricing.amount');
    if (amount) pricing.amount = Number(amount);
  } else if (pricingModel === 'range') {
    const minAmount = get('pricing.minAmount');
    const maxAmount = get('pricing.maxAmount');
    if (minAmount) pricing.minAmount = Number(minAmount);
    if (maxAmount) pricing.maxAmount = Number(maxAmount);
  }

  const paymentMethods = getArray('pricing.paymentMethods');
  if (paymentMethods.length > 0) {
    pricing.paymentMethods = paymentMethods;
  }

  // Parse requirements JSON
  let requirements = [];
  const requirementsStr = get('requirements');
  if (requirementsStr) {
    try {
      requirements = JSON.parse(requirementsStr);
    } catch (e) {
      console.warn('Invalid requirements JSON:', e);
    }
  }

  return {
    d: get('d'),
    title: get('title'),
    description: get('description'),
    category: get('category') || undefined,
    employmentType: get('employmentType') || undefined,
    pricing,
    deadline: get('deadline') || undefined,
    skills: getArray('skills'),
    capabilities: getArray('capabilities'),
    requirements,
    remote: formData.get('remote') === 'on',
    location: get('location') || undefined,
    employer: get('employer') || undefined,
    repository: get('repository') || undefined,
    documentation: get('documentation') || undefined,
    image: get('image') || undefined,
  };
}

/**
 * JobCreator class
 */
export class JobCreator {
  constructor(config = {}) {
    this.config = {
      relays: config.relays || DEFAULT_RELAYS,
      publishTimeout: config.publishTimeout ?? 10000,
    };

    this.nip07signer = null;
    this.userPubkey = null;
    this.listeners = new Map();
  }

  /**
   * Check if NIP-07 signer is available (Alby, nos2x, etc.)
   * @returns {Promise<boolean>}
   */
  async checkNip07() {
    try {
      if (typeof window !== 'undefined' && window.nostr) {
        this.nip07signer = window.nostr;
        const pubkey = await window.nostr.getPublicKey();
        this.userPubkey = pubkey;
        return true;
      }
      // Also check for nos2x and other injected signers
      if (typeof window !== 'undefined' && window.nos2x) {
        this.nip07signer = window.nos2x;
        const pubkey = await window.nos2x.getPublicKey();
        this.userPubkey = pubkey;
        return true;
      }
    } catch (e) {
      console.warn('NIP-07 check failed:', e);
    }
    return false;
  }

  /**
   * Get the user's public key (npub format)
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
   * @returns {Promise<Object>}
   */
  async signEvent(event) {
    if (!this.nip07signer) {
      await this.checkNip07();
    }
    if (!this.nip07signer) {
      throw new Error('No NIP-07 signer available. Please install Alby, nos2x, or another Nostr extension.');
    }

    // Call NIP-07 signer's signEvent directly (Alby, nos2x, etc.)
    const signedEvent = await this.nip07signer.signEvent(event);
    return signedEvent;
  }

  /**
   * Publish event to relays
   * @param {Object} event
   * @returns {Promise<PublishResult>}
   */
  async publishEvent(event) {
    const results = {
      success: [],
      failed: [],
    };

    const publishPromises = this.config.relays.map(async (url) => {
      try {
        const relay = await Relay.connect(url, { timeout: this.config.publishTimeout });
        const published = await relay.publish(event);
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
    return results;
  }

  /**
   * Create and publish a job posting
   * @param {JobMetadata} jobData
   * @returns {Promise<CreateJobResult>}
   */
  async createJob(jobData) {
    // Validate
    const validation = validateJobMetadata(jobData);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Auto-fill employer with user's pubkey if not set
    if (!jobData.employer && this.userPubkey) {
      jobData.employer = nip19.npubEncode(this.userPubkey);
    }

    // Create Nostr tags
    const tags = jobMetadataToTags(jobData);
    const nostrTags = jobTagsToNostrTags(tags);

    // Create event content
    const content = createJobEventContent(jobData);

    // Build unsigned event
    const unsignedEvent = {
      kind: JOB_EVENT_KIND,
      content,
      tags: nostrTags,
      created_at: Math.floor(Date.now() / 1000),
    };

    // Sign with NIP-07
    let signedEvent;
    try {
      signedEvent = await this.signEvent(unsignedEvent);
    } catch (err) {
      return {
        success: false,
        errors: [err.message],
      };
    }

    // Publish to relays
    const publishResult = await this.publishEvent(signedEvent);

    if (publishResult.success.length === 0) {
      return {
        success: false,
        errors: ['Failed to publish to any relay'],
        eventId: signedEvent.id,
        event: signedEvent,
      };
    }

    this._emit('jobCreated', {
      eventId: signedEvent.id,
      pubkey: signedEvent.pubkey,
      relays: publishResult.success,
      jobData,
    });

    return {
      success: true,
      eventId: signedEvent.id,
      event: signedEvent,
      publishedRelays: publishResult.success,
      failedRelays: publishResult.failed,
      nostrBandUrl: `https://nostr.band/event/${signedEvent.id}`,
    };
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
 * Create a JobCreator instance
 * @param {JobCreatorConfig} config
 * @returns {JobCreator}
 */
export function createJobCreator(config) {
  return new JobCreator(config);
}

/**
 * Default export
 */
export default {
  JobCreator,
  createJobCreator,
  parseFormData,
  JOB_FORM_FIELDS,
  JOB_EVENT_KIND,
  JobCategory,
  EmploymentType,
  PaymentMethod,
};