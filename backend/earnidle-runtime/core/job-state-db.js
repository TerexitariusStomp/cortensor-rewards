// JobStateDB — Local IndexedDB storage for job state tracking
// Tracks job status, payment status, agent assignment, and zap receipts

const DB_NAME = 'qvac-job-state';
const DB_VERSION = 1;
const STORE_JOBS = 'jobs';
const STORE_RECEIPTS = 'zapReceipts';

/**
 * Job state stored locally
 * @typedef {Object} JobState
 * @property {string} jobId - Job d-tag
 * @property {string} jobEventId - Nostr event ID
 * @property {string} title - Job title
 * @property {string} employerPubkey - Employer's public key (hex)
 * @property {string} [agentPubkey] - Agent's public key (hex)
 * @property {string} [agentLightningAddress] - Agent's lightning address
 * @property {string} status - 'open' | 'in_progress' | 'completed' | 'paid' | 'cancelled'
 * @property {number} amountSats - Payment amount in satoshis
 * @property {string} currency - Currency code
 * @property {Object} pricing - Full pricing object
 * @property {number} createdAt - Timestamp
 * @property {number} updatedAt - Timestamp
 * @property {number} [completedAt] - Completion timestamp
 * @property {number} [paidAt] - Payment timestamp
 */

/**
 * Zap receipt stored locally
 * @typedef {Object} ZapReceiptRecord
 * @property {string} id - Receipt event ID
 * @property {string} jobId - Job d-tag
 * @property {string} jobEventId - Job event ID
 * @property {string} requestId - Zap request event ID
 * @property {string} senderPubkey - Sender's public key
 * @property {string} recipientPubkey - Recipient's public key
 * @property {number} amount - Amount in millisats
 * @property {string} description - Description
 * @property {string} bolt11 - BOLT11 invoice
 * @property {string} preimage - Payment preimage
 * @property {number} createdAt - Event timestamp
 * @property {string} relay - Relay where received
 * @property {number} storedAt - Local storage timestamp
 */

let dbPromise = null;

/**
 * Initialize and get database connection
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Jobs store
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        const jobStore = db.createObjectStore(STORE_JOBS, { keyPath: 'jobId' });
        jobStore.createIndex('jobEventId', 'jobEventId', { unique: false });
        jobStore.createIndex('employerPubkey', 'employerPubkey', { unique: false });
        jobStore.createIndex('agentPubkey', 'agentPubkey', { unique: false });
        jobStore.createIndex('status', 'status', { unique: false });
        jobStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Zap receipts store
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
        const receiptStore = db.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' });
        receiptStore.createIndex('jobId', 'jobId', { unique: false });
        receiptStore.createIndex('jobEventId', 'jobEventId', { unique: false });
        receiptStore.createIndex('senderPubkey', 'senderPubkey', { unique: false });
        receiptStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Save or update job state
 * @param {JobState} jobState
 * @returns {Promise<string>} Job ID
 */
