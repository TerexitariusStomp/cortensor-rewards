// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IComputeRegistry {
    struct Provider {
        address authority;
        bytes32 qvacPeerId;
        string name;
        uint16 taskTypes;
        PricingTier[] tiers;
        uint64 jobsCompleted;
        uint256 totalEarned;
        uint256 totalStaked;
        uint8 status;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    struct PricingTier {
        string modelId;
        uint256 pricePerRequest;
        uint256 minTPS;
        uint256 maxContextTokens;
    }

    enum ProviderStatus {
        Unregistered,
        Active,
        Paused,
        Slashed
    }

    // Events
    event ProviderRegistered(address indexed authority, bytes32 indexed qvacPeerId, string name);
    event ProviderUpdated(address indexed authority, string name, uint16 taskTypes, PricingTier[] tiers);
    event PeerIdRotated(address indexed authority, bytes32 oldPeerId, bytes32 newPeerId);
    event ProviderPaused(address indexed authority);
    event ProviderResumed(address indexed authority);
    event ProviderSlashed(address indexed authority, bytes proof);
    event StakeDeposited(address indexed authority, uint256 amount);
    event StakeWithdrawn(address indexed authority, uint256 amount);

    // Errors
    error NotAuthorized();
    error ProviderNotFound();
    error ProviderAlreadyRegistered();
    error InvalidTaskTypes();
    error InvalidPricingTier();
    error InsufficientStake();
    error AlreadySlashed();
    error InvalidStatusTransition();

    // Core functions
    function registerProvider(
        bytes32 qvacPeerId,
        string calldata name,
        uint16 taskTypes,
        PricingTier[] calldata tiers,
        uint256 stakeAmount
    ) external payable returns (address providerAddress);

    function updateProvider(
        address providerAddress,
        string calldata name,
        uint16 taskTypes,
        PricingTier[] calldata tiers
    ) external;

    function rotatePeerId(address providerAddress, bytes32 newQvacPeerId) external;

    function pauseProvider(address providerAddress) external;
    function resumeProvider(address providerAddress) external;

    function slashProvider(address providerAddress, bytes calldata proof) external;

    function depositStake(address providerAddress) external payable;
    function withdrawStake(address providerAddress, uint256 amount) external;

    // View functions
    function getProvider(address providerAddress) external view returns (Provider memory);
    function getProviderByAuthority(address authority) external view returns (address providerAddress);
    function getProviderByPeerId(bytes32 qvacPeerId) external view returns (address providerAddress);
    function getProviderStatus(address providerAddress) external view returns (ProviderStatus);
    function isActiveProvider(address providerAddress) external view returns (bool);
    function getStake(address providerAddress) external view returns (uint256);
    function minimumStake() external view returns (uint256);
}