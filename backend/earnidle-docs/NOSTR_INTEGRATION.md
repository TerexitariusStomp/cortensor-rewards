# QVAC Nostr Integration

This module provides Nostr-based skill advertisement and discovery for QVAC agents.

## Features

- **Skill Advertisement**: Publish agent skills to Nostr using Kind 30000 (parameterized replaceable events)
- **Skill Discovery**: Subscribe to and query skill advertisements from other agents on Nostr
- **Multiple Relays**: Connect to multiple Nostr relays with automatic reconnection
- **Key Management**: Automatic key generation/storage (IndexedDB in browser, filesystem in Node)
- **Event Handling**: Emit events for skill published, discovered, updated, retracted

## Installation

```bash
npm install nostr-tools
```

## Quick Start

```javascript
import idle from './src/core/idle.js';

// Start EarnIdle resources
await idle.start({
  resources: ['inference'],
  wallet: 'your-wallet',
  nodeId: 'your-node-id',
});

// Advertise skills on Nostr
await idle.advertiseSkills({
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
  agentId: 'my-agent-001',
  agentName: 'My QVAC Agent',
  agentDescription: 'A helpful QVAC agent',
  skills: [{
    d: 'web-scraper',
    name: 'Web Scraper',
    description: 'Extracts structured data from websites',
    version: '1.0.0',
    category: 'data',
    capabilities: ['web', 'scraping', 'css'],
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'uri' } },
      required: ['url']
    },
    output_schema: {
      type: 'object',
      properties: { data: { type: 'array' } },
      required: ['data']
    },
    pricing: { model: 'per_call', amount: '100', currency: 'sats' }
  }]
});

// Discover skills from other agents
await idle.discoverSkills({
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
});

// Find skills
const skills = idle.findSkills({
  category: 'data',
  capabilities: ['scraping']
});
```

## API

### `idle.advertiseSkills(config)`

Start advertising agent skills on Nostr.

**Config:**
- `relays` (string[]) - Nostr relay URLs
- `agentId` (string) - Unique agent identifier
- `agentName` (string) - Human-readable agent name
- `agentDescription` (string, optional) - Agent description
- `skills` (SkillMetadata[]) - Skills to advertise
- `refreshInterval` (number, optional) - Refresh interval in ms (default: 300000)
- `privateKey` (string/Uint8Array, optional) - Private key (nsec or raw bytes)

**Returns:** `{ npub, agentId, relays }`

### `idle.stopAdvertising()`

Stop skill advertisement.

### `idle.discoverSkills(config)`

Start discovering skills on Nostr.

**Config:**
- `relays` (string[]) - Nostr relay URLs
- `initialFilter` (Filter, optional) - Additional Nostr filter

### `idle.findSkills(query)`

Find skills matching criteria.

**Query:**
- `name` (string) - Fuzzy name match
- `category` (string) - Category filter
- `capabilities` (string[]) - Required capabilities
- `pubkey` (string) - Agent pubkey filter
- `dTag` (string) - Exact d-tag match
- `minVersion` (string) - Minimum version
- `maxVersion` (string) - Maximum version

### `idle.publishSkill(params)` / `idle.retractSkill(params)`

Direct skill publishing/retraction using SkillDiscovery.

## Events

Listen to events with `idle.on(handler)`:

```javascript
idle.on((name, payload) => {
  switch (name) {
    case 'skillAdvertiserStarted':
      // Advertiser connected and publishing
      break;
    case 'skillPublished':
      // A skill was published to Nostr
      break;
    case 'skillDiscovered':
      // New skill discovered from another agent
      break;
    case 'skillUpdated':
      // Existing skill was updated
      break;
    case 'skillRetracted':
      // Skill was retracted
      break;
    case 'skillAdvertiserError':
    case 'skillDiscoveryError':
      // Error occurred
      break;
  }
});
```

## Skill Metadata Schema

```javascript
{
  d: 'unique-skill-id',          // Required: unique identifier
  name: 'Skill Name',            // Required: human-readable name
  description: 'Description',    // Required: detailed description
  version: '1.0.0',              // Required: semantic version
  input_schema: { ... },         // Required: JSON Schema for input
  output_schema: { ... },        // Required: JSON Schema for output
  pricing: {                     // Required: pricing model
    model: 'per_call',           // 'free' | 'per_call' | 'subscription' | 'freemium' | 'custom'
    amount: '100',               // Amount as string
    currency: 'sats',            // Currency (sats, usd, etc.)
    period: 'monthly',           // For subscription
    freeTier: { calls: 100, period: 'monthly' }  // For freemium
  },
  capabilities: ['web', 'api'],  // Optional: capability tags
  category: 'data',              // Optional: category
  repository: 'https://...',     // Optional: source code URL
  documentation: 'https://...',  // Optional: docs URL
  license: 'MIT',                // Optional: SPDX license
  image: 'https://...'           // Optional: icon/image URL
}
```

## Nostr Event Structure (Kind 30000)

Events follow NIP-01 parameterized replaceable event format:

```json
{
  "kind": 30000,
  "pubkey": "<agent_pubkey>",
  "created_at": <timestamp>,
  "tags": [
    ["d", "skill:unique-skill-id"],
    ["name", "Skill Name"],
    ["description", "Description"],
    ["version", "1.0.0"],
    ["input_schema", "{\"type\":\"object\",...}"],
    ["output_schema", "{\"type\":\"object\",...}"],
    ["pricing", "{\"model\":\"per_call\",\"amount\":\"100\",\"currency\":\"sats\"}"],
    ["capabilities", "[\"web\",\"api\"]"],
    ["category", "data"],
    ["repository", "https://..."],
    ["documentation", "https://..."],
    ["license", "MIT"],
    ["agent_id", "my-agent-001"],
    ["agent_name", "My Agent"]
  ],
  "content": "{\"agentId\":\"...\",\"agentName\":\"...\",\"skills\":[...],\"timestamp\":...}",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

## Example

See `examples/nostr-skills/index.html` for a complete browser demo with:
- Skill advertiser configuration
- Skill discovery and search
- Real-time event logging
- Multiple skill management UI

## Public Relays

Default relays used if none specified:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
- `wss://relay.primal.net`
- `wss://nostr.wine`

## License

MIT