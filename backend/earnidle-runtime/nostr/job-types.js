// Job Posting type definitions for QVAC Nostr integration
// Implements NIP-99 Classified Listings (kind 30402) with job-specific extensions

import { nip19 } from 'nostr-tools';

export const JOB_EVENT_KIND = 30402;
export const JOB_D_TAG_PREFIX = 'job:';

/**
 * Job pricing structure
 * @typedef {Object} JobPricing
 * @property {'fixed'|'range'|'hourly'|'per_task'|'negotiable'} model
 * @property {string} [currency] - Currency code (e.g., 'usdt', 'btc', 'sats', 'usd', 'eur')
 * @property {string|number} [amount] - Fixed amount for 'fixed' model
 * @property {string|number} [minAmount] - Min amount for 'range' model
 * @property {string|number} [maxAmount] - Max amount for 'range' model
 * @property {'hourly'|'daily'|'weekly'|'monthly'|'per_task'} [period] - Payment period
 * @property {string[]} [paymentMethods] - Supported payment methods: 'zap', 'wmc', 'usdt-ton', 'btc', 'lightning', 'fiat'
 */

/**
 * Job requirement structure
 * @typedef {Object} JobRequirement
 * @property {string} type - 'skill' | 'capability' | 'credential' | 'reputation' | 'custom'
 * @property {string} name - Requirement name
 * @property {string} [description]
 * @property {boolean} [required=true]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Job metadata - the complete job description
 * @typedef {Object} JobMetadata
 * @property {string} d - Unique job identifier (slug)
 * @property {string} title - Job title
 * @property {string} description - Detailed job description
 * @property {string} [category] - Job category
 * @property {JobPricing} pricing - Pricing model
 * @property {string} [deadline] - ISO 8601 deadline string
 * @property {JobRequirement[]} [requirements] - List of requirements
 * @property {string[]} [skills] - Required skills (tags)
 * @property {string[]} [capabilities] - Required agent capabilities
 * @property {string} [employer] - Employer npub/pubkey
 * @property {string} [repository] - Source code / repo URL
 * @property {string} [documentation] - Documentation URL
 * @property {string} [image] - Job image/icon URL
 * @property {boolean} [remote=true] - Remote work allowed
 * @property {string} [location] - Physical location if not remote
 * @property {string} [employmentType] - 'full_time' | 'part_time' | 'contract' | 'freelance' | 'bounty'
 */

/**
 * Nostr job tags for Kind 30402 events (NIP-99)
 * @typedef {Object} NostrJobTags
 * @property {string} d
 * @property {string} title
 * @property {string} description
 * @property {string} [category]
 * @property {string} pricing
 * @property {string} [deadline]
 * @property {string} [requirements]
 * @property {string} [skills]
 * @property {string} [capabilities]
 * @property {string} [employer]
 * @property {string} [repository]
 * @property {string} [documentation]
 * @property {string} [image]
 * @property {string} [remote]
 * @property {string} [location]
 * @property {string} [employment_type]
 */

/**
 * Convert JobMetadata to NostrJobTags
 * @param {JobMetadata} job
 * @returns {NostrJobTags}
 */
export function jobMetadataToTags(job) {
  const tags = {
    d: job.d,
    title: job.title,
    description: job.description,
    pricing: JSON.stringify(job.pricing),
  };

  if (job.category) tags.category = job.category;
  if (job.deadline) tags.deadline = job.deadline;
  if (job.requirements && job.requirements.length > 0) {
    tags.requirements = JSON.stringify(job.requirements);
  }
  if (job.skills && job.skills.length > 0) {
    tags.skills = JSON.stringify(job.skills);
  }
  if (job.capabilities && job.capabilities.length > 0) {
    tags.capabilities = JSON.stringify(job.capabilities);
  }
  if (job.employer) tags.employer = job.employer;
  if (job.repository) tags.repository = job.repository;
  if (job.documentation) tags.documentation = job.documentation;
  if (job.image) tags.image = job.image;
  if (job.remote !== undefined) tags.remote = job.remote.toString();
  if (job.location) tags.location = job.location;
  if (job.employmentType) tags.employment_type = job.employmentType;

  return tags;
}

/**
 * Convert NostrJobTags back to JobMetadata
 * @param {NostrJobTags} tags
 * @returns {JobMetadata}
 */
