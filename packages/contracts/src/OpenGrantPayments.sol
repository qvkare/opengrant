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

// Interface for fee discount oracle
interface IFeeDiscountOracle {
    function getEffectiveFeeBPS(address user) external view returns (uint256);
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
    uint256 public constant MAX_BATCH_SIZE = 100;

    // Payment tracking
    mapping(bytes32 => PaymentRecord) public paymentRecords;
    mapping(address => uint256) public publisherPendingEarnings;
    mapping(bytes32 => bool) public processedX402Hashes;

    // Global pending earnings tracker (sum of all publisherPendingEarnings)
    // Used to verify contract USDC balance covers all recorded payments
    uint256 public totalPendingEarnings;

    // Per-publisher cumulative accounting (audit trail)
    mapping(address => uint256) public publisherTotalDeposited;    // USDC deposited via recordPaymentWithDeposit
    mapping(address => uint256) public publisherTotalDistributed;  // USDC distributed to vaults

    // x402TxHash → recorded amount (for off-chain consistency verification)
    mapping(bytes32 => uint256) public processedX402Amounts;

    // Legacy recordPayment disabled by default — use recordPaymentWithDeposit for atomic deposits.
    // When disabled, only recordPaymentWithDeposit (which atomically pulls USDC from caller) is allowed,
    // eliminating per-publisher cross-subsidy risk. Admin can re-enable for backward compatibility.
    bool public legacyRecordPaymentEnabled;

    // Statistics
    uint256 public totalPaymentsProcessed;
    uint256 public totalPlatformFeesCollected;

    // Authorized callers (API gateway, CRE workflows)
    mapping(address => bool) public authorizedCallers;

    // Fee discount oracle (reads GRANT staking tiers)
    IFeeDiscountOracle public feeDiscountOracle;

    // Staking reward pool (receives 30% of platform fees)
    address public stakingRewardPool;

    // Staker reward split (in BPS, default 3000 = 30%)
    uint256 public stakerSplitBPS = 3000;
    uint256 public constant MAX_STAKER_SPLIT_BPS = 5000; // Max 50%

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
     * @dev DEPRECATED: Use recordPaymentWithDeposit for atomic per-publisher deposits.
     *      This function is disabled by default. Enable via setLegacyRecordPayment(true).
     *      When enabled, USDC must already be in the contract. Global balance proof is checked
     *      but per-publisher solvency is NOT enforced — cross-subsidy risk exists.
     */
    function recordPayment(
        bytes32 apiId,
        address consumer,
        uint256 amount,
        bytes32 x402TxHash
    ) external override whenNotPaused onlyAuthorized nonReentrant {
        require(
            legacyRecordPaymentEnabled,
            "OpenGrantPayments: deprecated, use recordPaymentWithDeposit"
        );
        require(amount > 0, "OpenGrantPayments: amount is zero");
        require(consumer != address(0), "OpenGrantPayments: invalid consumer");
        require(
            !processedX402Hashes[x402TxHash],
            "OpenGrantPayments: payment already processed"
        );

        address publisher = registry.getAPIPublisher(apiId);
        require(publisher != address(0), "OpenGrantPayments: API not found");

        // Mark as processed with amount binding
        processedX402Hashes[x402TxHash] = true;
        processedX402Amounts[x402TxHash] = amount;

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
        totalPendingEarnings += amount;
        totalPaymentsProcessed++;

        // Balance proof: contract must hold enough USDC to cover all pending earnings
        require(
            usdc.balanceOf(address(this)) >= totalPendingEarnings,
            "OpenGrantPayments: recorded amount exceeds contract balance"
        );

        // Update registry stats
        registry.incrementAPIStats(apiId, 1, amount);

        emit PaymentReceived(apiId, consumer, amount, x402TxHash);
        emit X402AmountBound(x402TxHash, amount);
    }

    /**
     * @notice Emitted when an x402 transaction hash is bound to a specific amount
     * @dev Provides on-chain observability for hash→amount mapping, enabling
     *      off-chain systems to verify payment consistency without reading storage.
     */
    event X402AmountBound(bytes32 indexed x402TxHash, uint256 amount);

    /**
     * @notice Record a payment with atomic USDC deposit (preferred over recordPayment)
     * @dev Caller must have approved this contract for `amount` USDC.
     *      Atomically pulls USDC from msg.sender and records the payment,
     *      providing per-publisher deposit proof. This eliminates cross-subsidy
     *      risk because the deposited amount is cryptographically tied to the publisher.
     * @param apiId The API that was called
     * @param consumer The wallet that made the payment
     * @param amount The payment amount in USDC (6 decimals)
     * @param x402TxHash The x402 transaction hash for deduplication
     */
    event PaymentDepositedAndRecorded(
        bytes32 indexed apiId,
        address indexed consumer,
        uint256 amount,
        bytes32 x402TxHash,
        address indexed depositor
    );

