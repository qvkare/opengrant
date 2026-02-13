// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { OpenGrantPayments } from "../src/OpenGrantPayments.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC token
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Mock Registry
contract MockRegistry {
    mapping(bytes32 => address) public apiPublishers;
    mapping(address => address) public publisherVaults;

    function setAPIPublisher(bytes32 apiId, address publisher) external {
        apiPublishers[apiId] = publisher;
    }

    function setPublisherVault(address publisher, address vault) external {
        publisherVaults[publisher] = vault;
    }

    function getAPIPublisher(bytes32 apiId) external view returns (address) {
        return apiPublishers[apiId];
    }

    function getPublisherVault(address publisher) external view returns (address) {
        return publisherVaults[publisher];
    }

    function incrementAPIStats(
        bytes32, /* apiId */
        uint256, /* calls */
        uint256 /* revenue */
    ) external {
        // No-op for testing
    }
}

// Mock Vault
contract MockVault {
    IERC20 public usdc;
    uint256 public receivedAmount;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function receivePayment(uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        receivedAmount += amount;
    }
}

// Mock Fee Discount Oracle
contract MockFeeOracle {
    mapping(address => uint256) public fees;
    uint256 public defaultFee = 500;

    function setFee(address user, uint256 fee) external {
        fees[user] = fee;
    }

    function getEffectiveFeeBPS(address user) external view returns (uint256) {
        if (fees[user] > 0) return fees[user];
        return defaultFee;
    }
}

