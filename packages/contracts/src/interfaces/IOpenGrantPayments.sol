// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IOpenGrantPayments
 * @notice Interface for the OpenGrant Payments contract
 */
interface IOpenGrantPayments {
    // ============================================
    // STRUCTS
    // ============================================

    struct PaymentRecord {
        bytes32 apiId;
        address consumer;
        uint256 amount;
        bytes32 x402TxHash;
        uint256 timestamp;
        bool settled;
    }

    // ============================================
    // EVENTS
    // ============================================

    event PaymentReceived(
        bytes32 indexed apiId,
        address indexed consumer,
        uint256 amount,
        bytes32 x402TxHash
    );

    event PaymentDistributed(
        bytes32 indexed apiId,
        address indexed publisher,
        uint256 grossAmount,
        uint256 platformFee,
        uint256 netAmount
    );

    event BatchSettled(
        bytes32[] apiIds,
        uint256[] amounts,
        uint256 totalPlatformFee
    );

    event WithdrawalProcessed(
        address indexed publisher,
        uint256 amount,
        address destination
    );

    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);

    event PlatformFeeReceiverUpdated(
        address oldReceiver,
        address newReceiver
    );

    // ============================================
    // FUNCTIONS
    // ============================================

    /**
     * @notice Record a payment for an API call (called after x402 verification)
     * @param apiId The API that was called
     * @param consumer The wallet that made the payment
     * @param amount The payment amount in USDC (6 decimals)
     * @param x402TxHash The x402 transaction hash for verification
     */
    function recordPayment(
        bytes32 apiId,
        address consumer,
        uint256 amount,
        bytes32 x402TxHash
    ) external;

    /**
     * @notice Distribute payment to publisher vault
     * @param apiId The API to distribute payments for
     * @param amount The amount to distribute
     */
    function distributeToVault(bytes32 apiId, uint256 amount) external;

    /**
     * @notice Batch distribute payments to multiple vaults
     * @param apiIds Array of API IDs
     * @param amounts Array of amounts to distribute
     */
    function batchDistribute(
        bytes32[] calldata apiIds,
        uint256[] calldata amounts
    ) external;

    /**
     * @notice Get pending (unsettled) earnings for a publisher
     * @param publisher The publisher address
     * @return Total pending earnings
     */
    function getPendingEarnings(
        address publisher
    ) external view returns (uint256);

    /**
     * @notice Get total platform fees collected
     * @return Total fees collected
     */
    function getTotalPlatformFees() external view returns (uint256);

    /**
     * @notice Get the current platform fee in basis points
     * @return Fee in basis points (e.g., 250 = 2.5%)
     */
    function getPlatformFeeBPS() external view returns (uint256);

    /**
     * @notice Update platform fee (admin only)
     * @param newFeeBPS New fee in basis points
     */
    function setPlatformFee(uint256 newFeeBPS) external;

    /**
     * @notice Update platform fee receiver (admin only)
     * @param newReceiver New receiver address
     */
    function setPlatformFeeReceiver(address newReceiver) external;
}
