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
            platformFeeReceiver,
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
        assertEq(vault.platformFeeReceiver(), platformFeeReceiver);
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
            platformFeeReceiver,
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
    // HELPER FUNCTIONS
    // ============================================

    function _receivePayment(uint256 amount) internal {
        usdc.mint(paymentsContract, amount);
        vm.prank(paymentsContract);
        vault.receivePayment(amount);
    }
}
