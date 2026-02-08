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

    uint256 public constant PLATFORM_FEE_BPS = 500; // 5%

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

        // Authorize caller
        vm.prank(owner);
        payments.setAuthorizedCaller(authorizedCaller, true);

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
        // Platform fee: 1000000 * 500 / 10000 = 50000
        // Net amount: 1000000 - 50000 = 950000
        assertEq(payments.publisherPendingEarnings(publisher1), 0);
        assertEq(payments.totalPlatformFeesCollected(), 50000);
        assertEq(usdc.balanceOf(platformFeeReceiver), 50000);
        assertEq(mockVault.receivedAmount(), 950000);
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
        // Total: 3000000, Fee: 150000, Net: 2850000
        assertEq(payments.totalPlatformFeesCollected(), 150000);
        assertEq(usdc.balanceOf(platformFeeReceiver), 150000);
        assertEq(mockVault.receivedAmount(), 950000);
        assertEq(mockVault2.receivedAmount(), 1900000);
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

        assertEq(payments.getTotalPlatformFees(), 50000);
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
    // FEE CALCULATION TESTS
    // ============================================

    function test_FeeCalculation_SmallAmount() public {
        // 10 USDC
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 10000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 10000000);

        // 5% of 10,000,000 = 500,000
        assertEq(payments.totalPlatformFeesCollected(), 500000);
    }

    function test_FeeCalculation_LargeAmount() public {
        // 1000 USDC
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000000, keccak256("tx1"));

        // Need more USDC
        usdc.mint(address(payments), 1000000000);

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000000);

        // 5% of 1,000,000,000 = 50,000,000
        assertEq(payments.totalPlatformFeesCollected(), 50000000);
    }

    function test_FeeCalculation_MinimalAmount() public {
        // 1 micro USDC (smallest unit)
        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1);

        // 5% of 1 = 0 (rounds down)
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
        // Oracle returns default 500 BPS (5%) for non-stakers
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

    function test_OracleDisabled_UsesPlatformFee() public {
        // No oracle set — should use platformFeeBPS
        assertEq(address(payments.feeDiscountOracle()), address(0));

        vm.prank(authorizedCaller);
        payments.recordPayment(apiId1, consumer1, 1000000, keccak256("tx1"));

        vm.prank(authorizedCaller);
        payments.distributeToVault(apiId1, 1000000);

        assertEq(payments.totalPlatformFeesCollected(), 50000);
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

        // Fee = 50000 (5%), staker split = 30% of 50000 = 15000, treasury = 35000
        assertEq(usdc.balanceOf(stakingPool), 15000);
        assertEq(usdc.balanceOf(platformFeeReceiver), 35000);
    }
}
