// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrowVault {
    struct Job {
        bytes32 jobId;
        address consumer;
        address providerAuthority;
        bytes32 providerPeerId;
        bytes32 requestHash;
        uint64 nonce;
        uint64 taskType;
        uint64 validUntil;
        bytes quoteSignature;
        uint256 amount;
        address paymentMint;
        uint256 providerFeeBps;
        uint8 state;
        uint256 createdAt;
        uint256 providerAckedAt;
        uint256 providerCompletedAt;
        uint256 confirmWindowStart;
        uint256 settledAt;
        bytes32 responseHash;
        bytes32 attestationRoot;
        bytes32 disputeEvidenceHash;
        address arbitrator;
    }

    enum JobState {
        Pending,
        Assigned,
        InProgress,
        ProviderDone,
        ConsumerConfirmWindow,
        Settled,
        Refunded,
        Disputed
    }

    // Events
    event JobCreated(bytes32 indexed jobId, address indexed consumer, address indexed provider, uint256 amount);
    event JobProviderAcked(bytes32 indexed jobId);
    event JobProviderCompleted(bytes32 indexed jobId, bytes32 responseHash);
    event JobConsumerConfirmed(bytes32 indexed jobId);
    event JobAutoSettled(bytes32 indexed jobId);
    event JobRefunded(bytes32 indexed jobId, address indexed consumer, uint256 amount);
    event JobDisputed(bytes32 indexed jobId, address indexed disputer, bytes32 evidenceHash);
    event JobDisputeResolved(bytes32 indexed jobId, bool consumerWins);
    event ProtocolFeeCollected(uint256 amount);

    // Errors
    error JobNotFound();
    error InvalidJobState();
    error UnauthorizedCaller();
    error JobExpired();
    error ConfirmWindowActive();
    error ConfirmWindowExpired();
    error InsufficientFunds();
    error InvalidPaymentMint();
    error AmountBelowMinimum();
    error InvalidFeeBps();
    error AlreadyDisputed();
    error NoDisputeToResolve();
    error InvalidArbitrator();

    // Constants
    function JOB_TIMEOUT() external view returns (uint256);
    function CONFIRM_WINDOW() external view returns (uint256);
    function MIN_AMOUNT() external view returns (uint256);
    function PROTOCOL_FEE_BPS() external view returns (uint256);

    // Core functions
    function createJob(
        address providerAuthority,
        bytes32 requestHash,
        uint64 nonce,
        uint64 taskType,
        uint64 validUntil,
        bytes calldata quoteSignature,
        uint256 amount,
        address paymentMint,
        bytes16 quoteNonce
    ) external payable returns (address jobAddress, bytes32 jobId);

    function providerAck(address jobAddress, bytes32 requestHash) external;

    function providerComplete(
        address jobAddress,
        bytes32 responseHash,
        bytes calldata teeQuote
    ) external;

    function consumerConfirm(address jobAddress) external;

    function anyoneConfirm(address jobAddress) external;

    function refundJob(address jobAddress) external;

    function raiseDispute(address jobAddress, bytes32 evidenceHash) external;

    function resolveDispute(address jobAddress, bool consumerWins) external;

    // View functions
    function getJob(address jobAddress) external view returns (Job memory);
    function getJobState(address jobAddress) external view returns (JobState);
    function getJobsByConsumer(address consumer) external view returns (bytes32[] memory jobIds);
    function getJobsByProvider(address provider) external view returns (bytes32[] memory jobIds);
    function getPendingJobs() external view returns (bytes32[] memory jobIds);
    function protocolFeesCollected() external view returns (uint256);
}