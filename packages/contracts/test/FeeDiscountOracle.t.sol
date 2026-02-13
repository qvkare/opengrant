// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FeeDiscountOracle } from "../src/FeeDiscountOracle.sol";
import { GRANTToken } from "../src/GRANTToken.sol";
import { GRANTStaking } from "../src/GRANTStaking.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeDiscountOracleTest is Test {
    GRANTToken public grantToken;
    MockUSDC public usdc;
    GRANTStaking public staking;
    FeeDiscountOracle public oracle;

    address public owner = address(0x1);
    address public alice = address(0x10);
    address public bob = address(0x11);

    function setUp() public {
        // Deploy tokens
        vm.prank(owner);
        grantToken = new GRANTToken();
        usdc = new MockUSDC();

        // Deploy staking
        vm.prank(owner);
        staking = new GRANTStaking(address(grantToken), address(usdc), owner);

        // Deploy oracle
        vm.prank(owner);
        oracle = new FeeDiscountOracle(address(staking), owner);

        // Fund alice with GRANT
        vm.prank(owner);
        grantToken.transfer(alice, 2_000_000 ether);

        vm.prank(alice);
        grantToken.approve(address(staking), type(uint256).max);
    }

    // ============================================
    // TIER TESTS
    // ============================================

    function test_DefaultFee_NoStake() public view {
        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 250); // 2.5% default
    }

    function test_SilverTier() public {
        _stakeAs(alice, 10_000 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 200); // 2.0%
    }

    function test_GoldTier() public {
        _stakeAs(alice, 50_000 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 150); // 1.5%
    }

    function test_PlatinumTier() public {
        _stakeAs(alice, 250_000 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 100); // 1.0%
    }

    function test_DiamondTier() public {
        _stakeAs(alice, 1_000_000 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 50); // 0.5%
    }

    function test_AboveDiamondThreshold() public {
        _stakeAs(alice, 1_500_000 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 50); // Still Diamond
    }

    function test_BelowSilverThreshold() public {
        _stakeAs(alice, 9_999 ether);

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 250); // Standard (below Silver)
    }

    function test_ExactThreshold() public {
        _stakeAs(alice, 50_000 ether); // Exactly Gold threshold

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 150); // Gold
    }

    // ============================================
    // COOLDOWN AFFECTS TIER
    // ============================================

    function test_CooldownReducesEffectiveBalance() public {
        _stakeAs(alice, 50_000 ether); // Gold tier

        uint256 fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 150); // Gold

        // Request withdrawal of most tokens
        vm.prank(alice);
        staking.requestWithdraw(45_000 ether);

        // Effective balance = 50k - 45k = 5k (below Silver)
        fee = oracle.getEffectiveFeeBPS(alice);
        assertEq(fee, 250); // Back to Standard
    }

    // ============================================
    // TIER INDEX
    // ============================================

    function test_GetTierIndex_Diamond() public view {
        assertEq(oracle.getTierIndex(1_000_000 ether), 0);
    }

    function test_GetTierIndex_Platinum() public view {
        assertEq(oracle.getTierIndex(250_000 ether), 1);
    }

    function test_GetTierIndex_Gold() public view {
        assertEq(oracle.getTierIndex(50_000 ether), 2);
    }

    function test_GetTierIndex_Silver() public view {
        assertEq(oracle.getTierIndex(10_000 ether), 3);
    }

    function test_GetTierIndex_Standard() public view {
        assertEq(oracle.getTierIndex(0), 4); // tiers.length
    }

    function test_TierCount() public view {
        assertEq(oracle.tierCount(), 4);
    }

    // ============================================
    // ADMIN TESTS
    // ============================================

    function test_SetTiers() public {
        uint256[] memory minStakes = new uint256[](2);
        minStakes[0] = 500_000 ether;
        minStakes[1] = 100_000 ether;

        uint256[] memory feeBPS = new uint256[](2);
        feeBPS[0] = 100; // 1%
        feeBPS[1] = 300; // 3%

        vm.prank(owner);
        oracle.setTiers(minStakes, feeBPS);

        assertEq(oracle.tierCount(), 2);

        // Stake 100k → should hit tier index 1 (300 BPS)
        _stakeAs(alice, 100_000 ether);
        assertEq(oracle.getEffectiveFeeBPS(alice), 300);
    }

    function test_RevertSetTiers_NotDescending() public {
        uint256[] memory minStakes = new uint256[](2);
        minStakes[0] = 100_000 ether;
        minStakes[1] = 500_000 ether; // Wrong order

        uint256[] memory feeBPS = new uint256[](2);
        feeBPS[0] = 100;
        feeBPS[1] = 300;

        vm.prank(owner);
        vm.expectRevert("FeeDiscountOracle: must be descending order");
        oracle.setTiers(minStakes, feeBPS);
    }

    function test_RevertSetTiers_ZeroFee() public {
        uint256[] memory minStakes = new uint256[](1);
        minStakes[0] = 100_000 ether;

        uint256[] memory feeBPS = new uint256[](1);
        feeBPS[0] = 0; // Zero fee not allowed

        vm.prank(owner);
        vm.expectRevert("FeeDiscountOracle: fee cannot be zero");
        oracle.setTiers(minStakes, feeBPS);
    }

    function test_RevertSetTiers_FeeTooHigh() public {
        uint256[] memory minStakes = new uint256[](1);
        minStakes[0] = 100_000 ether;

        uint256[] memory feeBPS = new uint256[](1);
        feeBPS[0] = 1500; // > 10%

        vm.prank(owner);
        vm.expectRevert("FeeDiscountOracle: fee too high");
        oracle.setTiers(minStakes, feeBPS);
    }

    function test_SetDefaultFeeBPS() public {
        vm.prank(owner);
        oracle.setDefaultFeeBPS(300);

        assertEq(oracle.defaultFeeBPS(), 300);
        assertEq(oracle.getEffectiveFeeBPS(bob), 300); // Non-staker
    }

    function test_RevertSetDefaultFeeBPS_Zero() public {
        vm.prank(owner);
        vm.expectRevert("FeeDiscountOracle: fee cannot be zero");
        oracle.setDefaultFeeBPS(0);
    }

    function test_SetStakingContract() public {
        address newStaking = address(0x999);

        vm.prank(owner);
        oracle.setStakingContract(newStaking);

        assertEq(oracle.stakingContract(), newStaking);
    }

    function test_RevertSetStakingContract_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("FeeDiscountOracle: invalid address");
        oracle.setStakingContract(address(0));
    }

    function test_RevertAdmin_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.setDefaultFeeBPS(100);
    }

    // ============================================
    // DIAGNOSTIC TESTS
    // ============================================

    function test_IsStakingContractResponsive() public view {
        assertTrue(oracle.isStakingContractResponsive());
    }

    function test_IsStakingContractResponsive_NonContract() public {
        FeeDiscountOracle freshOracle = new FeeDiscountOracle(address(staking), owner);
        vm.prank(owner);
        freshOracle.setStakingContract(address(0xDEAD)); // EOA, not a contract
        assertFalse(freshOracle.isStakingContractResponsive());
    }

    // ============================================
    // HELPERS
    // ============================================

    function _stakeAs(address user, uint256 amount) internal {
        vm.prank(user);
        staking.stake(amount);
    }
}
