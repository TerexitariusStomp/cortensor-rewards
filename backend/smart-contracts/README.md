# Decentralized Compute Marketplace Smart Contracts

A Foundry-based smart contract suite for a decentralized compute marketplace implementing:

- **ComputeRegistry**: Provider registration, metadata, staking, and status management
- **OrderBook**: On-chain order book mirror for limit orders and matchmaking
- **EscrowVault**: Job escrow with hold/release funds, dispute window, and state machine
- **Reputation**: Reputation scoring with job tracking, ratings anchoring, and slashing

## Contracts

| Contract | Description |
|----------|-------------|
| `ComputeRegistry` | Provider registry with staking, metadata, and status management |
| `OrderBook` | On-chain order book mirror for limit orders and matchmaking |
| `EscrowVault` | Job escrow with hold/release funds, dispute window, and state machine |
| `Reputation` | Reputation scoring with job tracking, ratings anchoring, and slashing |

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation.html)

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Test with Gas Reports

```shell
$ forge test --gas-report
```

### Fuzz Tests

```shell
$ forge test --match-contract OrderBookFuzzTest
```

### Format

```shell
$ forge fmt
```

### Anvil (Local Testnet)

```shell
$ anvil
```

### Deploy to Local Anvil

```shell
# Terminal 1: Start Anvil
$ anvil

# Terminal 2: Deploy
$ forge script script/DeployMarketplace.s.sol:DeployMarketplace --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
```

### Deploy to Testnet (Sepolia)

```shell
$ forge script script/DeployMarketplace.s.sol:DeployMarketplace --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY --sig "runSepolia()"
```

## Architecture

The contracts implement the core on-chain components from the decentralized compute marketplace architecture:

1. **ComputeRegistry** (`contracts/ComputeRegistry.sol`)
   - Provider registration with peer ID, pricing tiers, and minimum stake
   - Provider status management (Active, Paused, Slashed)
   - Stake deposit/withdrawal

2. **OrderBook** (`contracts/OrderBook.sol`)
   - Limit orders (Bids from consumers, Asks from providers)
   - Price-time priority matching
   - Best bid/ask queries

3. **EscrowVault** (`contracts/EscrowVault.sol`)
   - Job lifecycle: Pending → Assigned → InProgress → ProviderDone → ConsumerConfirmWindow → Settled
   - Dispute resolution with evidence
   - Timeout-based refunds
   - Protocol fee collection

4. **Reputation** (`contracts/Reputation.sol`)
   - Provider reputation scoring (jobs completed, disputed, slashed, earnings)
   - Consumer reputation tracking
   - Off-chain ratings anchoring via IPFS CID

## Testing

### Unit Tests

- `ComputeRegistryTest`: 8 tests covering registration, updates, stake management, slashing
- `OrderBookTest`: 7 tests covering order placement, cancellation, filling, matching
- `EscrowVaultTest`: 8 tests covering job lifecycle, disputes, settlements
- `ReputationTest`: 6 tests covering score calculation, job recording, ratings

### Fuzz Tests

- `OrderBookFuzzTest`: 3 fuzz tests for matching logic
  - Best bid is highest price
  - Match price between bid and ask
  - Fill quantity never exceeds remaining

Total: **34 tests passing**

## Configuration

### Constructor Arguments

| Contract | Arguments |
|----------|-----------|
| ComputeRegistry | `owner`, `feeRecipient`, `minimumStake` |
| Reputation | `owner`, `computeRegistry`, `escrowVault` |
| EscrowVault | `computeRegistry`, `reputation`, `owner`, `protocolFeeRecipient` |
| OrderBook | `computeRegistry`, `owner` |

### Constants

- `MIN_TPS = 1` - Minimum transactions per second
- `MAX_CONTEXT_TOKENS = 100,000` - Maximum context tokens
- `MIN_PRICE = 1` - Minimum order price (wei)
- `MAX_EXPIRY = 365 days` - Maximum order expiry
- `JOB_TIMEOUT = 600` - Job timeout (10 minutes)
- `CONFIRM_WINDOW = 300` - Consumer confirm window (5 minutes)
- `MIN_AMOUNT = 1000` - Minimum job amount (wei)
- `PROTOCOL_FEE_BPS = 100` - Protocol fee (1%)

## Verification

After deployment to testnet, verify contracts:

```shell
# ComputeRegistry
$ forge verify-contract <ADDRESS> contracts/ComputeRegistry.sol:ComputeRegistry --chain-id 11155111 --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,uint256)" <owner> <feeRecipient> <minimumStake>)

# Reputation
$ forge verify-contract <ADDRESS> contracts/Reputation.sol:Reputation --chain-id 11155111 --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,address)" <owner> <computeRegistry> <escrowVault>)

# EscrowVault
$ forge verify-contract <ADDRESS> contracts/EscrowVault.sol:EscrowVault --chain-id 11155111 --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,address,address)" <computeRegistry> <reputation> <owner> <protocolFeeRecipient>)

# OrderBook
$ forge verify-contract <ADDRESS> contracts/OrderBook.sol:OrderBook --chain-id 11155111 --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address,address)" <computeRegistry> <owner>)
```

## License

MIT
