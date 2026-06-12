// Skill type definitions for QVAC Nostr integration
// Defines SkillMetadata, SkillInputSchema, SkillOutputSchema, SkillPricing, etc.

export const SKILL_EVENT_KIND = 30000;
export const SKILL_D_TAG_PREFIX = 'skill:';

/**
 * JSON Schema property definition
 * @typedef {Object} JsonSchemaProperty
 * @property {string|string[]} type
 * @property {string} [description]
 * @property {string[]} [enum]
 * @property {JsonSchemaProperty} [items]
 * @property {Record<string, JsonSchemaProperty>} [properties]
 * @property {string[]} [required]
 * @property {string} [format]
 * @property {unknown} [default]
 */

/**
 * Skill input schema
 * @typedef {Object} SkillInputSchema
 * @property {'object'} type
 * @property {Record<string, JsonSchemaProperty>} properties
 * @property {string[]} [required]
 * @property {boolean} [additionalProperties]
 */

/**
 * Skill output schema
 * @typedef {Object} SkillOutputSchema
 * @property {'object'} type
 * @property {Record<string, JsonSchemaProperty>} properties
 * @property {string[]} [required]
 * @property {boolean} [additionalProperties]
 */

/**
 * Skill pricing model
 * @typedef {Object} SkillPricing
 * @property {'per_call'|'subscription'|'freemium'|'custom'} model
 * @property {string} [currency]
 * @property {string} [amount]
 * @property {'monthly'|'yearly'|'per_call'} [period]
 * @property {Object} [freeTier] - For freemium model
 * @property {number} [freeTier.calls]
 * @property {string} [freeTier.period]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Skill capability
 * @typedef {Object} SkillCapability
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} [parameters]
 */

export const SkillCategory = {
  AI: 'ai',
  DATA: 'data',
  FINANCE: 'finance',
  UTILITY: 'utility',
  COMMUNICATION: 'communication',
  DEVELOPMENT: 'development',
  MEDIA: 'media',
  SECURITY: 'security',
  CUSTOM: 'custom',
};

/**
 * Skill metadata - the complete skill description
 * @typedef {Object} SkillMetadata
 * @property {string} d - Unique skill identifier (slug)
 * @property {string} name - Human-readable skill name
 * @property {string} description - Detailed description
 * @property {string} version - Semantic version
 * @property {SkillInputSchema} input_schema - Input JSON schema
 * @property {SkillOutputSchema} output_schema - Output JSON schema
 * @property {SkillPricing} pricing - Pricing model
 * @property {SkillCapability[]} [capabilities] - List of capabilities
 * @property {string} [category] - Skill category
 * @property {string} [repository] - Source code URL
 * @property {string} [documentation] - Documentation URL
 * @property {string} [license] - SPDX license identifier
 * @property {string} [image] - Skill image/icon URL
 */

/**
 * Agent skill registry - container for all skills an agent offers
 * @typedef {Object} AgentSkillRegistry
 * @property {string} agentId - Agent identifier
 * @property {string} agentName - Agent name
 * @property {string} [agentDescription] - Agent description
 * @property {SkillMetadata[]} skills - Array of skills
 * @property {number} updatedAt - Timestamp
 */

/**
 * Nostr skill tags for Kind 30000 events
 * @typedef {Object} NostrSkillTags
 * @property {string} d
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {string} input_schema
 * @property {string} output_schema
 * @property {string} pricing
 * @property {string} [capabilities]
 * @property {string} [category]
 * @property {string} [repository]
 * @property {string} [documentation]
 * @property {string} [license]
 * @property {string} [image]
 * @property {string} [agent_id]
 * @property {string} [agent_name]
 * @property {string} [agent_description]
 */

/**
 * Convert SkillMetadata to NostrSkillTags
 * @param {SkillMetadata} skill
 * @param {string} [agentId]
 * @param {string} [agentName]
 * @param {string} [agentDescription]
 * @returns {NostrSkillTags}
 */
export function skillMetadataToTags(skill, agentId, agentName, agentDescription) {
  const tags = {
    d: skill.d,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    input_schema: JSON.stringify(skill.input_schema),
    output_schema: JSON.stringify(skill.output_schema),
    pricing: JSON.stringify(skill.pricing),
  };

  if (skill.capabilities && skill.capabilities.length > 0) {
    tags.capabilities = JSON.stringify(skill.capabilities);
  }
  if (skill.category) tags.category = skill.category;
  if (skill.repository) tags.repository = skill.repository;
  if (skill.documentation) tags.documentation = skill.documentation;
  if (skill.license) tags.license = skill.license;
  if (skill.image) tags.image = skill.image;
  if (agentId) tags.agent_id = agentId;
  if (agentName) tags.agent_name = agentName;
  if (agentDescription) tags.agent_description = agentDescription;

  return tags;
}

/**
 * Convert NostrSkillTags back to SkillMetadata
 * @param {NostrSkillTags} tags
 * @returns {SkillMetadata}
 */
