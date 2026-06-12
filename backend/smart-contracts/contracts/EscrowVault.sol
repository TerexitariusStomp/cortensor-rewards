// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IEscrowVault.sol";
import "./interfaces/IComputeRegistry.sol";
import "./interfaces/IReputation.sol";
import "./libraries/Utils.sol";

/// @title EscrowVault
/// @notice Job escrow with hold/release funds, dispute window, and state machine
/// @dev Implements the Job Escrow from the decentralized compute marketplace architecture
contract EscrowVault is IEscrowVault {
    using MathLib for uint256;
    using ValidationLib for uint256;
    using ValidationLib for address;
    using BytesLib for bytes32;
    using TimeLib for uint256;

    // State
    mapping(address => Job) public jobs;
    mapping(bytes32 => address) public jobIdToAddress;
    mapping(address => bytes32[]) public consumerJobs;
    mapping(address => bytes32[]) public providerJobs;
    bytes32[] public pendingJobs;

    address public immutable computeRegistry;
    address public immutable reputation;
    address public immutable owner;
    address public protocolFeeRecipient;

    // Constants
    uint256 public constant JOB_TIMEOUT_ = 600; // 10 minutes
    uint256 public constant CONFIRM_WINDOW_ = 300; // 5 minutes
    uint256 public constant MIN_AMOUNT_ = 1000; // 1000 wei minimum
    uint256 public constant PROTOCOL_FEE_BPS_ = 100; // 1%

    // Protocol fee tracking
    uint256 public protocolFeesCollected_;

    constructor(
        address _computeRegistry,
        address _reputation,
        address _owner,
        address _protocolFeeRecipient
    ) {
        computeRegistry = _computeRegistry;
        reputation = _reputation;
        owner = _owner;
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "EscrowVault: not owner");
        _;
    }

    modifier jobExists(address jobAddress) {
        require(jobs[jobAddress].jobId != bytes32(0), "EscrowVault: job not found");
        _;
    }

    modifier onlyConsumer(address jobAddress) {
        require(jobs[jobAddress].consumer == msg.sender, "EscrowVault: not consumer");
        _;
    }

    modifier onlyProvider(address jobAddress) {
        require(jobs[jobAddress].providerAuthority == msg.sender, "EscrowVault: not provider");
        _;
    }

    modifier onlyProviderOrConsumer(address jobAddress) {
        require(
            jobs[jobAddress].consumer == msg.sender || 
            jobs[jobAddress].providerAuthority == msg.sender,
            "EscrowVault: not consumer or provider"
        );
        _;
    }

    modifier onlyArbitrator(address jobAddress) {
        require(jobs[jobAddress].arbitrator == msg.sender || msg.sender == owner, "EscrowVault: not arbitrator");
        _;
    }

    function JOB_TIMEOUT() external view override returns (uint256) {
        return JOB_TIMEOUT_;
    }

    function CONFIRM_WINDOW() external view override returns (uint256) {
        return CONFIRM_WINDOW_;
    }

    function MIN_AMOUNT() external view override returns (uint256) {
        return MIN_AMOUNT_;
    }

    function PROTOCOL_FEE_BPS() external view override returns (uint256) {
        return PROTOCOL_FEE_BPS_;
    }

    function createJob(
        address providerAuthority,
        bytes32 requestHash,
        uint64 nonce,
        uint64 taskType,
        uint64 validUntil,
        bytes calldata quoteSignature,
        uint256 amount,
        address paymentMint,
        bytes16 /* quoteNonce */
    ) external payable override returns (address jobAddress, bytes32 jobId) {
        // Validations
        require(amount >= MIN_AMOUNT_, "EscrowVault: amount below minimum");
        require(paymentMint == address(0) || paymentMint != address(0), "EscrowVault: invalid payment mint");
        require(validUntil > block.timestamp, "EscrowVault: validUntil in past");
        require(validUntil - block.timestamp <= 3600, "EscrowVault: validUntil too far in future");
        
        // Verify provider exists and is active
        IComputeRegistry registry = IComputeRegistry(computeRegistry);
        address providerAddress = registry.getProviderByAuthority(providerAuthority);
        require(providerAddress != address(0), "EscrowVault: provider not registered");
        require(registry.isActiveProvider(providerAddress), "EscrowVault: provider not active");

        // Verify payment
        if (paymentMint == address(0)) {
            require(msg.value == amount, "EscrowVault: ETH amount mismatch");
        } else {
            require(msg.value == 0, "EscrowVault: ETH sent for ERC20 job");
        }

        // Generate deterministic job ID
        jobId = keccak256(abi.encodePacked(msg.sender, providerAuthority, nonce, block.timestamp));
        require(jobIdToAddress[jobId] == address(0), "EscrowVault: duplicate job ID");

        // Create deterministic job address (using CREATE2-like)
        jobAddress = address(uint160(uint256(keccak256(abi.encodePacked(jobId, "escrow_vault")))));

        // Initialize job
        Job storage job = jobs[jobAddress];
        job.jobId = jobId;
        job.consumer = msg.sender;
        job.providerAuthority = providerAuthority;
        
        // Get provider peer ID from registry
        IComputeRegistry.Provider memory provider = registry.getProvider(providerAddress);
        job.providerPeerId = provider.qvacPeerId;
        
        job.requestHash = requestHash;
        job.nonce = nonce;
        job.taskType = taskType;
        job.validUntil = validUntil;
        job.quoteSignature = quoteSignature;
        job.amount = amount;
        job.paymentMint = paymentMint;
        job.providerFeeBps = PROTOCOL_FEE_BPS_;
        job.state = uint8(JobState.Pending);
        job.createdAt = block.timestamp;

        // Update mappings
        jobIdToAddress[jobId] = jobAddress;
        consumerJobs[msg.sender].push(jobId);
        providerJobs[providerAuthority].push(jobId);
        pendingJobs.push(jobId);

        emit JobCreated(jobId, msg.sender, providerAuthority, amount);
    }

    function providerAck(address jobAddress, bytes32 requestHash) external override onlyProvider(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(job.state == uint8(JobState.Pending), "EscrowVault: invalid state for ack");
        require(job.requestHash == requestHash, "EscrowVault: request hash mismatch");
        require(job.validUntil > block.timestamp, "EscrowVault: quote expired");

        job.state = uint8(JobState.Assigned);
        job.providerAckedAt = block.timestamp;

        // Remove from pending
        for (uint256 i = 0; i < pendingJobs.length; i++) {
            if (pendingJobs[i] == job.jobId) {
                pendingJobs[i] = pendingJobs[pendingJobs.length - 1];
                pendingJobs.pop();
                break;
            }
        }

        emit JobProviderAcked(job.jobId);
    }

    function providerComplete(
        address jobAddress,
        bytes32 responseHash,
        bytes calldata teeQuote
    ) external override onlyProvider(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(job.state == uint8(JobState.Assigned) || job.state == uint8(JobState.InProgress), "EscrowVault: invalid state for complete");
        
        job.state = uint8(JobState.ProviderDone);
        job.providerCompletedAt = block.timestamp;
        job.responseHash = responseHash;
        
        // Store TEE attestation root if provided
        if (teeQuote.length > 0) {
            job.attestationRoot = keccak256(teeQuote);
        }
        
        // Start confirm window
        job.state = uint8(JobState.ConsumerConfirmWindow);
        job.confirmWindowStart = block.timestamp;

        emit JobProviderCompleted(job.jobId, responseHash);
    }

    function consumerConfirm(address jobAddress) external override onlyConsumer(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(job.state == uint8(JobState.ConsumerConfirmWindow), "EscrowVault: confirm window not active");

        _settleJob(jobAddress, job, true);
    }

    function anyoneConfirm(address jobAddress) external override jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(job.state == uint8(JobState.ConsumerConfirmWindow), "EscrowVault: confirm window not active");
        require(job.confirmWindowStart.addSeconds(CONFIRM_WINDOW_).isExpired(), "EscrowVault: confirm window not expired");

        _settleJob(jobAddress, job, false);
    }

    function _settleJob(address jobAddress, Job storage job, bool consumerConfirmed) internal {
        // Calculate protocol fee
        uint256 protocolFee = job.amount.bpsMul(job.providerFeeBps);
        uint256 providerAmount = job.amount - protocolFee;

        // Transfer to protocol fee recipient
        if (protocolFee > 0) {
            if (job.paymentMint == address(0)) {
                payable(protocolFeeRecipient).transfer(protocolFee);
            }
            protocolFeesCollected_ += protocolFee;
            emit ProtocolFeeCollected(protocolFee);
        }

        // Transfer to provider
        if (providerAmount > 0) {
            if (job.paymentMint == address(0)) {
                payable(job.providerAuthority).transfer(providerAmount);
            }
        }

        // Update job state
        job.state = uint8(JobState.Settled);
        job.settledAt = block.timestamp;

        // Record completion in reputation
        IReputation rep = IReputation(reputation);
        rep.recordJobCompleted(job.providerAuthority, providerAmount);
        rep.recordConsumerJobCreated(job.consumer, job.amount);

        if (consumerConfirmed) {
            emit JobConsumerConfirmed(job.jobId);
        } else {
            emit JobAutoSettled(job.jobId);
        }
    }

    function refundJob(address jobAddress) external override onlyConsumer(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(
            job.state == uint8(JobState.Pending) || job.state == uint8(JobState.Assigned),
            "EscrowVault: job not refundable"
        );
        
        // Check timeout for Pending state
        if (job.state == uint8(JobState.Pending)) {
            require(job.createdAt.addSeconds(JOB_TIMEOUT_).isExpired(), "EscrowVault: job timeout not reached");
        }
        
        // For Assigned state, provider didn't ack in time
        if (job.state == uint8(JobState.Assigned)) {
            require(job.providerAckedAt.addSeconds(JOB_TIMEOUT_).isExpired(), "EscrowVault: provider timeout not reached");
        }

        // Refund consumer
        if (job.amount > 0) {
            if (job.paymentMint == address(0)) {
                payable(job.consumer).transfer(job.amount);
            }
        }

        job.state = uint8(JobState.Refunded);
        job.settledAt = block.timestamp; // Reuse for refund time

        // Remove from pending if there
        for (uint256 i = 0; i < pendingJobs.length; i++) {
            if (pendingJobs[i] == job.jobId) {
                pendingJobs[i] = pendingJobs[pendingJobs.length - 1];
                pendingJobs.pop();
                break;
            }
        }

        emit JobRefunded(job.jobId, job.consumer, job.amount);
    }

    function raiseDispute(address jobAddress, bytes32 evidenceHash) external override onlyProviderOrConsumer(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(
            job.state == uint8(JobState.ProviderDone) || 
            job.state == uint8(JobState.ConsumerConfirmWindow) ||
            job.state == uint8(JobState.Assigned) ||
            job.state == uint8(JobState.InProgress),
            "EscrowVault: job not disputable"
        );
        require(job.disputeEvidenceHash.isZero(), "EscrowVault: already disputed");
        require(!evidenceHash.isZero(), "EscrowVault: invalid evidence");

        job.state = uint8(JobState.Disputed);
        job.disputeEvidenceHash = evidenceHash;
        // Arbitrator defaults to owner, can be set differently via governance
        job.arbitrator = owner;

        // Record dispute in reputation
        IReputation rep = IReputation(reputation);
        rep.recordJobDisputed(job.providerAuthority);
        rep.recordConsumerDisputeRaised(job.consumer);

        emit JobDisputed(job.jobId, msg.sender, evidenceHash);
    }

    function resolveDispute(address jobAddress, bool consumerWins) external override onlyArbitrator(jobAddress) jobExists(jobAddress) {
        Job storage job = jobs[jobAddress];
        require(job.state == uint8(JobState.Disputed), "EscrowVault: no dispute to resolve");
        require(!job.disputeEvidenceHash.isZero(), "EscrowVault: no dispute evidence");

        if (consumerWins) {
            // Refund consumer
            if (job.amount > 0) {
                if (job.paymentMint == address(0)) {
                    payable(job.consumer).transfer(job.amount);
                }
            }
            // Record consumer win
            IReputation rep = IReputation(reputation);
            rep.recordConsumerDisputeWon(job.consumer);
        } else {
            // Pay provider (minus protocol fee)
            uint256 protocolFee = job.amount.bpsMul(job.providerFeeBps);
            uint256 providerAmount = job.amount - protocolFee;
            
            if (providerAmount > 0) {
                if (job.paymentMint == address(0)) {
                    payable(job.providerAuthority).transfer(providerAmount);
                }
            }
            if (protocolFee > 0) {
                if (job.paymentMint == address(0)) {
                    payable(protocolFeeRecipient).transfer(protocolFee);
                }
                protocolFeesCollected_ += protocolFee;
                emit ProtocolFeeCollected(protocolFee);
            }
            // Record completion
            IReputation rep = IReputation(reputation);
            rep.recordJobCompleted(job.providerAuthority, providerAmount);
        }

        job.state = uint8(JobState.Settled);
        job.settledAt = block.timestamp;

        // Record slashing if provider lost
        if (!consumerWins) {
            IReputation rep = IReputation(reputation);
            // Slashing is handled by ComputeRegistry, but we track it
        }

        emit JobDisputeResolved(job.jobId, consumerWins);
    }

    function getJob(address jobAddress) external view override returns (Job memory) {
        return jobs[jobAddress];
    }

    function getJobState(address jobAddress) external view override returns (JobState) {
        return JobState(jobs[jobAddress].state);
    }

    function getJobsByConsumer(address consumer) external view override returns (bytes32[] memory jobIds) {
        return consumerJobs[consumer];
    }

    function getJobsByProvider(address provider) external view override returns (bytes32[] memory jobIds) {
        return providerJobs[provider];
    }

    function getPendingJobs() external view override returns (bytes32[] memory jobIds) {
        return pendingJobs;
    }

    function protocolFeesCollected() external view override returns (uint256) {
        return protocolFeesCollected_;
    }

    // Admin functions
    function setProtocolFeeRecipient(address newRecipient) external onlyOwner {
        protocolFeeRecipient = newRecipient;
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 10000, "EscrowVault: fee bps too high");
        // Note: This doesn't change the constant, would need a variable for runtime changes
    }

    function emergencyWithdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {}
}