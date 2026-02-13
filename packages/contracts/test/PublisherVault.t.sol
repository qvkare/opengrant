// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { PublisherVault } from "../src/PublisherVault.sol";
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

// Mock USDC with blacklist functionality (for griefing test)
contract BlacklistableUSDC is ERC20 {
    mapping(address => bool) public blacklisted;

    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function blacklist(address account) external { blacklisted[account] = true; }

    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[from] && !blacklisted[to], "Blacklisted");
        super._update(from, to, value);
    }
}

contract PublisherVaultTest is Test {
    MockUSDC public usdc;
    PublisherVault public vault;

    address public owner = address(0x1);
    address public platformFeeReceiver = address(0x2);
    address public paymentsContract = address(0x3);
    address public payee1 = address(0x10);
    address public payee2 = address(0x11);
    address public payee3 = address(0x12);

    function setUp() public {
        usdc = new MockUSDC();

        address[] memory payees = new address[](2);
        payees[0] = payee1;
        payees[1] = payee2;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 7000; // 70%
        shares[1] = 3000; // 30%

        vault = new PublisherVault(
            IERC20(address(usdc)),
            "Publisher 1 Vault",
            "PV1",
            owner,
            payees,
            shares,
            paymentsContract
        );

        // Pre-approve USDC for payments contract
        vm.prank(paymentsContract);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ============================================
    // INITIALIZATION TESTS
    // ============================================

    function test_Initialization() public view {
        assertEq(vault.name(), "Publisher 1 Vault");
        assertEq(vault.symbol(), "PV1");
        assertEq(vault.paymentsContract(), paymentsContract);
        assertEq(vault.totalShares(), 10000);
        assertEq(vault.shares(payee1), 7000);
        assertEq(vault.shares(payee2), 3000);
    }

    function test_GetPayees() public view {
        address[] memory payees = vault.getPayees();
        assertEq(payees.length, 2);
        assertEq(payees[0], payee1);
        assertEq(payees[1], payee2);
    }

    // ============================================
    // RECEIVE PAYMENT TESTS
    // ============================================

    function test_ReceivePayment() public {
        uint256 paymentAmount = 1000000; // 1 USDC
        usdc.mint(paymentsContract, paymentAmount);

        vm.prank(paymentsContract);
        vault.receivePayment(paymentAmount);

        // Platform fee is deducted in OpenGrantPayments, not in vault
        // Vault receives the full net amount
        assertEq(usdc.balanceOf(platformFeeReceiver), 0);
        assertEq(usdc.balanceOf(address(vault)), 1000000);
    }

    function test_RevertReceivePayment_NotPaymentsContract() public {
        vm.prank(owner);
        vm.expectRevert("PublisherVault: caller is not payments contract");
        vault.receivePayment(1000000);
    }

    function test_RevertReceivePayment_ZeroAmount() public {
        vm.prank(paymentsContract);
        vm.expectRevert("PublisherVault: amount is zero");
        vault.receivePayment(0);
    }

    // ============================================
    // PAYMENT SPLITTER TESTS
    // ============================================

    function test_Releasable() public {
        _receivePayment(1000000);

        // Vault receives full amount (fee already deducted upstream)
        // payee1 (70%): 1000000 * 7000 / 10000 = 700000
        // payee2 (30%): 1000000 * 3000 / 10000 = 300000
        assertEq(vault.releasable(payee1), 700000);
        assertEq(vault.releasable(payee2), 300000);
    }

    function test_Release() public {
        _receivePayment(1000000);

        uint256 payee1Releasable = vault.releasable(payee1);

        vault.release(payee1);

        assertEq(usdc.balanceOf(payee1), payee1Releasable);
        assertEq(vault.released(payee1), payee1Releasable);
        assertEq(vault.releasable(payee1), 0);
    }

    function test_ReleaseAll() public {
        _receivePayment(1000000);

        uint256 payee1Releasable = vault.releasable(payee1);
        uint256 payee2Releasable = vault.releasable(payee2);

        vault.releaseAll();

        assertEq(usdc.balanceOf(payee1), payee1Releasable);
        assertEq(usdc.balanceOf(payee2), payee2Releasable);
        assertEq(vault.totalReleased(), payee1Releasable + payee2Releasable);
    }

    function test_MultiplePaymentsAndReleases() public {
        // First payment
        _receivePayment(1000000);

        // Partial release
        vault.release(payee1);
        uint256 firstRelease = vault.released(payee1);

        // Second payment
        _receivePayment(2000000);

        // payee1 should have more releasable
        uint256 secondReleasable = vault.releasable(payee1);
        assertGt(secondReleasable, 0);

        vault.release(payee1);

        assertEq(usdc.balanceOf(payee1), firstRelease + secondReleasable);
    }

    function test_RevertRelease_NoShares() public {
        _receivePayment(1000000);

        vm.expectRevert("PublisherVault: account has no shares");
        vault.release(address(0x999));
    }

    function test_RevertRelease_NoPaymentDue() public {
        // No payments received yet
        vm.expectRevert("PublisherVault: no payment due");
        vault.release(payee1);
    }

    // ============================================
    // UPDATE PAYEES TESTS
    // ============================================

    function test_UpdatePayees() public {
        // First receive some payment
        _receivePayment(1000000);

        // Release to existing payees
        vault.releaseAll();

        // Update payees
        address[] memory newPayees = new address[](3);
        newPayees[0] = payee1;
        newPayees[1] = payee2;
        newPayees[2] = payee3;

        uint256[] memory newShares = new uint256[](3);
        newShares[0] = 5000; // 50%
        newShares[1] = 3000; // 30%
        newShares[2] = 2000; // 20%

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        assertEq(vault.totalShares(), 10000);
        assertEq(vault.shares(payee1), 5000);
        assertEq(vault.shares(payee2), 3000);
        assertEq(vault.shares(payee3), 2000);

        address[] memory payees = vault.getPayees();
        assertEq(payees.length, 3);
    }

    function test_UpdatePayees_ReleasesFirst() public {
        _receivePayment(1000000);

        uint256 payee1Releasable = vault.releasable(payee1);
        assertGt(payee1Releasable, 0);

        address[] memory newPayees = new address[](1);
        newPayees[0] = payee3;

        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        // Old payees should have received their pending amounts
        assertGt(usdc.balanceOf(payee1), 0);
        assertGt(usdc.balanceOf(payee2), 0);
    }

    function test_RevertUpdatePayees_NotOwner() public {
        address[] memory newPayees = new address[](1);
        newPayees[0] = payee3;

        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(payee1);
        vm.expectRevert();
        vault.updatePayees(newPayees, newShares);
    }

    function test_RevertUpdatePayees_Mismatch() public {
        address[] memory newPayees = new address[](2);
        newPayees[0] = payee1;
        newPayees[1] = payee2;

        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        vm.expectRevert("PublisherVault: payees and shares length mismatch");
        vault.updatePayees(newPayees, newShares);
    }

    function test_RevertUpdatePayees_Empty() public {
        address[] memory newPayees = new address[](0);
        uint256[] memory newShares = new uint256[](0);

        vm.prank(owner);
        vm.expectRevert("PublisherVault: no payees");
        vault.updatePayees(newPayees, newShares);
    }

    // ============================================
    // ACCOUNTING RESET TESTS (Security Audit Round 3)
    // ============================================

    function test_UpdatePayees_AccountingReset() public {
        // Receive 1000 USDC
        _receivePayment(1000000);

        // Update payees: replace payee1+payee2 with payee3 only
        address[] memory newPayees = new address[](1);
        newPayees[0] = payee3;
        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        // After accounting reset, totalReleased should be 0
        assertEq(vault.totalReleased(), 0);

        // Receive another 500 USDC
        _receivePayment(500000);

        // payee3 should only be able to claim the 500 USDC (new funds)
        // not the full vault balance (old payees already got their share)
        assertEq(vault.releasable(payee3), 500000);
    }

    function test_UpdatePayees_ReAddedPayee_CleanSlate() public {
        // Receive 1000 USDC and release to payee1
        _receivePayment(1000000);
        vault.release(payee1);
        uint256 payee1FirstRelease = usdc.balanceOf(payee1);
        assertEq(payee1FirstRelease, 700000); // 70% of 1M

        // Update payees: keep payee1 as sole payee
        address[] memory newPayees = new address[](1);
        newPayees[0] = payee1;
        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        // payee1's _released should be reset to 0
        assertEq(vault.released(payee1), 0);

        // Receive 200 USDC
        _receivePayment(200000);

        // payee1 should be able to claim exactly 200 USDC (the new funds)
        assertEq(vault.releasable(payee1), 200000);
    }

    function test_UpdatePayees_AttackBlocked() public {
        // Scenario: payee1 (70%) and payee2 (30%) receive 1M USDC
        _receivePayment(1000000);

        // payee1 releases their 700k
        vault.release(payee1);
        assertEq(usdc.balanceOf(payee1), 700000);

        // Owner adds payee3 as replacement for payee1
        // Without the fix, payee3 could steal payee2's unreleased 300k
        address[] memory newPayees = new address[](2);
        newPayees[0] = payee2;
        newPayees[1] = payee3;
        uint256[] memory newShares = new uint256[](2);
        newShares[0] = 5000; // 50%
        newShares[1] = 5000; // 50%

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        // After updatePayees, payee2 got their pending 300k released
        assertEq(usdc.balanceOf(payee2), 300000);

        // Vault balance should be 0 (all funds distributed)
        assertEq(usdc.balanceOf(address(vault)), 0);

        // New payees should have nothing releasable (no new funds)
        assertEq(vault.releasable(payee2), 0);
        assertEq(vault.releasable(payee3), 0);

        // Receive new payment - should split correctly
        _receivePayment(100000);
        assertEq(vault.releasable(payee2), 50000); // 50%
        assertEq(vault.releasable(payee3), 50000); // 50%
    }

    function test_UpdatePayees_DustDistribution() public {
        // Use an amount that doesn't divide evenly: 1000003
        // With 70/30 split: payee1 gets 700002 (1000003*7000/10000), payee2 gets 300000 (1000003*3000/10000)
        // Dust of 1 remains in vault
        _receivePayment(1000003);

        // Update payees to single payee to capture dust
        address[] memory newPayees = new address[](1);
        newPayees[0] = payee3;
        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        vault.updatePayees(newPayees, newShares);

        // Old payees got their shares (with rounding)
        assertEq(usdc.balanceOf(payee1), 700002);
        assertEq(usdc.balanceOf(payee2), 300000);

        // Dust (1 unit) remains in vault, claimable by payee3
        uint256 dust = usdc.balanceOf(address(vault));
        assertEq(dust, 1);
        assertEq(vault.releasable(payee3), 1);
    }

    // ============================================
    // ADMIN TESTS
    // ============================================

    function test_SetPaymentsContract() public {
        address newPayments = address(0x999);

        vm.prank(owner);
        vault.setPaymentsContract(newPayments);

        assertEq(vault.paymentsContract(), newPayments);
    }

    function test_RevertSetPaymentsContract_NotOwner() public {
        vm.prank(payee1);
        vm.expectRevert();
        vault.setPaymentsContract(address(0x999));
    }

    // ============================================
    // ERC-4626 TESTS
    // ============================================

    function test_Asset() public view {
        assertEq(vault.asset(), address(usdc));
    }

    function test_TotalAssets() public {
        _receivePayment(1000000);

        // Vault receives full amount (fee deducted in OpenGrantPayments)
        assertEq(vault.totalAssets(), 1000000);
    }

    // ============================================
    // PLATFORM FEE TESTS
    // ============================================

    function test_NoFeeAtVaultLevel() public {
        // 100 USDC - vault should not deduct any fee
        uint256 payment = 100000000;
        usdc.mint(paymentsContract, payment);

        vm.prank(paymentsContract);
        vault.receivePayment(payment);

        // Platform fee is handled by OpenGrantPayments, not vault
        assertEq(usdc.balanceOf(platformFeeReceiver), 0);
        assertEq(usdc.balanceOf(address(vault)), 100000000);
    }

    function test_NoFeeSmallAmount() public {
        // 1 USDC - vault should not deduct any fee
        uint256 payment = 1000000;
        usdc.mint(paymentsContract, payment);

        vm.prank(paymentsContract);
        vault.receivePayment(payment);

        assertEq(usdc.balanceOf(platformFeeReceiver), 0);
        assertEq(usdc.balanceOf(address(vault)), 1000000);
    }

    // ============================================
    // SHARE DISTRIBUTION TESTS
    // ============================================

    function test_UnequalShares() public {
        // Create vault with unequal shares
        address[] memory payees = new address[](3);
        payees[0] = address(0x20);
        payees[1] = address(0x21);
        payees[2] = address(0x22);

        uint256[] memory shares = new uint256[](3);
        shares[0] = 5000; // 50%
        shares[1] = 3000; // 30%
        shares[2] = 2000; // 20%

        PublisherVault unequalVault = new PublisherVault(
            IERC20(address(usdc)),
            "Unequal Vault",
            "UV",
            owner,
            payees,
            shares,
            paymentsContract
        );

        // Mint and approve
        usdc.mint(paymentsContract, 10000000);
        vm.prank(paymentsContract);
        usdc.approve(address(unequalVault), type(uint256).max);

        // Receive payment
        vm.prank(paymentsContract);
        unequalVault.receivePayment(10000000);

        // Vault receives full amount (fee deducted upstream)
        // payee0 (50%): 10,000,000 * 5000 / 10000 = 5,000,000
        // payee1 (30%): 10,000,000 * 3000 / 10000 = 3,000,000
        // payee2 (20%): 10,000,000 * 2000 / 10000 = 2,000,000
        assertEq(unequalVault.releasable(address(0x20)), 5000000);
        assertEq(unequalVault.releasable(address(0x21)), 3000000);
        assertEq(unequalVault.releasable(address(0x22)), 2000000);
    }

    // ============================================
    // ERC4626 SECURITY TESTS - Deposits/Withdrawals Disabled
    // ============================================

    function test_RevertDeposit_Disabled() public {
        usdc.mint(address(this), 1000000);
        usdc.approve(address(vault), 1000000);

        vm.expectRevert("PublisherVault: deposits disabled");
        vault.deposit(1000000, address(this));
    }

    function test_RevertMint_Disabled() public {
        usdc.mint(address(this), 1000000);
        usdc.approve(address(vault), 1000000);

        vm.expectRevert("PublisherVault: deposits disabled");
        vault.mint(1000000, address(this));
    }

    function test_RevertWithdraw_Disabled() public {
        vm.expectRevert("PublisherVault: withdrawals disabled");
        vault.withdraw(1000000, address(this), address(this));
    }

    function test_RevertRedeem_Disabled() public {
        vm.expectRevert("PublisherVault: withdrawals disabled");
        vault.redeem(1000000, address(this), address(this));
    }

    function test_MaxDeposit_ReturnsZero() public view {
        assertEq(vault.maxDeposit(address(this)), 0);
    }

    function test_MaxMint_ReturnsZero() public view {
        assertEq(vault.maxMint(address(this)), 0);
    }

    function test_MaxWithdraw_ReturnsZero() public view {
        assertEq(vault.maxWithdraw(address(this)), 0);
    }

    function test_MaxRedeem_ReturnsZero() public view {
        assertEq(vault.maxRedeem(address(this)), 0);
    }

    function test_DepositAttackBlocked() public {
        address attacker = address(0xBEEF);

        // Step 1: Attacker tries to deposit USDC to get shares
        usdc.mint(attacker, 100e6);
        vm.startPrank(attacker);
        usdc.approve(address(vault), 100e6);

        // Deposit is blocked - attack fails at step 1
        vm.expectRevert("PublisherVault: deposits disabled");
        vault.deposit(100e6, attacker);
        vm.stopPrank();

        // Step 2: Vault receives legitimate payment
        _receivePayment(1000e6);

        // Step 3: Attacker tries to redeem (even though they have no shares)
        vm.prank(attacker);
        vm.expectRevert("PublisherVault: withdrawals disabled");
        vault.redeem(1, attacker, attacker);

        // Verify vault funds are safe
        assertEq(usdc.balanceOf(address(vault)), 1000e6);
        assertEq(usdc.balanceOf(attacker), 100e6); // Attacker still has their own USDC
    }

    // ============================================
    // SETPAYMENTSCONTRACT EVENT & VALIDATION TESTS
    // ============================================

    function test_SetPaymentsContract_EmitsEvent() public {
        address newPayments = address(0x999);

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit PublisherVault.PaymentsContractUpdated(paymentsContract, newPayments);
        vault.setPaymentsContract(newPayments);
    }

    function test_RevertSetPaymentsContract_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("PublisherVault: zero address");
        vault.setPaymentsContract(address(0));
    }

    // ============================================
    // ERC-4626 PREVIEW TESTS
    // ============================================

    function test_PreviewDeposit_ReturnsZero() public view {
        assertEq(vault.previewDeposit(1000000), 0);
    }

    function test_PreviewMint_ReturnsZero() public view {
        assertEq(vault.previewMint(1000000), 0);
    }

    function test_PreviewWithdraw_ReturnsZero() public view {
        assertEq(vault.previewWithdraw(1000000), 0);
    }

    function test_PreviewRedeem_ReturnsZero() public view {
        assertEq(vault.previewRedeem(1000000), 0);
    }

    // ============================================
    // CONSTRUCTOR VALIDATION TESTS
    // ============================================

    function test_RevertConstructor_ZeroPaymentsContract() public {
        address[] memory payees_ = new address[](1);
        payees_[0] = payee1;
        uint256[] memory shares_ = new uint256[](1);
        shares_[0] = 10000;

        vm.expectRevert("PublisherVault: invalid payments contract");
        new PublisherVault(
            IERC20(address(usdc)),
            "Test Vault",
            "TV",
            owner,
            payees_,
            shares_,
            address(0)
        );
    }

    // ============================================
    // GRIEFING PROTECTION TESTS (H2)
    // ============================================

    function test_UpdatePayees_SucceedsWithBlacklistedPayee() public {
        // Deploy vault with blacklistable USDC
        BlacklistableUSDC bUsdc = new BlacklistableUSDC();

        address[] memory payees_ = new address[](2);
        payees_[0] = payee1;
        payees_[1] = payee2;
        uint256[] memory shares_ = new uint256[](2);
        shares_[0] = 7000;
        shares_[1] = 3000;

        PublisherVault bVault = new PublisherVault(
            IERC20(address(bUsdc)), "B Vault", "BV", owner, payees_, shares_, paymentsContract
        );

        // Fund vault via payments contract
        bUsdc.mint(paymentsContract, 1000000);
        vm.prank(paymentsContract);
        bUsdc.approve(address(bVault), type(uint256).max);
        vm.prank(paymentsContract);
        bVault.receivePayment(1000000);

        // Blacklist payee1 — transfer to payee1 will revert
        bUsdc.blacklist(payee1);

        // updatePayees should still succeed (best-effort release)
        address[] memory newPayees = new address[](1);
        newPayees[0] = payee3;
        uint256[] memory newShares = new uint256[](1);
        newShares[0] = 10000;

        vm.prank(owner);
        bVault.updatePayees(newPayees, newShares);

        // payee2 received their share (not blacklisted)
        assertEq(bUsdc.balanceOf(payee2), 300000);
        // payee1 received nothing (blacklisted)
        assertEq(bUsdc.balanceOf(payee1), 0);
        // Unreleased funds stay in vault
        assertGt(bUsdc.balanceOf(address(bVault)), 0);

        // Blacklisted payee's share is reserved (not redistributed to new payees)
        // payee1 had 70% of 1,000,000 = 700,000
        assertEq(bVault.unreleasedReserve(), 700000);

        // New payee (payee3) should NOT have access to reserved funds
        assertEq(bVault.releasable(payee3), 0);

        // Owner can claim reserve and send to blacklisted payee's alternative address
        vm.prank(owner);
        bVault.claimUnreleasedReserve(payee3, 700000);
        assertEq(bUsdc.balanceOf(payee3), 700000);
        assertEq(bVault.unreleasedReserve(), 0);
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    function _receivePayment(uint256 amount) internal {
        usdc.mint(paymentsContract, amount);
        vm.prank(paymentsContract);
        vault.receivePayment(amount);
    }
}
