// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MathLib {
    /// @notice Safe multiplication with overflow check
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 c = a * b;
        require(c / a == b, "MathLib: multiplication overflow");
        return c;
    }

    /// @notice Safe division with zero check
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "MathLib: division by zero");
        return a / b;
    }

    /// @notice Percentage calculation (a * b / 10000)
    function bpsMul(uint256 a, uint256 bps) internal pure returns (uint256) {
        return div(mul(a, bps), 10000);
    }

    /// @notice Safe addition
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "MathLib: addition overflow");
        return c;
    }

    /// @notice Safe subtraction
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(a >= b, "MathLib: subtraction underflow");
        return a - b;
    }
}

library BytesLib {
    /// @notice Check if bytes32 is zero
    function isZero(bytes32 value) internal pure returns (bool) {
        return value == bytes32(0);
    }

    /// @notice Concatenate two bytes32 values
    function concat(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b));
    }

    /// @notice Generate a deterministic ID from multiple inputs
    function generateId(bytes32 a, bytes32 b, bytes32 c) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b, c));
    }

    /// @notice Check if bytes has length
    function hasLength(bytes memory data, uint256 length) internal pure returns (bool) {
        return data.length == length;
    }
}

library TimeLib {
    /// @notice Get current block timestamp
    function currentTimestamp() internal view returns (uint256) {
        return block.timestamp;
    }

    /// @notice Check if timestamp has expired
    function isExpired(uint256 expiry) internal view returns (bool) {
        return block.timestamp >= expiry;
    }

    /// @notice Check if timestamp is in the future
    function isFuture(uint256 timestamp) internal view returns (bool) {
        return block.timestamp < timestamp;
    }

    /// @notice Add seconds to timestamp
    function addSeconds(uint256 self, uint256 seconds_) internal pure returns (uint256) {
        return self + seconds_;
    }
}

library ValidationLib {
    using MathLib for uint256;

    /// @notice Validate price is above minimum
    function validatePrice(uint256 price, uint256 minPrice) internal pure {
        require(price >= minPrice, "ValidationLib: price below minimum");
    }

    /// @notice Validate quantity is positive
    function validateQuantity(uint256 quantity) internal pure {
        require(quantity > 0, "ValidationLib: quantity must be positive");
    }

    /// @notice Validate basis points (0-10000)
    function validateBps(uint256 bps) internal pure {
        require(bps <= 10000, "ValidationLib: bps exceeds 10000");
    }

    /// @notice Validate non-zero address
    function validateAddress(address addr) internal pure {
        require(addr != address(0), "ValidationLib: zero address");
    }

    /// @notice Validate string is not empty
    function validateString(string memory str) internal pure {
        require(bytes(str).length > 0, "ValidationLib: empty string");
    }

    /// @notice Validate task type is within range
    function validateTaskType(uint64 taskType) internal pure {
        require(taskType <= 4, "ValidationLib: invalid task type"); // 0-4 per spec
    }
}