export function tagsToSkillMetadata(tags) {
  return {
    d: tags.d,
    name: tags.name,
    description: tags.description,
    version: tags.version,
    input_schema: JSON.parse(tags.input_schema),
    output_schema: JSON.parse(tags.output_schema),
    pricing: JSON.parse(tags.pricing),
    capabilities: tags.capabilities ? JSON.parse(tags.capabilities) : undefined,
    category: tags.category,
    repository: tags.repository,
    documentation: tags.documentation,
    license: tags.license,
    image: tags.image,
  };
}

/**
 * Create skill event content from agent registry
 * @param {AgentSkillRegistry} agent
 * @returns {string}
 */
export function createSkillEventContent(agent) {
  return JSON.stringify({
    agentId: agent.agentId,
    agentName: agent.agentName,
    agentDescription: agent.agentDescription,
    skills: agent.skills,
    timestamp: Date.now(),
  }, null, 2);
}

/**
 * Parse skill event content
 * @param {string} content
 * @returns {AgentSkillRegistry|null}
 */
export function parseSkillEventContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Convert NostrSkillTags to Nostr tag array format
 * @param {NostrSkillTags} tags
 * @returns {string[][]}
 */
export function skillTagsToNostrTags(tags) {
  const result = [
    ['d', `${SKILL_D_TAG_PREFIX}${tags.d}`],
    ['name', tags.name],
    ['description', tags.description],
    ['version', tags.version],
    ['input_schema', tags.input_schema],
    ['output_schema', tags.output_schema],
    ['pricing', tags.pricing],
  ];

  if (tags.capabilities) result.push(['capabilities', tags.capabilities]);
  if (tags.category) result.push(['category', tags.category]);
  if (tags.repository) result.push(['repository', tags.repository]);
  if (tags.documentation) result.push(['documentation', tags.documentation]);
  if (tags.license) result.push(['license', tags.license]);
  if (tags.image) result.push(['image', tags.image]);
  if (tags.agent_id) result.push(['agent_id', tags.agent_id]);
  if (tags.agent_name) result.push(['agent_name', tags.agent_name]);
  if (tags.agent_description) result.push(['agent_description', tags.agent_description]);

  return result;
}

/**
 * Parse a Nostr event into SkillEntry
 * @param {NostrEvent} event
 * @param {string} relayUrl
 * @returns {SkillEntry|null}
 */
export function parseSkillEvent(event, relayUrl) {
  if (event.kind !== SKILL_EVENT_KIND) return null;

  const getTag = (name) => {
    const tag = event.tags.find(([k]) => k === name);
    return tag ? tag[1] : undefined;
  };

  const getTags = (name) => {
    return event.tags.filter(([k]) => k === name).map(([, v]) => v);
  };

  const dTag = getTag('d');
  if (!dTag) return null;

  // Remove skill: prefix if present
  const cleanDTag = dTag.startsWith(SKILL_D_TAG_PREFIX) ? dTag.slice(SKILL_D_TAG_PREFIX.length) : dTag;

  const statusTag = getTag('status');
  const isRetracted = event.content === 'retracted' || statusTag === 'retracted';

  const name = getTag('name');
  const description = getTag('description');
  const version = getTag('version');
  const inputSchemaStr = getTag('input_schema');
  const outputSchemaStr = getTag('output_schema');
  const pricingStr = getTag('pricing');

  if (!name || !description || !version || !inputSchemaStr || !outputSchemaStr) {
    if (!isRetracted) return null;
  }

  let inputSchema = {};
  let outputSchema = {};
  let pricing = undefined;

  if (!isRetracted) {
    if (!inputSchemaStr || !outputSchemaStr) return null;

    try {
      inputSchema = JSON.parse(inputSchemaStr);
    } catch {
      return null;
    }

    try {
      outputSchema = JSON.parse(outputSchemaStr);
    } catch {
      return null;
    }

    if (pricingStr) {
      try {
        pricing = JSON.parse(pricingStr);
      } catch {
        // Ignore pricing parse errors
      }
    }
  }

  return {
    pubkey: event.pubkey,
    metadata: {
      name: name || '',
      description: description || '',
      version: version || '',
      inputSchema,
      outputSchema,
      pricing,
      capabilities: getTags('capabilities'),
      category: getTag('category'),
      repository: getTag('repository'),
      documentation: getTag('documentation'),
      license: getTag('license'),
    },
    relay: relayUrl,
    eventId: event.id,
    createdAt: event.created_at,
    dTag: cleanDTag,
    content: event.content,
  };
}

/**
 * Build searchable text for a skill entry
 * @param {SkillEntry} entry
 * @returns {string}
 */
export function buildSearchableText(entry) {
  const parts = [
    entry.metadata.name.toLowerCase(),
    entry.metadata.description.toLowerCase(),
    entry.metadata.category?.toLowerCase() || '',
    ...entry.metadata.capabilities.map(c => c.toLowerCase()),
    entry.dTag.toLowerCase(),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Compare semantic versions
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;
    if (aPart !== bPart) return aPart - bPart;
  }
  return 0;
}