// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { OpenGrantFactory } from "../src/OpenGrantFactory.sol";
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

contract OpenGrantFactoryTest is Test {
    MockUSDC public usdc;
    OpenGrantFactory public factory;

    address public owner = address(0x1);
    address public paymentsContract = address(0x3);
    address public publisher1 = address(0x10);
    address public publisher2 = address(0x11);
    address public payee1 = address(0x20);
    address public payee2 = address(0x21);

    function setUp() public {
        usdc = new MockUSDC();

        factory = new OpenGrantFactory(
            address(usdc),
            owner
        );

        // Set payments contract (required before deploying vaults)
        vm.prank(owner);
        factory.setPaymentsContract(paymentsContract);
    }

    // ============================================
    // CONSTRUCTOR TESTS
    // ============================================

    function test_Constructor() public view {
        assertEq(address(factory.usdc()), address(usdc));
        assertEq(factory.owner(), owner);
    }

    function test_RevertConstructor_InvalidUSDC() public {
        vm.expectRevert("OpenGrantFactory: invalid USDC");
        new OpenGrantFactory(address(0), owner);
    }

    // ============================================
    // DEPLOY VAULT TESTS
    // ============================================

    function test_DeployVault() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        address vault = factory.deployVault(payees, shares);

        assertTrue(vault != address(0));
        assertEq(factory.publisherVaults(publisher1), vault);
        assertEq(factory.getVault(publisher1), vault);
        assertEq(factory.getVaultCount(), 1);
    }

    function test_DeployVault_ConfiguredCorrectly() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        address vaultAddr = factory.deployVault(payees, shares);

        PublisherVault vault = PublisherVault(vaultAddr);
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.owner(), publisher1);
        assertEq(vault.paymentsContract(), paymentsContract);
        assertEq(vault.totalShares(), 10000);
        assertEq(vault.shares(payee1), 7000);
        assertEq(vault.shares(payee2), 3000);
    }

    function test_DeployVault_EmitsEvent() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        vm.expectEmit(true, false, false, true);
        emit OpenGrantFactory.VaultDeployed(publisher1, address(0), payees, shares);
        factory.deployVault(payees, shares);
    }

    function test_DeployVault_MultiplePublishers() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        address vault1 = factory.deployVault(payees, shares);

        vm.prank(publisher2);
        address vault2 = factory.deployVault(payees, shares);

        assertTrue(vault1 != vault2);
        assertEq(factory.getVaultCount(), 2);

        address[] memory allVaults = factory.getAllVaults();
        assertEq(allVaults.length, 2);
        assertEq(allVaults[0], vault1);
        assertEq(allVaults[1], vault2);
    }

    function test_RevertDeployVault_AlreadyExists() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        factory.deployVault(payees, shares);

        vm.prank(publisher1);
        vm.expectRevert("OpenGrantFactory: vault already exists");
        factory.deployVault(payees, shares);
    }

    function test_RevertDeployVault_EmptyPayees() public {
        address[] memory payees = new address[](0);
        uint256[] memory shares = new uint256[](0);

        vm.prank(publisher1);
        vm.expectRevert("OpenGrantFactory: no payees");
        factory.deployVault(payees, shares);
    }

    function test_RevertDeployVault_ArraysMismatch() public {
        address[] memory payees = new address[](2);
        payees[0] = payee1;
        payees[1] = payee2;

        uint256[] memory shares = new uint256[](1);
        shares[0] = 10000;

        vm.prank(publisher1);
        vm.expectRevert("OpenGrantFactory: arrays mismatch");
        factory.deployVault(payees, shares);
    }

    function test_RevertDeployVault_PaymentsNotSet() public {
        // Create a fresh factory without payments contract set
        OpenGrantFactory freshFactory = new OpenGrantFactory(
            address(usdc),
            owner
        );

        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        vm.expectRevert("OpenGrantFactory: payments not set");
        freshFactory.deployVault(payees, shares);
    }

    // ============================================
    // VIEW FUNCTION TESTS
    // ============================================

    function test_GetVault_ReturnsZeroForUnknown() public view {
        assertEq(factory.getVault(address(0x999)), address(0));
    }

    function test_GetVaultCount_InitiallyZero() public {
        OpenGrantFactory freshFactory = new OpenGrantFactory(
            address(usdc),
            owner
        );
        assertEq(freshFactory.getVaultCount(), 0);
    }

    function test_GetAllVaults_InitiallyEmpty() public {
        OpenGrantFactory freshFactory = new OpenGrantFactory(
            address(usdc),
            owner
        );
        address[] memory vaults = freshFactory.getAllVaults();
        assertEq(vaults.length, 0);
    }

    // ============================================
    // ADMIN FUNCTION TESTS
    // ============================================

    function test_SetRegistry() public {
        address newRegistry = address(0x100);

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit OpenGrantFactory.RegistryUpdated(address(0), newRegistry);
        factory.setRegistry(newRegistry);

        assertEq(factory.registry(), newRegistry);
    }

    function test_RevertSetRegistry_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantFactory: invalid registry");
        factory.setRegistry(address(0));
    }

    function test_RevertSetRegistry_NotOwner() public {
        vm.prank(publisher1);
        vm.expectRevert();
        factory.setRegistry(address(0x100));
    }

    function test_SetPaymentsContract() public {
        address newPayments = address(0x200);

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit OpenGrantFactory.PaymentsContractUpdated(paymentsContract, newPayments);
        factory.setPaymentsContract(newPayments);

        assertEq(factory.paymentsContract(), newPayments);
    }

    function test_RevertSetPaymentsContract_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("OpenGrantFactory: invalid payments contract");
        factory.setPaymentsContract(address(0));
    }

    function test_RevertSetPaymentsContract_NotOwner() public {
        vm.prank(publisher1);
        vm.expectRevert();
        factory.setPaymentsContract(address(0x200));
    }

    // ============================================
    // INTEGRATION: ERC4626 DISABLED ON DEPLOYED VAULT
    // ============================================

    function test_DeployedVault_ERC4626Disabled() public {
        (address[] memory payees, uint256[] memory shares) = _defaultPayeesShares();

        vm.prank(publisher1);
        address vaultAddr = factory.deployVault(payees, shares);

        PublisherVault vault = PublisherVault(vaultAddr);

        // Verify ERC4626 deposit/withdraw are disabled on factory-deployed vaults
        assertEq(vault.maxDeposit(address(this)), 0);
        assertEq(vault.maxMint(address(this)), 0);
        assertEq(vault.maxWithdraw(address(this)), 0);
        assertEq(vault.maxRedeem(address(this)), 0);

        usdc.mint(address(this), 1e6);
        usdc.approve(vaultAddr, 1e6);

        vm.expectRevert("PublisherVault: deposits disabled");
        vault.deposit(1e6, address(this));
    }

    // ============================================
    // HELPERS
    // ============================================

    function _defaultPayeesShares() internal view returns (address[] memory payees, uint256[] memory shares) {
        payees = new address[](2);
        payees[0] = payee1;
        payees[1] = payee2;

        shares = new uint256[](2);
        shares[0] = 7000;
        shares[1] = 3000;
    }
}
