// QVAC Nostr Integration - Main exports
// Provides NostrClient, SkillAdvertiser, SkillDiscovery, JobCreator, ZapPayment for agent skill/job advertisement
// Also provides WOT (Web of Trust) integration via jeletor ai-wot for trust-scored skill discovery

export {
  NostrClient,
  createNostrClient,
  createEvent,
  ConnectionState,
  generatePrivateKey,
  privateKeyToNsec,
  nsecToPrivateKey,
  privateKeyToNpub,
} from './nostr-client.js';

export {
  SkillAdvertiser,
  createSkillAdvertiser,
} from './skill-advertiser.js';

export {
  SkillDiscovery,
  createSkillDiscovery,
  SKILL_EVENT_KIND,
} from './skill-discovery.js';

export {
  skillMetadataToTags,
  tagsToSkillMetadata,
  createSkillEventContent,
  parseSkillEventContent,
  skillTagsToNostrTags,
  parseSkillEvent,
  buildSearchableText,
  compareVersions,
  SKILL_EVENT_KIND as SkillEventKind,
  SKILL_D_TAG_PREFIX,
  SkillCategory,
} from './skill-types.js';

export {
  JobCreator,
  createJobCreator,
  parseFormData,
  JOB_FORM_FIELDS,
} from './job-creator.js';

export {
  jobMetadataToTags,
  tagsToJobMetadata,
  createJobEventContent,
  jobTagsToNostrTags,
  parseJobEvent,
  validateJobMetadata,
  JOB_EVENT_KIND,
  JOB_EVENT_KIND as JobEventKind,
  JOB_D_TAG_PREFIX,
  JobCategory,
  EmploymentType,
  PaymentMethod,
} from './job-types.js';

export {
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
} from './zap-payment-index.js';

export {
  JobDashboard,
  createJobDashboard,
  createJobStatusEvent,
  parseJobStatusEvent,
  JOB_STATUS_KIND,
  JobStatus,
  DEFAULT_DASHBOARD_RELAYS,
} from './job-dashboard.js';

// WOT (Web of Trust) Integration via jeletor ai-wot
export {
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
  WOT,
} from './wot-integration.js';