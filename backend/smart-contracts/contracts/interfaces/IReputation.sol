// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IComputeRegistry.sol";

interface IReputation {
    struct ReputationEntry {
        address providerAuthority;
        uint64 jobsCompleted;
        uint64 jobsDisputed;
        uint64 jobsSlashed;
        uint256 totalEarned;
        uint256 totalStaked;
        bytes32 ratingsCID;
        uint256 lastUpdate;
    }

    struct ConsumerReputation {
        address consumer;
        uint64 jobsCreated;
        uint256 totalSpent;
        uint64 disputesRaised;
        uint64 disputesWon;
    }

    // Events
    event JobCompleted(address indexed provider, uint256 amount);
    event JobDisputed(address indexed provider);
    event JobSlashed(address indexed provider);
    event RatingsAnchored(address indexed provider, bytes32 ratingsCID);
    event ConsumerJobCreated(address indexed consumer, uint256 amount);
    event ConsumerDisputeRaised(address indexed consumer);
    event ConsumerDisputeWon(address indexed consumer);

    // Errors
    error ProviderNotFound();
    error ConsumerNotFound();
    error UnauthorizedCaller();
    error InvalidRatingsCID();

    // Core functions
    function recordJobCompleted(address providerAuthority, uint256 amount) external;

    function recordJobDisputed(address providerAuthority) external;

    function recordJobSlashed(address providerAuthority) external;

    function anchorRatings(address providerAuthority, bytes32 ratingsCID) external;

    function recordConsumerJobCreated(address consumer, uint256 amount) external;

    function recordConsumerDisputeRaised(address consumer) external;

    function recordConsumerDisputeWon(address consumer) external;

    // View functions
    function getProviderReputation(address providerAuthority) external view returns (ReputationEntry memory);
    function getConsumerReputation(address consumer) external view returns (ConsumerReputation memory);
    function calculateReputationScore(address providerAuthority) external view returns (uint256 score);
    function getProviderReputationRank(address providerAuthority) external view returns (uint256 rank);
}