export async function saveJobState(jobState) {
  const db = await getDB();
  const now = Date.now();

  const record = {
    ...jobState,
    updatedAt: now,
    createdAt: jobState.createdAt || now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_JOBS], 'readwrite');
    const store = transaction.objectStore(STORE_JOBS);
    const request = store.put(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get job state by job ID
 * @param {string} jobId
 * @returns {Promise<JobState|null>}
 */
export async function getJobState(jobId) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_JOBS], 'readonly');
    const store = transaction.objectStore(STORE_JOBS);
    const request = store.get(jobId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get job state by Nostr event ID
 * @param {string} jobEventId
 * @returns {Promise<JobState|null>}
 */
export async function getJobStateByEventId(jobEventId) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_JOBS], 'readonly');
    const store = transaction.objectStore(STORE_JOBS);
    const index = store.index('jobEventId');
    const request = index.get(jobEventId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update job status
 * @param {string} jobId
 * @param {JobState['status']} status
 * @param {Partial<JobState>} [extraFields] - Additional fields to update
 * @returns {Promise<JobState|null>} Updated job state
 */
export async function updateJobStatus(jobId, status, extraFields = {}) {
  const job = await getJobState(jobId);
  if (!job) return null;

  const updates = {
    status,
    ...extraFields,
  };

  // Set timestamps based on status
  if (status === 'completed' && !job.completedAt) {
    updates.completedAt = Date.now();
  }
  if (status === 'paid' && !job.paidAt) {
    updates.paidAt = Date.now();
  }

  return saveJobState({ ...job, ...updates });
}

/**
 * Assign agent to job
 * @param {string} jobId
 * @param {string} agentPubkey
 * @param {string} [lightningAddress]
 * @returns {Promise<JobState|null>}
 */
export async function assignAgent(jobId, agentPubkey, lightningAddress) {
  return updateJobStatus(jobId, 'in_progress', {
    agentPubkey,
    agentLightningAddress: lightningAddress,
  });
}

/**
 * Mark job as completed by agent
 * @param {string} jobId
 * @param {string} agentPubkey
 * @returns {Promise<JobState|null>}
 */
export async function completeJob(jobId, agentPubkey) {
  return updateJobStatus(jobId, 'completed', { agentPubkey });
}

/**
 * Mark job as paid
 * @param {string} jobId
 * @param {string} zapReceiptId
 * @returns {Promise<JobState|null>}
 */
export async function markJobPaid(jobId, zapReceiptId) {
  return updateJobStatus(jobId, 'paid', { zapReceiptId });
}

/**
 * Get all jobs (optionally filtered)
 * @param {Object} [filters]
 * @param {JobState['status']} [filters.status]
 * @param {string} [filters.employerPubkey]
 * @param {string} [filters.agentPubkey]
 * @returns {Promise<JobState[]>}
 */
export async function getJobs(filters = {}) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_JOBS], 'readonly');
    const store = transaction.objectStore(STORE_JOBS);
    const request = store.getAll();

    request.onsuccess = () => {
      let jobs = request.result || [];

      if (filters.status) {
        jobs = jobs.filter(j => j.status === filters.status);
      }
      if (filters.employerPubkey) {
        jobs = jobs.filter(j => j.employerPubkey === filters.employerPubkey);
      }
      if (filters.agentPubkey) {
        jobs = jobs.filter(j => j.agentPubkey === filters.agentPubkey);
      }

      // Sort by updatedAt descending
      jobs.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(jobs);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save zap receipt
 * @param {ZapReceiptRecord} receipt
 * @returns {Promise<string>} Receipt ID
 */
export async function saveZapReceipt(receipt) {
  const db = await getDB();
  const record = {
    ...receipt,
    storedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RECEIPTS], 'readwrite');
    const store = transaction.objectStore(STORE_RECEIPTS);
    const request = store.put(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get zap receipt by ID
 * @param {string} id
 * @returns {Promise<ZapReceiptRecord|null>}
 */
export async function getZapReceipt(id) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RECEIPTS], 'readonly');
    const store = transaction.objectStore(STORE_RECEIPTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get zap receipts for a job
 * @param {string} jobId
 * @returns {Promise<ZapReceiptRecord[]>}
 */
export async function getZapReceiptsForJob(jobId) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RECEIPTS], 'readonly');
    const store = transaction.objectStore(STORE_RECEIPTS);
    const index = store.index('jobId');
    const request = index.getAll(jobId);

    request.onsuccess = () => {
      const receipts = request.result || [];
      receipts.sort((a, b) => b.createdAt - a.createdAt);
      resolve(receipts);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create job state from job event data
 * @param {Object} jobEntry - From parseJobEvent
 * @param {Object} event - Nostr event
 * @returns {JobState}
 */
export function createJobStateFromEvent(jobEntry, event) {
  const pricing = jobEntry.metadata.pricing || {};
  const amountSats = pricing.amount || pricing.minAmount || 0;

  return {
    jobId: jobEntry.dTag,
    jobEventId: event.id,
    title: jobEntry.metadata.title,
    employerPubkey: event.pubkey,
    status: 'open',
    amountSats,
    currency: pricing.currency || 'sats',
    pricing,
    createdAt: event.created_at * 1000,
    updatedAt: Date.now(),
  };
}

/**
 * Get or create job state from event (idempotent)
 * @param {Object} jobEntry
 * @param {Object} event
 * @returns {Promise<JobState>}
 */
export async function getOrCreateJobState(jobEntry, event) {
  let jobState = await getJobStateByEventId(event.id);

  if (!jobState) {
    jobState = createJobStateFromEvent(jobEntry, event);
    await saveJobState(jobState);
  }

  return jobState;
}

/**
 * Clear all job data (for testing)
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_JOBS, STORE_RECEIPTS], 'readwrite');
    transaction.objectStore(STORE_JOBS).clear();
    transaction.objectStore(STORE_RECEIPTS).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export default {
  saveJobState,
  getJobState,
  getJobStateByEventId,
  updateJobStatus,
  assignAgent,
  completeJob,
  markJobPaid,
  getJobs,
  saveZapReceipt,
  getZapReceipt,
  getZapReceiptsForJob,
  createJobStateFromEvent,
  getOrCreateJobState,
  clearAllData,
};