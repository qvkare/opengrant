// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { GRANTToken } from "../src/GRANTToken.sol";

contract GRANTTokenTest is Test {
    GRANTToken public token;

    address public deployer = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    function setUp() public {
        vm.prank(deployer);
        token = new GRANTToken();
    }

    // ============================================
    // SUPPLY TESTS
    // ============================================

    function test_TotalSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
    }

    function test_DeployerBalance() public view {
        assertEq(token.balanceOf(deployer), 1_000_000_000 ether);
    }

    function test_NameAndSymbol() public view {
        assertEq(token.name(), "Grant Token");
        assertEq(token.symbol(), "GRANT");
    }

    function test_Decimals() public view {
        assertEq(token.decimals(), 18);
    }

    function test_TotalSupplyConstant() public view {
        assertEq(token.TOTAL_SUPPLY(), 1_000_000_000 ether);
    }

    // ============================================
    // TRANSFER TESTS
    // ============================================

    function test_Transfer() public {
        uint256 amount = 1000 ether;

        vm.prank(deployer);
        token.transfer(alice, amount);

        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(deployer), 1_000_000_000 ether - amount);
    }

    function test_TransferFrom() public {
        uint256 amount = 500 ether;

        vm.prank(deployer);
        token.approve(alice, amount);

        vm.prank(alice);
        token.transferFrom(deployer, bob, amount);

        assertEq(token.balanceOf(bob), amount);
    }

    function test_RevertTransfer_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 1 ether);
    }

    // ============================================
    // PERMIT TESTS (EIP-2612)
    // ============================================

    function test_Permit() public {
        uint256 privateKey = 0xA11CE;
        address signer = vm.addr(privateKey);
        uint256 amount = 100 ether;

        // Transfer tokens to signer
        vm.prank(deployer);
        token.transfer(signer, amount);

        // Build permit signature
        uint256 nonce = token.nonces(signer);
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                signer,
                bob,
                amount,
                nonce,
                deadline
            )
        );

        bytes32 domainSeparator = token.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

        // Execute permit (gasless approve)
        token.permit(signer, bob, amount, deadline, v, r, s);

        assertEq(token.allowance(signer, bob), amount);
        assertEq(token.nonces(signer), nonce + 1);
    }

    // ============================================
    // VOTES TESTS (Governance Delegation)
    // ============================================

    function test_DelegateSelf() public {
        vm.prank(deployer);
        token.transfer(alice, 1000 ether);

        // Before delegation, no voting power
        assertEq(token.getVotes(alice), 0);

        // Self-delegate to activate voting power
        vm.prank(alice);
        token.delegate(alice);

        assertEq(token.getVotes(alice), 1000 ether);
    }

    function test_DelegateToOther() public {
        vm.prank(deployer);
        token.transfer(alice, 1000 ether);

        // Alice delegates to Bob
        vm.prank(alice);
        token.delegate(bob);

        assertEq(token.getVotes(alice), 0);
        assertEq(token.getVotes(bob), 1000 ether);
    }

    function test_VotesTrackTransfers() public {
        vm.prank(deployer);
        token.transfer(alice, 1000 ether);

        vm.prank(alice);
        token.delegate(alice);

        assertEq(token.getVotes(alice), 1000 ether);

        // Transfer half to bob
        vm.prank(alice);
        token.transfer(bob, 400 ether);

        assertEq(token.getVotes(alice), 600 ether);
    }

    function test_Delegates() public {
        vm.prank(alice);
        token.delegate(bob);

        assertEq(token.delegates(alice), bob);
    }

    // ============================================
    // NO MINT TESTS
    // ============================================

    function test_NoMintFunction() public view {
        // Verify there is no way to increase supply
        // The contract has no mint() function - this test documents that property
        assertEq(token.totalSupply(), token.TOTAL_SUPPLY());
    }
}
