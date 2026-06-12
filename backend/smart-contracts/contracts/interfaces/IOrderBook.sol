// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IComputeRegistry.sol";

interface IOrderBook {
    struct Order {
        bytes32 orderId;
        address providerAuthority;
        uint8 side; // 0 = Bid (consumer), 1 = Ask (provider)
        uint256 pricePerRequest;
        uint64 taskType;
        uint256 quantity;
        uint256 filledQuantity;
        uint8 status; // 0 = Open, 1 = PartiallyFilled, 2 = Filled, 3 = Cancelled
        uint256 expiry;
        string modelId; // Optional specific model
        bytes signature; // EIP-712 signature
    }

    enum OrderSide {
        Bid,
        Ask
    }

    enum OrderStatus {
        Open,
        PartiallyFilled,
        Filled,
        Cancelled
    }

    struct Match {
        bytes32 matchId;
        bytes32 bidOrderId;
        bytes32 askOrderId;
        uint256 price;
        uint256 quantity;
        uint256 timestamp;
        address consumer;
        address provider;
    }

    // Events
    event OrderPlaced(bytes32 indexed orderId, address indexed maker, OrderSide side, uint256 price, uint256 quantity, uint64 taskType);
    event OrderCancelled(bytes32 indexed orderId, address indexed maker);
    event OrderFilled(bytes32 indexed orderId, address indexed maker, uint256 filledQuantity);
    event OrdersMatched(bytes32 indexed matchId, bytes32 indexed bidOrderId, bytes32 indexed askOrderId, uint256 price, uint256 quantity, address consumer, address provider);

    // Errors
    error OrderNotFound();
    error OrderNotOpen();
    error InvalidOrderSide();
    error InvalidPrice();
    error InvalidQuantity();
    error OrderExpired();
    error InsufficientBalance();
    error UnauthorizedCancellation();
    error InvalidSignature();
    error DuplicateOrderId();

    // Core functions
    function placeOrder(
        uint8 side,
        uint256 pricePerRequest,
        uint64 taskType,
        uint256 quantity,
        uint256 expiry,
        string calldata modelId,
        bytes calldata signature
    ) external returns (bytes32 orderId);

    function cancelOrder(bytes32 orderId) external;

    function fillOrder(bytes32 orderId, uint256 fillQuantity) external returns (uint256 filledAmount);

    // Matching engine calls this to record matches
    function recordMatch(
        bytes32 bidOrderId,
        bytes32 askOrderId,
        uint256 price,
        uint256 quantity,
        address consumer,
        address provider
    ) external returns (bytes32 matchId);

    // View functions
    function getOrder(bytes32 orderId) external view returns (Order memory);
    function getActiveBids(uint64 taskType, string calldata modelId) external view returns (bytes32[] memory orderIds);
    function getActiveAsks(uint64 taskType, string calldata modelId) external view returns (bytes32[] memory orderIds);
    function getBestBid(uint64 taskType, string calldata modelId) external view returns (Order memory);
    function getBestAsk(uint64 taskType, string calldata modelId) external view returns (Order memory);
    function getMatches(address provider, uint256 startTime) external view returns (Match[] memory);
    function getUserOrders(address user) external view returns (bytes32[] memory orderIds);
}