    function recordPaymentWithDeposit(
        bytes32 apiId,
        address consumer,
        uint256 amount,
        bytes32 x402TxHash
    ) external whenNotPaused onlyAuthorized nonReentrant {
        require(amount > 0, "OpenGrantPayments: amount is zero");
        require(consumer != address(0), "OpenGrantPayments: invalid consumer");
        require(
            !processedX402Hashes[x402TxHash],
            "OpenGrantPayments: payment already processed"
        );

        address publisher = registry.getAPIPublisher(apiId);
        require(publisher != address(0), "OpenGrantPayments: API not found");

        // Atomically pull USDC from caller — ties deposit to this specific record
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Mark as processed with amount binding
        processedX402Hashes[x402TxHash] = true;
        processedX402Amounts[x402TxHash] = amount;

        // Create payment record
        paymentRecords[x402TxHash] = PaymentRecord({
            apiId: apiId,
            consumer: consumer,
            amount: amount,
            x402TxHash: x402TxHash,
            timestamp: block.timestamp,
            settled: false
        });

        // Per-publisher deposit tracking (atomic proof)
        publisherTotalDeposited[publisher] += amount;

        // Add to pending earnings
        publisherPendingEarnings[publisher] += amount;
        totalPendingEarnings += amount;
        totalPaymentsProcessed++;

        // Update registry stats
        registry.incrementAPIStats(apiId, 1, amount);

        emit PaymentDepositedAndRecorded(apiId, consumer, amount, x402TxHash, msg.sender);
        emit X402AmountBound(x402TxHash, amount);
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
        require(
            apiIds.length <= MAX_BATCH_SIZE,
            "OpenGrantPayments: batch too large"
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
     * @notice Internal distribution logic with dynamic fee and staker revenue share
     * @dev Fee split: platform fee is divided between treasury and staking reward pool.
     *      When stakingRewardPool is set, stakerSplitBPS% of the fee is transferred as USDC
     *      to the GRANTStaking contract. The owner must then call GRANTStaking.notifyUSDCReward()
     *      to activate distribution to stakers. A StakingPoolFunded event is emitted for
     *      off-chain monitoring to trigger the notification call.
     */
    function _distributeToVault(
        bytes32 apiId,
        uint256 amount
    ) internal returns (uint256 platformFee) {
        require(amount > 0, "OpenGrantPayments: distribution amount is zero");

        address publisher = registry.getAPIPublisher(apiId);
        require(publisher != address(0), "OpenGrantPayments: API not found");

        address vault = registry.getPublisherVault(publisher);
        require(vault != address(0), "OpenGrantPayments: vault not found");

        require(
            publisherPendingEarnings[publisher] >= amount,
            "OpenGrantPayments: insufficient pending earnings"
        );

        // Verify contract holds enough USDC before attempting transfers
        uint256 contractBalance = usdc.balanceOf(address(this));
        require(contractBalance >= amount, "OpenGrantPayments: insufficient USDC balance");

        // Calculate fees — use oracle if set (publisher staking discount), otherwise default
        uint256 effectiveFeeBPS = platformFeeBPS;
        if (address(feeDiscountOracle) != address(0)) {
            effectiveFeeBPS = feeDiscountOracle.getEffectiveFeeBPS(publisher);
            // Defense-in-depth: cap oracle return to MAX_FEE_BPS regardless of oracle implementation
            if (effectiveFeeBPS > MAX_FEE_BPS) {
                effectiveFeeBPS = MAX_FEE_BPS;
            }
        }
        platformFee = (amount * effectiveFeeBPS) / BPS_DENOMINATOR;
        uint256 netAmount = amount - platformFee;

        // Update state
        publisherPendingEarnings[publisher] -= amount;
        totalPendingEarnings -= amount;
        publisherTotalDistributed[publisher] += amount;
        totalPlatformFeesCollected += platformFee;

        // Split platform fee: treasury + staker reward pool
        uint256 stakerShare = 0;
        if (stakingRewardPool != address(0) && platformFee > 0) {
            stakerShare = (platformFee * stakerSplitBPS) / BPS_DENOMINATOR;
            uint256 treasuryShare = platformFee - stakerShare;

            if (treasuryShare > 0) {
                usdc.safeTransfer(platformFeeReceiver, treasuryShare);
            }
            if (stakerShare > 0) {
                usdc.safeTransfer(stakingRewardPool, stakerShare);
                emit StakingPoolFunded(stakingRewardPool, stakerShare);
            }
        } else {
            // No staking pool configured — all fees to treasury
            if (platformFee > 0) {
                usdc.safeTransfer(platformFeeReceiver, platformFee);
            }
        }

        // Approve and distribute to vault
        usdc.forceApprove(vault, netAmount);
        IPublisherVault(vault).receivePayment(netAmount);

        emit PaymentDistributed(apiId, publisher, amount, platformFee, netAmount);

        return platformFee;
    }

    // ============================================
    // SETTLEMENT MARKING
    // ============================================

    /**
     * @inheritdoc IOpenGrantPayments
     * @dev Called by authorized caller (CRE/gateway) after distributeToVault to mark
     *      individual payment records as settled. This is a separate step because
     *      distribution operates at apiId+amount level, while settlement tracking
     *      is per-transaction for off-chain auditability.
     */
    function markPaymentsSettled(
        bytes32[] calldata txHashes
    ) external override onlyAuthorized {
        require(txHashes.length <= MAX_BATCH_SIZE, "OpenGrantPayments: batch too large");
        for (uint256 i = 0; i < txHashes.length; i++) {
            require(
                paymentRecords[txHashes[i]].amount > 0,
                "OpenGrantPayments: unknown payment"
            );
            require(
                !paymentRecords[txHashes[i]].settled,
                "OpenGrantPayments: payment already settled"
            );
            paymentRecords[txHashes[i]].settled = true;
        }

        emit PaymentsMarkedSettled(txHashes);
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
     * @notice Get total pending earnings across all publishers
     * @return Total pending earnings
     */
    function getTotalPendingEarnings() external view returns (uint256) {
        return totalPendingEarnings;
    }

    /**
     * @notice Get full accounting for a publisher
     * @param publisher The publisher address
     * @return deposited Total USDC atomically deposited via recordPaymentWithDeposit
     * @return pending Current pending (undistributed) earnings
     * @return distributed Total USDC distributed to vault
     */
    function getPublisherAccounting(
        address publisher
    ) external view returns (uint256 deposited, uint256 pending, uint256 distributed) {
        return (
            publisherTotalDeposited[publisher],
            publisherPendingEarnings[publisher],
            publisherTotalDistributed[publisher]
        );
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
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        require(caller != address(0), "OpenGrantPayments: invalid caller address");
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    /**
     * @notice Update registry address
     * @param _registry New registry address
     */
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "OpenGrantPayments: invalid registry");
        address oldRegistry = address(registry);
        registry = IRegistry(_registry);
        emit RegistryUpdated(oldRegistry, _registry);
    }

    /**
     * @notice Set fee discount oracle address
     * @param _oracle New oracle address (or zero to disable)
     */
    function setFeeDiscountOracle(address _oracle) external onlyOwner {
        feeDiscountOracle = IFeeDiscountOracle(_oracle);
    }

    /**
     * @notice Set staking reward pool address
     * @param _pool New staking reward pool address (or zero to disable)
     */
    function setStakingRewardPool(address _pool) external onlyOwner {
        stakingRewardPool = _pool;
    }

    /**
     * @notice Set staker split percentage of platform fees
     * @param _splitBPS Split in basis points (e.g., 3000 = 30%)
     */
    function setStakerSplitBPS(uint256 _splitBPS) external onlyOwner {
        require(_splitBPS <= MAX_STAKER_SPLIT_BPS, "OpenGrantPayments: split too high");
        stakerSplitBPS = _splitBPS;
    }

    /**
     * @notice Enable or disable legacy recordPayment (disabled by default)
     * @dev When disabled, only recordPaymentWithDeposit (atomic) is allowed.
     *      This eliminates per-publisher cross-subsidy risk.
     * @param enabled True to enable legacy path, false to disable
     */
    event LegacyRecordPaymentToggled(bool enabled);

    function setLegacyRecordPayment(bool enabled) external onlyOwner {
        legacyRecordPaymentEnabled = enabled;
        emit LegacyRecordPaymentToggled(enabled);
    }

    /**
     * @notice Write off incorrectly recorded pending earnings
     * @dev Used to correct inflated records that would otherwise lock distributions.
     *      Only callable by owner as an administrative correction.
     * @param publisher The publisher whose pending earnings to adjust
     * @param amount The amount to write off
     */
    event PendingEarningsWrittenOff(address indexed publisher, uint256 amount, uint256 remaining);

    function writeOffPendingEarnings(
        address publisher,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "OpenGrantPayments: amount is zero");
        require(
            publisherPendingEarnings[publisher] >= amount,
            "OpenGrantPayments: write-off exceeds pending"
        );

        publisherPendingEarnings[publisher] -= amount;
        totalPendingEarnings -= amount;

        emit PendingEarningsWrittenOff(publisher, amount, publisherPendingEarnings[publisher]);
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
