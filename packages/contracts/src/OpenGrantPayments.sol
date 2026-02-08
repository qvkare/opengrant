// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IOpenGrantPayments } from "./interfaces/IOpenGrantPayments.sol";
import { IPublisherVault } from "./interfaces/IPublisherVault.sol";

// Interface for registry (minimal)
interface IRegistry {
    function getAPIPublisher(bytes32 apiId) external view returns (address);
    function getPublisherVault(address publisher) external view returns (address);
    function incrementAPIStats(bytes32 apiId, uint256 calls, uint256 revenue) external;
}

/**
 * @title OpenGrantPayments
 * @notice Handles payment recording, distribution, and settlement for OpenGrant
 * @dev Integrates with x402 payment verification and routes funds to publisher vaults
 */
contract OpenGrantPayments is
    Ownable,
    Pausable,
    ReentrancyGuard,
    IOpenGrantPayments
{
    using SafeERC20 for IERC20;

    // ============================================
    // STATE VARIABLES
    // ============================================

    // USDC token
    IERC20 public immutable usdc;

    // Registry contract
    IRegistry public registry;

    // Platform fee configuration
    address public platformFeeReceiver;
    uint256 public platformFeeBPS;
    uint256 public constant MAX_FEE_BPS = 1000; // 10% max
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // Payment tracking
    mapping(bytes32 => PaymentRecord) public paymentRecords;
    mapping(address => uint256) public publisherPendingEarnings;
    mapping(bytes32 => bool) public processedX402Hashes;

    // Statistics
    uint256 public totalPaymentsProcessed;
    uint256 public totalPlatformFeesCollected;

    // Authorized callers (API gateway, CRE workflows)
    mapping(address => bool) public authorizedCallers;

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(
        address _usdc,
        address _registry,
        address _platformFeeReceiver,
        uint256 _platformFeeBPS,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0), "OpenGrantPayments: invalid USDC address");
        require(_registry != address(0), "OpenGrantPayments: invalid registry address");
        require(_platformFeeReceiver != address(0), "OpenGrantPayments: invalid fee receiver");
        require(_platformFeeBPS <= MAX_FEE_BPS, "OpenGrantPayments: fee too high");

        usdc = IERC20(_usdc);
        registry = IRegistry(_registry);
        platformFeeReceiver = _platformFeeReceiver;
        platformFeeBPS = _platformFeeBPS;
    }

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyAuthorized() {
        require(
            authorizedCallers[msg.sender] || msg.sender == owner(),
            "OpenGrantPayments: caller not authorized"
        );
        _;
    }

    // ============================================
    // PAYMENT FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function recordPayment(
        bytes32 apiId,
        address consumer,
        uint256 amount,
        bytes32 x402TxHash
    ) external override whenNotPaused onlyAuthorized nonReentrant {
        require(amount > 0, "OpenGrantPayments: amount is zero");
        require(consumer != address(0), "OpenGrantPayments: invalid consumer");
        require(
            !processedX402Hashes[x402TxHash],
            "OpenGrantPayments: payment already processed"
        );

        address publisher = registry.getAPIPublisher(apiId);
        require(publisher != address(0), "OpenGrantPayments: API not found");

        // Mark as processed
        processedX402Hashes[x402TxHash] = true;

        // Create payment record
        paymentRecords[x402TxHash] = PaymentRecord({
            apiId: apiId,
            consumer: consumer,
            amount: amount,
            x402TxHash: x402TxHash,
            timestamp: block.timestamp,
            settled: false
        });

        // Add to pending earnings
        publisherPendingEarnings[publisher] += amount;
        totalPaymentsProcessed++;

        // Update registry stats
        registry.incrementAPIStats(apiId, 1, amount);

        emit PaymentReceived(apiId, consumer, amount, x402TxHash);
    }

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function distributeToVault(
        bytes32 apiId,
        uint256 amount
    ) external override whenNotPaused onlyAuthorized nonReentrant {
        _distributeToVault(apiId, amount);
    }

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function batchDistribute(
        bytes32[] calldata apiIds,
        uint256[] calldata amounts
    ) external override whenNotPaused onlyAuthorized nonReentrant {
        require(
            apiIds.length == amounts.length,
            "OpenGrantPayments: arrays length mismatch"
        );

        uint256 totalPlatformFee = 0;

        for (uint256 i = 0; i < apiIds.length; i++) {
            if (amounts[i] > 0) {
                uint256 platformFee = _distributeToVault(apiIds[i], amounts[i]);
                totalPlatformFee += platformFee;
            }
        }

        emit BatchSettled(apiIds, amounts, totalPlatformFee);
    }

    /**
     * @notice Internal distribution logic
     */
    function _distributeToVault(
        bytes32 apiId,
        uint256 amount
    ) internal returns (uint256 platformFee) {
        address publisher = registry.getAPIPublisher(apiId);
        require(publisher != address(0), "OpenGrantPayments: API not found");

        address vault = registry.getPublisherVault(publisher);
        require(vault != address(0), "OpenGrantPayments: vault not found");

        require(
            publisherPendingEarnings[publisher] >= amount,
            "OpenGrantPayments: insufficient pending earnings"
        );

        // Calculate fees
        platformFee = (amount * platformFeeBPS) / BPS_DENOMINATOR;
        uint256 netAmount = amount - platformFee;

        // Update state
        publisherPendingEarnings[publisher] -= amount;
        totalPlatformFeesCollected += platformFee;

        // Transfer platform fee
        usdc.safeTransfer(platformFeeReceiver, platformFee);

        // Approve and distribute to vault
        usdc.forceApprove(vault, netAmount);
        IPublisherVault(vault).receivePayment(netAmount);

        emit PaymentDistributed(apiId, publisher, amount, platformFee, netAmount);

        return platformFee;
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function getPendingEarnings(
        address publisher
    ) external view override returns (uint256) {
        return publisherPendingEarnings[publisher];
    }

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function getTotalPlatformFees() external view override returns (uint256) {
        return totalPlatformFeesCollected;
    }

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function getPlatformFeeBPS() external view override returns (uint256) {
        return platformFeeBPS;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function setPlatformFee(uint256 newFeeBPS) external override onlyOwner {
        require(newFeeBPS <= MAX_FEE_BPS, "OpenGrantPayments: fee too high");

        uint256 oldFee = platformFeeBPS;
        platformFeeBPS = newFeeBPS;

        emit PlatformFeeUpdated(oldFee, newFeeBPS);
    }

    /**
     * @inheritdoc IOpenGrantPayments
     */
    function setPlatformFeeReceiver(
        address newReceiver
    ) external override onlyOwner {
        require(newReceiver != address(0), "OpenGrantPayments: invalid receiver");

        address oldReceiver = platformFeeReceiver;
        platformFeeReceiver = newReceiver;

        emit PlatformFeeReceiverUpdated(oldReceiver, newReceiver);
    }

    /**
     * @notice Set authorized caller
     * @param caller Address to authorize
     * @param authorized Whether to authorize or revoke
     */
    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Update registry address
     * @param _registry New registry address
     */
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "OpenGrantPayments: invalid registry");
        registry = IRegistry(_registry);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw (owner only)
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     * @param to Recipient
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        require(to != address(0), "OpenGrantPayments: invalid recipient");
        require(token != address(usdc), "OpenGrantPayments: cannot withdraw USDC");
        IERC20(token).safeTransfer(to, amount);
    }
}
