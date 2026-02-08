// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
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

contract GRANTStakingTest is Test {
    GRANTToken public grantToken;
    MockUSDC public usdc;
    GRANTStaking public staking;

    address public owner = address(0x1);
    address public alice = address(0x10);
    address public bob = address(0x11);

    uint256 public constant STAKE_AMOUNT = 100_000 ether;
    uint256 public constant GRANT_REWARD = 10_000_000 ether;
    uint256 public constant USDC_REWARD = 45_000e6; // 45,000 USDC

    function setUp() public {
        // Deploy tokens
        vm.prank(owner);
        grantToken = new GRANTToken();
        usdc = new MockUSDC();

        // Deploy staking
        vm.prank(owner);
        staking = new GRANTStaking(address(grantToken), address(usdc), owner);

        // Fund alice and bob with GRANT
        vm.startPrank(owner);
        grantToken.transfer(alice, 10_000_000 ether);
        grantToken.transfer(bob, 10_000_000 ether);
        vm.stopPrank();

        // Approve staking contract
        vm.prank(alice);
        grantToken.approve(address(staking), type(uint256).max);

        vm.prank(bob);
        grantToken.approve(address(staking), type(uint256).max);
    }

    // ============================================
    // STAKING TESTS
    // ============================================

    function test_Stake() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        assertEq(staking.balanceOf(alice), STAKE_AMOUNT);
        assertEq(staking.totalSupply(), STAKE_AMOUNT);
        assertEq(grantToken.balanceOf(address(staking)), STAKE_AMOUNT);
    }

    function test_StakeMultipleUsers() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(bob);
        staking.stake(STAKE_AMOUNT * 2);

        assertEq(staking.totalSupply(), STAKE_AMOUNT * 3);
        assertEq(staking.balanceOf(alice), STAKE_AMOUNT);
        assertEq(staking.balanceOf(bob), STAKE_AMOUNT * 2);
    }

    function test_RevertStake_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("GRANTStaking: cannot stake zero");
        staking.stake(0);
    }

    function test_EffectiveBalance() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        assertEq(staking.effectiveBalanceOf(alice), STAKE_AMOUNT);
    }

    // ============================================
    // COOLDOWN & WITHDRAWAL TESTS
    // ============================================

    function test_RequestWithdraw() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT);

        assertEq(staking.cooldownAmount(alice), STAKE_AMOUNT);
        assertEq(staking.effectiveBalanceOf(alice), 0);
        // Balance still counted in staking (earns rewards during cooldown)
        assertEq(staking.balanceOf(alice), STAKE_AMOUNT);
    }

    function test_WithdrawAfterCooldown() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT);

        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days);

        uint256 balanceBefore = grantToken.balanceOf(alice);

        vm.prank(alice);
        staking.withdraw();

        assertEq(grantToken.balanceOf(alice), balanceBefore + STAKE_AMOUNT);
        assertEq(staking.balanceOf(alice), 0);
        assertEq(staking.totalSupply(), 0);
    }

    function test_RevertWithdraw_CooldownNotFinished() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT);

        // Only 3 days passed
        vm.warp(block.timestamp + 3 days);

        vm.prank(alice);
        vm.expectRevert("GRANTStaking: cooldown not finished");
        staking.withdraw();
    }

    function test_RevertWithdraw_NoPendingWithdrawal() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        vm.expectRevert("GRANTStaking: no pending withdrawal");
        staking.withdraw();
    }

    function test_RevertRequestWithdraw_InsufficientBalance() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        vm.expectRevert("GRANTStaking: insufficient available balance");
        staking.requestWithdraw(STAKE_AMOUNT + 1);
    }

    function test_CancelCooldown() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT);

        assertEq(staking.effectiveBalanceOf(alice), 0);

        vm.prank(alice);
        staking.cancelCooldown();

        assertEq(staking.cooldownAmount(alice), 0);
        assertEq(staking.effectiveBalanceOf(alice), STAKE_AMOUNT);
        // Tokens still staked
        assertEq(staking.balanceOf(alice), STAKE_AMOUNT);
    }

    function test_PartialWithdraw() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        uint256 halfAmount = STAKE_AMOUNT / 2;

        vm.prank(alice);
        staking.requestWithdraw(halfAmount);

        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        staking.withdraw();

        assertEq(staking.balanceOf(alice), halfAmount);
        assertEq(staking.effectiveBalanceOf(alice), halfAmount);
    }

    // ============================================
    // GRANT REWARD TESTS
    // ============================================

    function test_GrantRewards() public {
        // Alice stakes first (required: stakers must exist before notifyReward)
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Fund staking contract with GRANT rewards
        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        // Wait half the reward period (15 days)
        vm.warp(block.timestamp + 15 days);

        // Alice should have earned ~half the rewards
        uint256 earned = staking.earnedGrant(alice);
        assertGt(earned, 0);
        // Approximately half (with some rounding)
        assertApproxEqRel(earned, GRANT_REWARD / 2, 0.01e18); // 1% tolerance
    }

    function test_GrantRewards_ProportionalSplit() public {
        // Both stake first (required: stakers must exist before notifyReward)
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(bob);
        staking.stake(STAKE_AMOUNT * 2);

        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        // Wait full period
        vm.warp(block.timestamp + 30 days);

        uint256 aliceEarned = staking.earnedGrant(alice);
        uint256 bobEarned = staking.earnedGrant(bob);

        // Bob should earn ~2x of Alice
        assertApproxEqRel(bobEarned, aliceEarned * 2, 0.01e18);
    }

    function test_ClaimGrantRewards() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        vm.warp(block.timestamp + 30 days);

        uint256 earned = staking.earnedGrant(alice);
        uint256 balanceBefore = grantToken.balanceOf(alice);

        vm.prank(alice);
        staking.claimRewards();

        assertEq(grantToken.balanceOf(alice), balanceBefore + earned);
        assertEq(staking.earnedGrant(alice), 0);
    }

    // ============================================
    // USDC REWARD TESTS
    // ============================================

    function test_USDCRewards() public {
        // Stake first (required: stakers must exist before notifyReward)
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Fund USDC rewards
        usdc.mint(address(staking), USDC_REWARD);

        vm.prank(owner);
        staking.notifyUSDCReward(USDC_REWARD);

        vm.warp(block.timestamp + 30 days);

        uint256 earned = staking.earnedUSDC(alice);
        assertApproxEqRel(earned, USDC_REWARD, 0.01e18);
    }

    function test_ClaimUSDCRewards() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        usdc.mint(address(staking), USDC_REWARD);

        vm.prank(owner);
        staking.notifyUSDCReward(USDC_REWARD);

        vm.warp(block.timestamp + 30 days);

        uint256 earned = staking.earnedUSDC(alice);

        vm.prank(alice);
        staking.claimRewards();

        assertEq(usdc.balanceOf(alice), earned);
    }

    // ============================================
    // DUAL REWARD TESTS
    // ============================================

    function test_DualRewards() public {
        // Stake first
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Fund both rewards
        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);
        usdc.mint(address(staking), USDC_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        vm.prank(owner);
        staking.notifyUSDCReward(USDC_REWARD);

        vm.warp(block.timestamp + 30 days);

        uint256 grantEarned = staking.earnedGrant(alice);
        uint256 usdcEarned = staking.earnedUSDC(alice);

        assertGt(grantEarned, 0);
        assertGt(usdcEarned, 0);

        uint256 grantBefore = grantToken.balanceOf(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        staking.claimRewards();

        assertEq(grantToken.balanceOf(alice), grantBefore + grantEarned);
        assertEq(usdc.balanceOf(alice), usdcBefore + usdcEarned);
    }

    // ============================================
    // ADMIN TESTS
    // ============================================

    function test_RevertNotifyGrantReward_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.notifyGrantReward(1000 ether);
    }

    function test_RevertNotifyUSDCReward_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.notifyUSDCReward(1000e6);
    }

    function test_Pause() public {
        vm.prank(owner);
        staking.pause();

        vm.prank(alice);
        vm.expectRevert();
        staking.stake(STAKE_AMOUNT);
    }

    function test_Unpause() public {
        vm.prank(owner);
        staking.pause();

        vm.prank(owner);
        staking.unpause();

        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        assertEq(staking.balanceOf(alice), STAKE_AMOUNT);
    }

    function test_RecoverERC20() public {
        // Send a random token to staking contract
        MockUSDC randomToken = new MockUSDC();
        randomToken.mint(address(staking), 1000e6);

        vm.prank(owner);
        staking.recoverERC20(address(randomToken), 1000e6, owner);

        assertEq(randomToken.balanceOf(owner), 1000e6);
    }

    function test_RevertRecoverERC20_StakingToken() public {
        vm.prank(owner);
        vm.expectRevert("GRANTStaking: cannot recover staking token");
        staking.recoverERC20(address(grantToken), 1000 ether, owner);
    }

    function test_RevertRecoverERC20_RewardToken() public {
        vm.prank(owner);
        vm.expectRevert("GRANTStaking: cannot recover reward token");
        staking.recoverERC20(address(usdc), 1000e6, owner);
    }

    // ============================================
    // REWARD DURATION VIEWS
    // ============================================

    function test_GetGrantRewardForDuration() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        uint256 rewardForDuration = staking.getGrantRewardForDuration();
        // Should approximately equal the notified reward (with rounding)
        assertApproxEqRel(rewardForDuration, GRANT_REWARD, 0.001e18);
    }

    function test_GetUSDCRewardForDuration() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        usdc.mint(address(staking), USDC_REWARD);

        vm.prank(owner);
        staking.notifyUSDCReward(USDC_REWARD);

        uint256 rewardForDuration = staking.getUSDCRewardForDuration();
        assertApproxEqRel(rewardForDuration, USDC_REWARD, 0.001e18);
    }

    // ============================================
    // EDGE CASES
    // ============================================

    function test_NoRewardsBeforeNotify() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.warp(block.timestamp + 30 days);

        assertEq(staking.earnedGrant(alice), 0);
        assertEq(staking.earnedUSDC(alice), 0);
    }

    function test_RewardsStopAfterPeriod() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        // Wait 2x the period
        vm.warp(block.timestamp + 60 days);

        uint256 earned = staking.earnedGrant(alice);

        // Wait even longer
        vm.warp(block.timestamp + 30 days);

        // Should not have earned more
        assertEq(staking.earnedGrant(alice), earned);
    }

    function test_CooldownDoesNotAffectRewards() public {
        // Alice stakes first
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Then notify rewards (so alice earns from the start)
        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        staking.notifyGrantReward(GRANT_REWARD);

        uint256 startTime = block.timestamp;
        vm.warp(startTime + 15 days);

        uint256 earnedBeforeCooldown = staking.earnedGrant(alice);
        assertGt(earnedBeforeCooldown, 0);

        // Request withdrawal but rewards should continue accruing
        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT);

        // Advance to end of reward period
        vm.warp(startTime + 30 days);

        // Should have earned for full 30 days (cooldown doesn't stop rewards)
        uint256 earned = staking.earnedGrant(alice);
        assertGt(earned, earnedBeforeCooldown); // More rewards accrued during cooldown
        assertApproxEqRel(earned, GRANT_REWARD, 0.01e18);
    }

    // ============================================
    // SECURITY TESTS (Audit Round 4)
    // ============================================

    function test_RevertNotifyGrantReward_NoStakers() public {
        vm.prank(owner);
        grantToken.transfer(address(staking), GRANT_REWARD);

        vm.prank(owner);
        vm.expectRevert("GRANTStaking: no stakers");
        staking.notifyGrantReward(GRANT_REWARD);
    }

    function test_RevertNotifyUSDCReward_NoStakers() public {
        usdc.mint(address(staking), USDC_REWARD);

        vm.prank(owner);
        vm.expectRevert("GRANTStaking: no stakers");
        staking.notifyUSDCReward(USDC_REWARD);
    }

    function test_RevertNotifyGrantReward_InsufficientBalance() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Transfer less GRANT than we try to notify
        vm.prank(owner);
        grantToken.transfer(address(staking), 1_000 ether);

        vm.prank(owner);
        vm.expectRevert("GRANTStaking: insufficient reward balance");
        staking.notifyGrantReward(GRANT_REWARD); // 10M but only 1K available
    }

    function test_RevertNotifyUSDCReward_InsufficientBalance() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Mint less USDC than we try to notify
        usdc.mint(address(staking), 1_000e6);

        vm.prank(owner);
        vm.expectRevert("GRANTStaking: insufficient reward balance");
        staking.notifyUSDCReward(USDC_REWARD); // 45K but only 1K available
    }

    function test_RevertRequestWithdraw_ExistingCooldown() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // First withdrawal request
        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT / 2);

        // Second request should be blocked while cooldown active
        vm.prank(alice);
        vm.expectRevert("GRANTStaking: existing cooldown active");
        staking.requestWithdraw(STAKE_AMOUNT / 4);
    }

    function test_RequestWithdraw_AfterCompletedCooldown() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // First partial withdrawal
        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT / 2);

        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        staking.withdraw();

        // Now can request another withdrawal
        vm.prank(alice);
        staking.requestWithdraw(STAKE_AMOUNT / 4);

        assertEq(staking.cooldownAmount(alice), STAKE_AMOUNT / 4);
    }

    function test_BalanceVerification_ExactAmount() public {
        vm.prank(alice);
        staking.stake(STAKE_AMOUNT);

        // Transfer exactly the reward amount
        uint256 exactReward = 2_592_000 ether; // Divisible by REWARD_DURATION (30 days = 2592000 seconds)
        vm.prank(owner);
        grantToken.transfer(address(staking), exactReward);

        // Should succeed — balance exactly covers rewards
        vm.prank(owner);
        staking.notifyGrantReward(exactReward);

        assertGt(staking.grantRewardRate(), 0);
    }
}