contract OpenGrantPaymentsTest is Test {
    MockUSDC public usdc;
    MockRegistry public mockRegistry;
    OpenGrantPayments public payments;
    MockVault public mockVault;

    address public owner = address(0x1);
    address public platformFeeReceiver = address(0x2);
    address public publisher1 = address(0x3);
    address public consumer1 = address(0x4);
    address public authorizedCaller = address(0x5);

    bytes32 public apiId1 = keccak256("api1");

    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%

    function setUp() public {
        // Deploy mock contracts
        usdc = new MockUSDC();
        mockRegistry = new MockRegistry();
        mockVault = new MockVault(address(usdc));

        // Deploy payments contract
        payments = new OpenGrantPayments(
            address(usdc),
            address(mockRegistry),
            platformFeeReceiver,
            PLATFORM_FEE_BPS,
            owner
        );

        // Setup registry
        mockRegistry.setAPIPublisher(apiId1, publisher1);
        mockRegistry.setPublisherVault(publisher1, address(mockVault));

        // Authorize caller and enable legacy recordPayment for existing tests
        vm.startPrank(owner);
        payments.setAuthorizedCaller(authorizedCaller, true);
        payments.setLegacyRecordPayment(true);
        vm.stopPrank();

        // Mint USDC to payments contract for distributions
        usdc.mint(address(payments), 10000000000); // 10,000 USDC
    }

    // ============================================
    // RECORD PAYMENT TESTS
    // ============================================

    function test_RecordPayment() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, txHash);

        assertEq(payments.publisherPendingEarnings(publisher1), 1000000);
        assertEq(payments.totalPaymentsProcessed(), 1);
        assertTrue(payments.processedX402Hashes(txHash));
    }

    function test_RecordMultiplePayments() public {
        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        payments.recordPayment(apiId1, consumer1, 2000000, keccak256("tx2"));
        payments.recordPayment(apiId1, consumer1, 500000, keccak256("tx3"));
        vm.stopPrank();

        assertEq(payments.publisherPendingEarnings(publisher1), 3500000);
        assertEq(payments.totalPaymentsProcessed(), 3);
    }

    function test_RevertRecordPayment_ZeroAmount() public {
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: amount is zero");
        payments.recordPayment(apiId1, consumer1, 0, keccak256("tx1"));
    }

    function test_RevertRecordPayment_InvalidConsumer() public {
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: invalid consumer");
        payments.recordPayment(apiId1, address(0), 1000000, keccak256("tx1"));
    }

    function test_RevertRecordPayment_DuplicateTxHash() public {
        bytes32 txHash = keccak256("tx1");

        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, txHash);

        vm.expectRevert("OpenGrantPayments: payment already processed");
        payments.recordPayment(apiId1, consumer1, 1000000, txHash);
        vm.stopPrank();
    }

    function test_RevertRecordPayment_NotAuthorized() public {
        vm.prank(consumer1);
        vm.expectRevert("OpenGrantPayments: caller not authorized");
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
    }

    function test_RevertRecordPayment_APINotFound() public {
        bytes32 unknownApiId = keccak256("unknown");

        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: API not found");
        payments.recordPayment(unknownApiId, consumer1, 1000000, keccak256("tx1"));
    }

    function test_RecordPayment_TracksTotalPending() public {
        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        assertEq(payments.totalPendingEarnings(), 1000000);
        assertEq(payments.getTotalPendingEarnings(), 1000000);

        payments.recordPayment(apiId1, consumer1, 2000000, keccak256("tx2"));
        assertEq(payments.totalPendingEarnings(), 3000000);
        vm.stopPrank();
    }

    function test_RevertRecordPayment_ExceedsContractBalance() public {
        // Deploy fresh payments with no USDC
        OpenGrantPayments freshPayments = new OpenGrantPayments(
            address(usdc),
            address(mockRegistry),
            platformFeeReceiver,
            PLATFORM_FEE_BPS,
            owner
        );
        vm.startPrank(owner);
        freshPayments.setAuthorizedCaller(authorizedCaller, true);
        freshPayments.setLegacyRecordPayment(true);
        vm.stopPrank();

        // Record payment without any USDC in the contract
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: recorded amount exceeds contract balance");
        freshPayments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
    }

    // ============================================
    // DISTRIBUTION TESTS
    // ============================================

    function test_DistributeToVault() public {
        // Record payment first
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        // Distribute
        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        // Check results
        // Platform fee: 1000000 * 250 / 10000 = 25000
        // Net amount: 1000000 - 25000 = 975000
        assertEq(payments.publisherPendingEarnings(publisher1), 0);
        assertEq(payments.totalPlatformFeesCollected(), 25000);
        assertEq(usdc.balanceOf(platformFeeReceiver), 25000);
        assertEq(mockVault.receivedAmount(), 975000);
    }

    function test_BatchDistribute() public {
        // Setup second API
        bytes32 apiId2 = keccak256("api2");
        address publisher2 = address(0x10);
        MockVault mockVault2 = new MockVault(address(usdc));
        mockRegistry.setAPIPublisher(apiId2, publisher2);
        mockRegistry.setPublisherVault(publisher2, address(mockVault2));

        // Record payments
        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        payments.recordPayment(apiId2, consumer1, 2000000, keccak256("tx2"));
        vm.stopPrank();

        // Batch distribute
        bytes32[] memory apiIds = new bytes32[](2);
        apiIds[0] = apiId1;
        apiIds[1] = apiId2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000000;
        amounts[1] = 2000000;

        vm.prank(authorizedCaller);
        payments.batchDistribute(apiIds, amounts);

        // Check results
        // Total: 3000000, Fee: 75000, Net: 2925000
        assertEq(payments.totalPlatformFeesCollected(), 75000);
        assertEq(usdc.balanceOf(platformFeeReceiver), 75000);
        assertEq(mockVault.receivedAmount(), 975000);
        assertEq(mockVault2.receivedAmount(), 1950000);
    }

    function test_RevertDistribute_InsufficientPending() public {
        // Record smaller payment
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 500000, keccak256("tx1"));

        // Try to distribute more
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: insufficient pending earnings");
        payments.distributeToVault(apiId1, 1000000);
    }

    function test_RevertBatchDistribute_ArraysMismatch() public {
        bytes32[] memory apiIds = new bytes32[](2);
        uint256[] memory amounts = new uint256[](1);

        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: arrays length mismatch");
        payments.batchDistribute(apiIds, amounts);
    }

    function test_RevertBatchDistribute_TooLarge() public {
        bytes32[] memory apiIds = new bytes32[](101);
        uint256[] memory amounts = new uint256[](101);

        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: batch too large");
        payments.batchDistribute(apiIds, amounts);
    }

    function test_RevertMarkPaymentsSettled_TooLarge() public {
        bytes32[] memory txHashes = new bytes32[](101);

        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: batch too large");
        payments.markPaymentsSettled(txHashes);
    }

    // ============================================
    // VIEW FUNCTION TESTS
    // ============================================

    function test_GetPendingEarnings() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1500000, keccak256("tx1"));

        assertEq(payments.getPendingEarnings(publisher1), 1500000);
    }

    function test_GetPlatformFeeBPS() public {
        assertEq(payments.getPlatformFeeBPS(), PLATFORM_FEE_BPS);
    }

    function test_GetTotalPlatformFees() public {
        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        payments.distributeToVault(apiId1, 1000000);
        vm.stopPrank();

        assertEq(payments.getTotalPlatformFees(), 25000);
    }

    // ============================================
    // ADMIN TESTS
    // ============================================

    function test_SetPlatformFee() public {
        vm.prank(owner);
        payments.setPlatformFee(300); // 3%

        assertEq(payments.platformFeeBPS(), 300);
    }

    function test_RevertSetPlatformFee_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: fee too high");
        payments.setPlatformFee(1100); // > 10%
    }

    function test_RevertSetPlatformFee_NotOwner() public {
        vm.prank(consumer1);
        vm.expectRevert();
        payments.setPlatformFee(300);
    }

    function test_SetPlatformFeeReceiver() public {
        address newReceiver = address(0x100);

        vm.prank(owner);
        payments.setPlatformFeeReceiver(newReceiver);

        assertEq(payments.platformFeeReceiver(), newReceiver);
    }

    function test_RevertSetPlatformFeeReceiver_Invalid() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: invalid receiver");
        payments.setPlatformFeeReceiver(address(0));
    }

    function test_SetAuthorizedCaller() public {
        address newCaller = address(0x200);

        assertFalse(payments.authorizedCallers(newCaller));

        vm.prank(owner);
        payments.setAuthorizedCaller(newCaller, true);

        assertTrue(payments.authorizedCallers(newCaller));
    }

    function test_RevokeAuthorizedCaller() public {
        assertTrue(payments.authorizedCallers(authorizedCaller));

        vm.prank(owner);
        payments.setAuthorizedCaller(authorizedCaller, false);

        assertFalse(payments.authorizedCallers(authorizedCaller));
    }

    function test_Pause() public {
        vm.prank(owner);
        payments.pause();

        vm.prank(authorizedCaller);
        vm.expectRevert();
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
    }

    function test_Unpause() public {
        vm.startPrank(owner);
        payments.pause();
        payments.unpause();
        vm.stopPrank();

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
    }

    function test_EmergencyWithdraw_NonUSDC() public {
        // Deploy a non-USDC token
        MockUSDC otherToken = new MockUSDC();
        otherToken.mint(address(payments), 5000000);

        address recipient = address(0x300);
        uint256 balanceBefore = otherToken.balanceOf(recipient);

        vm.prank(owner);
        payments.emergencyWithdraw(address(otherToken), 5000000, recipient);

        assertEq(otherToken.balanceOf(recipient), balanceBefore + 5000000);
    }

    function test_RevertEmergencyWithdraw_USDC() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: cannot withdraw USDC");
        payments.emergencyWithdraw(address(usdc), 1000000, address(0x300));
    }

    function test_RevertEmergencyWithdraw_InvalidRecipient() public {
        MockUSDC otherToken = new MockUSDC();
        otherToken.mint(address(payments), 5000000);

        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: invalid recipient");
        payments.emergencyWithdraw(address(otherToken), 1000000, address(0));
    }

    // ============================================
    // WRITE-OFF TESTS
    // ============================================

    function test_WriteOffPendingEarnings() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        assertEq(payments.publisherPendingEarnings(publisher1), 1000000);
        assertEq(payments.totalPendingEarnings(), 1000000);

        vm.prank(owner);
        payments.writeOffPendingEarnings(publisher1, 400000);

        assertEq(payments.publisherPendingEarnings(publisher1), 600000);
        assertEq(payments.totalPendingEarnings(), 600000);
    }

    function test_WriteOffPendingEarnings_Full() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 500000, keccak256("tx1"));

        vm.prank(owner);
        payments.writeOffPendingEarnings(publisher1, 500000);

        assertEq(payments.publisherPendingEarnings(publisher1), 0);
        assertEq(payments.totalPendingEarnings(), 0);
    }

    function test_RevertWriteOff_ZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: amount is zero");
        payments.writeOffPendingEarnings(publisher1, 0);
    }

    function test_RevertWriteOff_ExceedsPending() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 500000, keccak256("tx1"));

        vm.prank(owner);
        vm.expectRevert("OpenGrantPayments: write-off exceeds pending");
        payments.writeOffPendingEarnings(publisher1, 600000);
    }

    function test_RevertWriteOff_NotOwner() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 500000, keccak256("tx1"));

        vm.prank(consumer1);
        vm.expectRevert();
        payments.writeOffPendingEarnings(publisher1, 500000);
    }

    // ============================================
    // FEE CALCULATION TESTS
    // ============================================

    function test_FeeCalculation_SmallAmount() public {
        // 10 USDC
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 10000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 10000000);

        // 2.5% of 10,000,000 = 250,000
        assertEq(payments.totalPlatformFeesCollected(), 250000);
    }

    function test_FeeCalculation_LargeAmount() public {
        // 1000 USDC
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000000, keccak256("tx1"));

        // Need more USDC
        usdc.mint(address(payments), 1000000000);

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000000);

        // 2.5% of 1,000,000,000 = 25,000,000
        assertEq(payments.totalPlatformFeesCollected(), 25000000);
    }

    function test_FeeCalculation_MinimalAmount() public {
        // 1 micro USDC (smallest unit)
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1);

        // 2.5% of 1 = 0 (rounds down)
        assertEq(payments.totalPlatformFeesCollected(), 0);
    }

    // ============================================
    // ORACLE INTEGRATION TESTS
    // ============================================

    function test_OracleDiscount_AppliedOnDistribution() public {
        // Deploy and configure oracle
        MockFeeOracle oracle = new MockFeeOracle();
        // Publisher1 gets Diamond tier (0.5%)
        oracle.setFee(publisher1, 50);

        vm.prank(owner);
        payments.setFeeDiscountOracle(address(oracle));

        // Record and distribute
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        // Fee should be 0.5% = 5000 (not 5% = 50000)
        assertEq(payments.totalPlatformFeesCollected(), 5000);
        assertEq(mockVault.receivedAmount(), 995000);
    }

    function test_OracleDiscount_DefaultForNonStaker() public {
        // Oracle returns default 500 BPS for non-stakers (mock still uses 500)
        MockFeeOracle oracle = new MockFeeOracle();

        vm.prank(owner);
        payments.setFeeDiscountOracle(address(oracle));

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        // 5% default — same as platformFeeBPS
        assertEq(payments.totalPlatformFeesCollected(), 50000);
    }

    function test_OracleExcessiveFee_CappedToMaxFee() public {
        // Oracle returns 5000 BPS (50%) — should be capped to MAX_FEE_BPS (1000 = 10%)
        MockFeeOracle oracle = new MockFeeOracle();
        oracle.setFee(publisher1, 5000);

        vm.prank(owner);
        payments.setFeeDiscountOracle(address(oracle));

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-oracle-cap"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        // Should be capped at 10% (MAX_FEE_BPS = 1000), not 50%
        // 10% of 1,000,000 = 100,000
        assertEq(payments.totalPlatformFeesCollected(), 100000);
        assertEq(mockVault.receivedAmount(), 900000);
    }

    function test_OracleDisabled_UsesPlatformFee() public {
        // No oracle set — should use platformFeeBPS
        assertEq(address(payments.feeDiscountOracle()), address(0));

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        assertEq(payments.totalPlatformFeesCollected(), 25000);
    }

    function test_StakerSplit_WithPool() public {
        address stakingPool = address(0x999);

        vm.startPrank(owner);
        payments.setStakingRewardPool(stakingPool);
        vm.stopPrank();

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        // Fee = 25000 (2.5%), staker split = 30% of 25000 = 7500, treasury = 17500
        assertEq(usdc.balanceOf(stakingPool), 7500);
        assertEq(usdc.balanceOf(platformFeeReceiver), 17500);
    }

    function test_DistributeToVault_DecrementsTotalPending() public {
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));
        assertEq(payments.totalPendingEarnings(), 1000000);

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);
        assertEq(payments.totalPendingEarnings(), 0);
    }

    function test_RevertDistribute_InsufficientUSDCBalance() public {
        // Record a valid payment (contract has USDC from setUp)
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-drain"));

        // Simulate USDC being drained (e.g., external exploit) via deal cheatcode
        deal(address(usdc), address(payments), 0);

        // Distribution should fail because contract USDC was drained
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: insufficient USDC balance");
        payments.distributeToVault(apiId1, 1000000);
    }

    // ============================================
    // ATOMIC DEPOSIT TESTS (recordPaymentWithDeposit)
    // ============================================

    function test_RecordPaymentWithDeposit() public {
        uint256 depositAmount = 1000000;

        // Give the authorized caller USDC and approve payments contract
        usdc.mint(authorizedCaller, depositAmount);
        vm.prank(authorizedCaller);
        usdc.approve(address(payments), depositAmount);

        uint256 contractBalanceBefore = usdc.balanceOf(address(payments));

        // Record payment with atomic deposit
        vm.prank(authorizedCaller);
        payments.recordPaymentWithDeposit(apiId1, consumer1, depositAmount, keccak256("tx-deposit-1"));

        // Verify USDC was pulled from caller
        assertEq(usdc.balanceOf(authorizedCaller), 0);
        assertEq(usdc.balanceOf(address(payments)), contractBalanceBefore + depositAmount);

        // Verify payment was recorded
        assertEq(payments.publisherPendingEarnings(publisher1), depositAmount);
        assertEq(payments.totalPendingEarnings(), depositAmount);
        assertEq(payments.totalPaymentsProcessed(), 1);
        assertTrue(payments.processedX402Hashes(keccak256("tx-deposit-1")));
    }

    function test_RecordPaymentWithDeposit_TracksPerPublisher() public {
        uint256 amount = 2000000;

        usdc.mint(authorizedCaller, amount);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), amount);
        payments.recordPaymentWithDeposit(apiId1, consumer1, amount, keccak256("tx-pub-track"));
        vm.stopPrank();

        // Per-publisher deposit tracking
        assertEq(payments.publisherTotalDeposited(publisher1), amount);

        // Distribute and check distribution tracking
        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, amount);

        assertEq(payments.publisherTotalDistributed(publisher1), amount);
    }

    function test_RecordPaymentWithDeposit_RevertNoApproval() public {
        usdc.mint(authorizedCaller, 1000000);
        // No approve call

        vm.prank(authorizedCaller);
        vm.expectRevert(); // SafeERC20 revert
        payments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-no-approve"));
    }

    function test_RecordPaymentWithDeposit_RevertInsufficientBalance() public {
        // Authorize but don't give enough USDC
        vm.prank(authorizedCaller);
        usdc.approve(address(payments), 1000000);

        vm.prank(authorizedCaller);
        vm.expectRevert(); // SafeERC20 revert
        payments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-no-balance"));
    }

    function test_RecordPaymentWithDeposit_DuplicateHashReverts() public {
        usdc.mint(authorizedCaller, 2000000);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), 2000000);
        payments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-dup"));

        vm.expectRevert("OpenGrantPayments: payment already processed");
        payments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-dup"));
        vm.stopPrank();
    }

    function test_RecordPaymentWithDeposit_FullFlow() public {
        // Full flow: atomic deposit → distribute → verify accounting
        uint256 amount = 5000000; // 5 USDC

        usdc.mint(authorizedCaller, amount);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), amount);
        payments.recordPaymentWithDeposit(apiId1, consumer1, amount, keccak256("tx-full-flow"));
        vm.stopPrank();

        // Distribute
        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, amount);

        // Verify full accounting
        (uint256 deposited, uint256 pending, uint256 distributed) = payments.getPublisherAccounting(publisher1);
        assertEq(deposited, amount);
        assertEq(pending, 0);
        assertEq(distributed, amount);

        // Fee: 2.5% of 5M = 125,000
        assertEq(payments.totalPlatformFeesCollected(), 125000);
        assertEq(mockVault.receivedAmount(), 4875000);
    }

    // ============================================
    // x402 AMOUNT BINDING TESTS
    // ============================================

    function test_ProcessedX402Amounts_Binding() public {
        bytes32 txHash = keccak256("tx-amount-bind");

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1500000, txHash);

        // Amount is bound to the txHash
        assertEq(payments.processedX402Amounts(txHash), 1500000);
    }

    function test_ProcessedX402Amounts_WithDeposit() public {
        bytes32 txHash = keccak256("tx-deposit-bind");
        uint256 amount = 2500000;

        usdc.mint(authorizedCaller, amount);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), amount);
        payments.recordPaymentWithDeposit(apiId1, consumer1, amount, txHash);
        vm.stopPrank();

        assertEq(payments.processedX402Amounts(txHash), amount);
    }

    // ============================================
    // PUBLISHER ACCOUNTING TESTS
    // ============================================

    function test_GetPublisherAccounting_Initial() public view {
        (uint256 deposited, uint256 pending, uint256 distributed) = payments.getPublisherAccounting(publisher1);
        assertEq(deposited, 0);
        assertEq(pending, 0);
        assertEq(distributed, 0);
    }

    function test_PublisherTotalDistributed_TracksAcrossMultiple() public {
        // Record two payments
        vm.startPrank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-multi-1"));
        payments.recordPayment(apiId1, consumer1, 2000000, keccak256("tx-multi-2"));

        // Distribute in two calls
        payments.distributeToVault(apiId1, 1000000);
        payments.distributeToVault(apiId1, 2000000);
        vm.stopPrank();

        assertEq(payments.publisherTotalDistributed(publisher1), 3000000);
    }

    // ============================================
    // LEGACY DEPRECATION TESTS
    // ============================================

    function test_LegacyRecordPayment_DisabledByDefault() public {
        // Deploy a fresh contract (legacyRecordPaymentEnabled defaults to false)
        OpenGrantPayments freshPayments = new OpenGrantPayments(
            address(usdc),
            address(mockRegistry),
            platformFeeReceiver,
            PLATFORM_FEE_BPS,
            owner
        );
        vm.prank(owner);
        freshPayments.setAuthorizedCaller(authorizedCaller, true);

        // Mint USDC so balance proof would pass
        usdc.mint(address(freshPayments), 10000000);

        // recordPayment should revert because legacy is disabled by default
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: deprecated, use recordPaymentWithDeposit");
        freshPayments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-legacy-off"));

        // recordPaymentWithDeposit should still work
        usdc.mint(authorizedCaller, 1000000);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(freshPayments), 1000000);
        freshPayments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-atomic-ok"));
        vm.stopPrank();

        assertEq(freshPayments.publisherPendingEarnings(publisher1), 1000000);
    }

    function test_LegacyRecordPayment_AdminCanToggle() public {
        // Deploy fresh (default: disabled)
        OpenGrantPayments freshPayments = new OpenGrantPayments(
            address(usdc),
            address(mockRegistry),
            platformFeeReceiver,
            PLATFORM_FEE_BPS,
            owner
        );
        vm.startPrank(owner);
        freshPayments.setAuthorizedCaller(authorizedCaller, true);
        vm.stopPrank();

        assertFalse(freshPayments.legacyRecordPaymentEnabled());

        // Enable legacy
        vm.prank(owner);
        freshPayments.setLegacyRecordPayment(true);
        assertTrue(freshPayments.legacyRecordPaymentEnabled());

        // Disable again
        vm.prank(owner);
        freshPayments.setLegacyRecordPayment(false);
        assertFalse(freshPayments.legacyRecordPaymentEnabled());
    }

    function test_RevertLegacyToggle_NotOwner() public {
        vm.prank(consumer1);
        vm.expectRevert();
        payments.setLegacyRecordPayment(false);
    }

    function test_LegacyRecordPayment_EnabledAllowsRecordPayment() public {
        // setUp already enables legacy, verify recordPayment works
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-legacy-enabled"));

        assertEq(payments.publisherPendingEarnings(publisher1), 1000000);
    }

    function test_LegacyDisabled_OnlyAtomicDepositsWork() public {
        // Disable legacy (setUp enables it, so we disable)
        vm.prank(owner);
        payments.setLegacyRecordPayment(false);

        // recordPayment reverts
        vm.prank(authorizedCaller);
        vm.expectRevert("OpenGrantPayments: deprecated, use recordPaymentWithDeposit");
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx-blocked"));

        // recordPaymentWithDeposit works
        usdc.mint(authorizedCaller, 1000000);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), 1000000);
        payments.recordPaymentWithDeposit(apiId1, consumer1, 1000000, keccak256("tx-atomic"));
        vm.stopPrank();

        assertEq(payments.publisherPendingEarnings(publisher1), 1000000);
    }

    // ============================================
    // X402 AMOUNT BOUND EVENT TESTS
    // ============================================

    function test_X402AmountBound_EmittedOnRecordPayment() public {
        bytes32 txHash = keccak256("tx-event-legacy");

        vm.prank(authorizedCaller);
        vm.expectEmit(true, false, false, true);
        emit OpenGrantPayments.X402AmountBound(txHash, 1500000);
        payments.recordPayment(apiId1, consumer1, 1500000, txHash);
    }

    function test_X402AmountBound_EmittedOnRecordPaymentWithDeposit() public {
        bytes32 txHash = keccak256("tx-event-atomic");
        uint256 amount = 2500000;

        usdc.mint(authorizedCaller, amount);
        vm.startPrank(authorizedCaller);
        usdc.approve(address(payments), amount);

        vm.expectEmit(true, false, false, true);
        emit OpenGrantPayments.X402AmountBound(txHash, amount);
        payments.recordPaymentWithDeposit(apiId1, consumer1, amount, txHash);
        vm.stopPrank();
    }
}