export function tagsToJobMetadata(tags) {
  const pricing = tags.pricing ? JSON.parse(tags.pricing) : { model: 'negotiable' };
  const requirements = tags.requirements ? JSON.parse(tags.requirements) : [];
  const skills = tags.skills ? JSON.parse(tags.skills) : [];
  const capabilities = tags.capabilities ? JSON.parse(tags.capabilities) : [];

  return {
    d: tags.d,
    title: tags.title,
    description: tags.description,
    category: tags.category,
    pricing,
    deadline: tags.deadline,
    requirements,
    skills,
    capabilities,
    employer: tags.employer,
    repository: tags.repository,
    documentation: tags.documentation,
    image: tags.image,
    remote: tags.remote === 'true',
    location: tags.location,
    employmentType: tags.employment_type,
  };
}

/**
 * Create job event content (human-readable summary)
 * @param {JobMetadata} job
 * @returns {string}
 */
export function createJobEventContent(job) {
  const lines = [
    `# ${job.title}`,
    '',
    job.description,
    '',
    `**Category:** ${job.category || 'Uncategorized'}`,
    `**Employment Type:** ${job.employmentType || 'Not specified'}`,
    `**Remote:** ${job.remote !== false ? 'Yes' : 'No'}`,
  ];

  if (job.location) {
    lines.push(`**Location:** ${job.location}`);
  }

  if (job.pricing) {
    const p = job.pricing;
    let priceStr = '';
    switch (p.model) {
      case 'fixed':
        priceStr = `${p.amount} ${p.currency || 'sats'}`;
        if (p.period) priceStr += ` / ${p.period}`;
        break;
      case 'range':
        priceStr = `${p.minAmount || 0} - ${p.maxAmount || '?'} ${p.currency || 'sats'}`;
        if (p.period) priceStr += ` / ${p.period}`;
        break;
      case 'hourly':
        priceStr = `${p.amount || '?'} ${p.currency || 'sats'} / hour`;
        break;
      case 'per_task':
        priceStr = `${p.amount || '?'} ${p.currency || 'sats'} per task`;
        break;
      case 'negotiable':
      default:
        priceStr = 'Negotiable';
    }
    lines.push(`**Compensation:** ${priceStr}`);

    if (p.paymentMethods && p.paymentMethods.length > 0) {
      lines.push(`**Payment Methods:** ${p.paymentMethods.join(', ')}`);
    }
  }

  if (job.deadline) {
    lines.push(`**Deadline:** ${new Date(job.deadline).toLocaleDateString()}`);
  }

  if (job.skills && job.skills.length > 0) {
    lines.push(`**Required Skills:** ${job.skills.join(', ')}`);
  }

  if (job.capabilities && job.capabilities.length > 0) {
    lines.push(`**Required Capabilities:** ${job.capabilities.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Convert NostrJobTags to Nostr tag array format
 * @param {NostrJobTags} tags
 * @returns {string[][]}
 */
export function jobTagsToNostrTags(tags) {
  const result = [
    ['d', `${JOB_D_TAG_PREFIX}${tags.d}`],
    ['title', tags.title],
    ['description', tags.description],
    ['pricing', tags.pricing],
  ];

  if (tags.category) result.push(['category', tags.category]);
  if (tags.deadline) result.push(['deadline', tags.deadline]);
  if (tags.requirements) result.push(['requirements', tags.requirements]);
  if (tags.skills) result.push(['skills', tags.skills]);
  if (tags.capabilities) result.push(['capabilities', tags.capabilities]);
  if (tags.employer) result.push(['employer', tags.employer]);
  if (tags.repository) result.push(['repository', tags.repository]);
  if (tags.documentation) result.push(['documentation', tags.documentation]);
  if (tags.image) result.push(['image', tags.image]);
  if (tags.remote !== undefined) result.push(['remote', tags.remote]);
  if (tags.location) result.push(['location', tags.location]);
  if (tags.employment_type) result.push(['employment_type', tags.employment_type]);

  return result;
}

/**
 * Parse a Nostr event into JobEntry
 * @param {import('nostr-tools').Event} event
 * @param {string} relayUrl
 * @returns {JobEntry|null}
 */
export function parseJobEvent(event, relayUrl) {
  if (event.kind !== JOB_EVENT_KIND) return null;

  const getTag = (name) => {
    const tag = event.tags.find(([k]) => k === name);
    return tag ? tag[1] : undefined;
  };

  const dTag = getTag('d');
  if (!dTag) return null;

  const cleanDTag = dTag.startsWith(JOB_D_TAG_PREFIX) ? dTag.slice(JOB_D_TAG_PREFIX.length) : dTag;

  const title = getTag('title');
  const description = getTag('description');
  const pricingStr = getTag('pricing');

  if (!title || !description || !pricingStr) return null;

  let pricing;
  try {
    pricing = JSON.parse(pricingStr);
  } catch {
    return null;
  }

  const requirementsStr = getTag('requirements');
  let requirements = [];
  if (requirementsStr) {
    try {
      requirements = JSON.parse(requirementsStr);
    } catch {
      // Ignore parse errors
    }
  }

  const skillsStr = getTag('skills');
  let skills = [];
  if (skillsStr) {
    try {
      skills = JSON.parse(skillsStr);
    } catch {
      // Ignore parse errors
    }
  }

  const capabilitiesStr = getTag('capabilities');
  let capabilities = [];
  if (capabilitiesStr) {
    try {
      capabilities = JSON.parse(capabilitiesStr);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    pubkey: event.pubkey,
    metadata: {
      d: cleanDTag,
      title,
      description,
      category: getTag('category'),
      pricing,
      deadline: getTag('deadline'),
      requirements,
      skills,
      capabilities,
      employer: getTag('employer'),
      repository: getTag('repository'),
      documentation: getTag('documentation'),
      image: getTag('image'),
      remote: getTag('remote') === 'true',
      location: getTag('location'),
      employmentType: getTag('employment_type'),
    },
    relay: relayUrl,
    eventId: event.id,
    createdAt: event.created_at,
    dTag: cleanDTag,
    content: event.content,
  };
}

/**
 * Build searchable text for a job entry
 * @param {JobEntry} entry
 * @returns {string}
 */
export function buildSearchableText(entry) {
  const parts = [
    entry.metadata.title.toLowerCase(),
    entry.metadata.description.toLowerCase(),
    entry.metadata.category?.toLowerCase() || '',
    entry.metadata.employmentType?.toLowerCase() || '',
    ...entry.metadata.skills.map(s => s.toLowerCase()),
    ...entry.metadata.capabilities.map(c => c.toLowerCase()),
    entry.dTag.toLowerCase(),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Validate job metadata
 * @param {JobMetadata} job
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateJobMetadata(job) {
  const errors = [];

  if (!job.d || !job.d.trim()) {
    errors.push('Job ID (d-tag) is required');
  } else if (!/^[a-z0-9-]+$/.test(job.d)) {
    errors.push('Job ID must contain only lowercase letters, numbers, and hyphens');
  }

  if (!job.title || !job.title.trim()) {
    errors.push('Title is required');
  } else if (job.title.length > 200) {
    errors.push('Title must be 200 characters or less');
  }

  if (!job.description || !job.description.trim()) {
    errors.push('Description is required');
  } else if (job.description.length > 10000) {
    errors.push('Description must be 10000 characters or less');
  }

  if (!job.pricing) {
    errors.push('Pricing is required');
  } else {
    const p = job.pricing;
    if (!['fixed', 'range', 'hourly', 'per_task', 'negotiable'].includes(p.model)) {
      errors.push('Invalid pricing model');
    }
    if (p.model === 'fixed' && (!p.amount || isNaN(Number(p.amount)))) {
      errors.push('Fixed pricing requires a valid amount');
    }
    if (p.model === 'range') {
      if (!p.minAmount || isNaN(Number(p.minAmount))) {
        errors.push('Range pricing requires a valid min amount');
      }
      if (!p.maxAmount || isNaN(Number(p.maxAmount))) {
        errors.push('Range pricing requires a valid max amount');
      }
      if (Number(p.minAmount) > Number(p.maxAmount)) {
        errors.push('Min amount cannot exceed max amount');
      }
    }
    if (p.model === 'hourly' && (!p.amount || isNaN(Number(p.amount)))) {
      errors.push('Hourly pricing requires a valid amount');
    }
    if (p.model === 'per_task' && (!p.amount || isNaN(Number(p.amount)))) {
      errors.push('Per-task pricing requires a valid amount');
    }
  }

  if (job.deadline) {
    const deadline = new Date(job.deadline);
    if (isNaN(deadline.getTime())) {
      errors.push('Invalid deadline format (use ISO 8601)');
    } else if (deadline < new Date()) {
      errors.push('Deadline cannot be in the past');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default job categories
 */
export const JobCategory = {
  AI_ML: 'ai-ml',
  DATA_SCIENCE: 'data-science',
  DEVELOPMENT: 'development',
  DEVOPS: 'devops',
  DESIGN: 'design',
  WRITING: 'writing',
  MARKETING: 'marketing',
  FINANCE: 'finance',
  RESEARCH: 'research',
  ADMIN: 'admin',
  CUSTOM: 'custom',
};

/**
 * Employment types
 */
export const EmploymentType = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT: 'contract',
  FREELANCE: 'freelance',
  BOUNTY: 'bounty',
};

/**
 * Payment methods
 */
export const PaymentMethod = {
  ZAP: 'zap',
  WMC: 'wmc',
  USDT_TON: 'usdt-ton',
  BTC: 'btc',
  LIGHTNING: 'lightning',
  FIAT: 'fiat',
};