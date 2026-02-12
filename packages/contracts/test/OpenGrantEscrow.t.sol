// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { OpenGrantEscrow } from "../src/OpenGrantEscrow.sol";
import { IOpenGrantEscrow } from "../src/interfaces/IOpenGrantEscrow.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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

contract OpenGrantEscrowTest is Test {
    using MessageHashUtils for bytes32;

    MockUSDC public usdc;
    OpenGrantEscrow public escrow;

    address public owner = address(0x1);
    uint256 public signerPrivateKey = 0xA11CE;
    address public signer;
    address public donor1 = address(0x3);
    address public donor2 = address(0x4);
    address public claimWallet = address(0x5);

    bytes32 public repoHash1 = keccak256(abi.encodePacked(uint256(12345)));
    bytes32 public repoHash2 = keccak256(abi.encodePacked(uint256(67890)));

    uint256 public constant ONE_USDC = 1e6;
    uint256 public constant TEN_USDC = 10e6;
    uint256 public constant HUNDRED_USDC = 100e6;

    function setUp() public {
        signer = vm.addr(signerPrivateKey);

        usdc = new MockUSDC();
        escrow = new OpenGrantEscrow(address(usdc), signer, owner);

        // Fund donors
        usdc.mint(donor1, 10_000e6);
        usdc.mint(donor2, 10_000e6);

        // Approve escrow
        vm.prank(donor1);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(donor2);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ============================================
    // CONSTRUCTOR
    // ============================================

    function test_constructor_setsState() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.authorizedSigner(), signer);
        assertEq(escrow.owner(), owner);
    }

    function test_constructor_revertsZeroUsdc() public {
        vm.expectRevert("Invalid USDC address");
        new OpenGrantEscrow(address(0), signer, owner);
    }

    function test_constructor_revertsZeroSigner() public {
        vm.expectRevert("Invalid signer address");
        new OpenGrantEscrow(address(usdc), address(0), owner);
    }

    // ============================================
    // DONATE
    // ============================================

    function test_donate_basic() public {
        vm.prank(donor1);
        vm.expectEmit(true, true, false, true);
        emit IOpenGrantEscrow.Donated(repoHash1, donor1, TEN_USDC, false);
        escrow.donate(repoHash1, TEN_USDC, false);

        assertEq(escrow.repoBalances(repoHash1), TEN_USDC);
        assertEq(escrow.repoTotalDonated(repoHash1), TEN_USDC);
        assertEq(escrow.repoDonorCount(repoHash1), 1);
        assertEq(escrow.totalDonated(), TEN_USDC);
        assertTrue(escrow.isFundedRepo(repoHash1));
        assertEq(escrow.getFundedRepoCount(), 1);
    }

    function test_donate_accumulates() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true);

        assertEq(escrow.repoBalances(repoHash1), TEN_USDC * 2);
        assertEq(escrow.repoDonorCount(repoHash1), 1); // same donor
    }

    function test_donate_multipleDonors() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        vm.prank(donor2);
        escrow.donate(repoHash1, TEN_USDC, false);

        assertEq(escrow.repoDonorCount(repoHash1), 2);
        assertEq(escrow.repoBalances(repoHash1), TEN_USDC * 2);
    }

    function test_donate_revertsBelowMinimum() public {
        vm.prank(donor1);
        vm.expectRevert("Below minimum donation");
        escrow.donate(repoHash1, ONE_USDC - 1, false);
    }

    function test_donate_revertsZeroHash() public {
        vm.prank(donor1);
        vm.expectRevert("Invalid repo hash");
        escrow.donate(bytes32(0), TEN_USDC, false);
    }

    function test_donate_revertsInsufficientBalance() public {
        address poorDonor = address(0x99);
        usdc.mint(poorDonor, ONE_USDC / 2);
        vm.prank(poorDonor);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(poorDonor);
        vm.expectRevert();
        escrow.donate(repoHash1, TEN_USDC, false);
    }

    function test_donate_revertsWhenPaused() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(donor1);
        vm.expectRevert();
        escrow.donate(repoHash1, TEN_USDC, false);
    }

    // ============================================
    // BATCH DONATE
    // ============================================

    function test_batchDonate_multiRepo() public {
        bytes32[] memory repos = new bytes32[](3);
        uint256[] memory amounts = new uint256[](3);
        bool[] memory flags = new bool[](3);

        repos[0] = repoHash1;
        repos[1] = repoHash2;
        repos[2] = keccak256(abi.encodePacked(uint256(99999)));
        amounts[0] = TEN_USDC;
        amounts[1] = TEN_USDC * 2;
        amounts[2] = TEN_USDC * 3;
        flags[0] = false;
        flags[1] = true;
        flags[2] = false;

        uint256 totalAmount = TEN_USDC * 6;
        uint256 balanceBefore = usdc.balanceOf(donor1);

        vm.prank(donor1);
        escrow.batchDonate(repos, amounts, flags);

        assertEq(escrow.repoBalances(repoHash1), TEN_USDC);
        assertEq(escrow.repoBalances(repoHash2), TEN_USDC * 2);
        assertEq(escrow.totalDonated(), totalAmount);
        assertEq(usdc.balanceOf(donor1), balanceBefore - totalAmount);
        assertEq(escrow.getFundedRepoCount(), 3);
    }

    function test_batchDonate_revertsArrayMismatch() public {
        bytes32[] memory repos = new bytes32[](2);
        uint256[] memory amounts = new uint256[](3);
        bool[] memory flags = new bool[](2);

        repos[0] = repoHash1;
        repos[1] = repoHash2;
        amounts[0] = TEN_USDC;
        amounts[1] = TEN_USDC;
        amounts[2] = TEN_USDC;
        flags[0] = false;
        flags[1] = false;

        vm.prank(donor1);
        vm.expectRevert("Array length mismatch");
        escrow.batchDonate(repos, amounts, flags);
    }

    function test_batchDonate_revertsEmpty() public {
        bytes32[] memory repos = new bytes32[](0);
        uint256[] memory amounts = new uint256[](0);
        bool[] memory flags = new bool[](0);

        vm.prank(donor1);
        vm.expectRevert("Empty arrays");
        escrow.batchDonate(repos, amounts, flags);
    }

    function test_batchDonate_singleTransferFrom() public {
        bytes32[] memory repos = new bytes32[](2);
        uint256[] memory amounts = new uint256[](2);
        bool[] memory flags = new bool[](2);

        repos[0] = repoHash1;
        repos[1] = repoHash2;
        amounts[0] = TEN_USDC;
        amounts[1] = TEN_USDC * 2;
        flags[0] = false;
        flags[1] = false;

        uint256 balanceBefore = usdc.balanceOf(donor1);

        vm.prank(donor1);
        escrow.batchDonate(repos, amounts, flags);

        // Total deducted is sum of both
        assertEq(usdc.balanceOf(donor1), balanceBefore - TEN_USDC * 3);
        // Contract holds the funds
        assertEq(usdc.balanceOf(address(escrow)), TEN_USDC * 3);
    }

    // ============================================
    // CLAIM
    // ============================================

    function _signClaim(
        bytes32 _repoHash,
        address _wallet,
        uint256 _nonce
    ) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(_repoHash, _wallet, _nonce, block.chainid, address(escrow))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function test_claim_validSignature() public {
        // Donate first
        vm.prank(donor1);
        escrow.donate(repoHash1, HUNDRED_USDC, false);

        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);

        uint256 walletBalanceBefore = usdc.balanceOf(claimWallet);

        vm.expectEmit(true, true, false, true);
        emit IOpenGrantEscrow.Claimed(repoHash1, claimWallet, HUNDRED_USDC);

        // Anyone can call claim with valid signature
        vm.prank(claimWallet);
        escrow.claim(repoHash1, claimWallet, nonce, sig);

        assertEq(usdc.balanceOf(claimWallet), walletBalanceBefore + HUNDRED_USDC);
        assertEq(escrow.repoBalances(repoHash1), 0);
        assertEq(escrow.repoTotalClaimed(repoHash1), HUNDRED_USDC);
        assertEq(escrow.repoClaimedWallet(repoHash1), claimWallet);
        assertEq(escrow.totalClaimed(), HUNDRED_USDC);
    }

    function test_claim_revertsInvalidSignature() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        // Sign with wrong key
        uint256 wrongKey = 0xB0B;
        bytes32 messageHash = keccak256(
            abi.encodePacked(repoHash1, claimWallet, uint256(1), block.chainid, address(escrow))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid signature");
        escrow.claim(repoHash1, claimWallet, 1, badSig);
    }

    function test_claim_revertsNonceReuse() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        uint256 nonce = 42;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);

        escrow.claim(repoHash1, claimWallet, nonce, sig);

        // Second donation and claim with same nonce
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        vm.expectRevert("Nonce already used");
        escrow.claim(repoHash1, claimWallet, nonce, sig);
    }

    function test_claim_revertsNoFunds() public {
        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);

        vm.expectRevert("No funds to claim");
        escrow.claim(repoHash1, claimWallet, nonce, sig);
    }

    function test_claim_revertsZeroWallet() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, address(0), nonce);

        vm.expectRevert("Invalid wallet");
        escrow.claim(repoHash1, address(0), nonce, sig);
    }

    // ============================================
    // REFUND
    // ============================================

    function test_refund_afterDelay() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        uint256 balanceBefore = usdc.balanceOf(donor1);

        // Warp 365 days
        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectEmit(true, true, false, true);
        emit IOpenGrantEscrow.Refunded(repoHash1, donor1, TEN_USDC);
        escrow.refund(repoHash1);

        assertEq(usdc.balanceOf(donor1), balanceBefore + TEN_USDC);
        assertEq(escrow.repoBalances(repoHash1), 0);
        assertEq(escrow.totalRefunded(), TEN_USDC);
    }

    function test_refund_revertsTooEarly() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        vm.warp(block.timestamp + 364 days);

        vm.prank(donor1);
        vm.expectRevert("Refund delay not elapsed");
        escrow.refund(repoHash1);
    }

    function test_refund_revertsAlreadyClaimed() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        // Claim the repo
        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);
        escrow.claim(repoHash1, claimWallet, nonce, sig);

        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectRevert("No donation found");
        escrow.refund(repoHash1);
    }

    function test_refund_partialAfterRedistribution() public {
        // Donor1 donates 100, Donor2 donates 50
        vm.prank(donor1);
        escrow.donate(repoHash1, HUNDRED_USDC, true);
        vm.prank(donor2);
        escrow.donate(repoHash1, TEN_USDC * 5, false);

        vm.warp(block.timestamp + 365 days);

        // Donor1 redistributes their 100
        vm.prank(donor1);
        escrow.redistribute(repoHash1, repoHash2);

        // Repo1 now has only donor2's 50
        assertEq(escrow.repoBalances(repoHash1), TEN_USDC * 5);

        // Donor2 refunds their 50
        vm.prank(donor2);
        escrow.refund(repoHash1);

        assertEq(escrow.repoBalances(repoHash1), 0);
    }

    function test_refund_revertsNoDonation() public {
        vm.warp(block.timestamp + 365 days);
        vm.prank(donor1);
        vm.expectRevert("No donation found");
        escrow.refund(repoHash1);
    }

    // ============================================
    // REDISTRIBUTE
    // ============================================

    function test_redistribute_valid() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true); // opt-in

        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectEmit(true, true, true, true);
        emit IOpenGrantEscrow.Redistributed(repoHash1, repoHash2, donor1, TEN_USDC);
        escrow.redistribute(repoHash1, repoHash2);

        assertEq(escrow.repoBalances(repoHash1), 0);
        assertEq(escrow.repoBalances(repoHash2), TEN_USDC);
    }

    function test_redistribute_revertsNotOptedIn() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false); // not opted in

        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectRevert("Redistribution not opted in");
        escrow.redistribute(repoHash1, repoHash2);
    }

    function test_redistribute_revertsSameRepo() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true);

        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectRevert("Cannot redistribute to same repo");
        escrow.redistribute(repoHash1, repoHash1);
    }

    function test_redistribute_revertsTooEarly() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true);

        vm.warp(block.timestamp + 364 days);

        vm.prank(donor1);
        vm.expectRevert("Refund delay not elapsed");
        escrow.redistribute(repoHash1, repoHash2);
    }

    function test_redistribute_revertsAlreadyClaimed() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true);

        // Claim
        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);
        escrow.claim(repoHash1, claimWallet, nonce, sig);

        vm.warp(block.timestamp + 365 days);

        vm.prank(donor1);
        vm.expectRevert("No donation found");
        escrow.redistribute(repoHash1, repoHash2);
    }

    // ============================================
    // ADMIN
    // ============================================

    function test_setAuthorizedSigner() public {
        address newSigner = address(0xABC);

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit IOpenGrantEscrow.AuthorizedSignerUpdated(signer, newSigner);
        escrow.setAuthorizedSigner(newSigner);

        assertEq(escrow.authorizedSigner(), newSigner);
    }

    function test_setAuthorizedSigner_revertsNonOwner() public {
        vm.prank(donor1);
        vm.expectRevert();
        escrow.setAuthorizedSigner(address(0xABC));
    }

    function test_setAuthorizedSigner_revertsZero() public {
        vm.prank(owner);
        vm.expectRevert("Invalid signer");
        escrow.setAuthorizedSigner(address(0));
    }

    function test_pause_blocksDonate() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(donor1);
        vm.expectRevert();
        escrow.donate(repoHash1, TEN_USDC, false);
    }

    function test_unpause_resumesDonate() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(owner);
        escrow.unpause();

        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);
        assertEq(escrow.repoBalances(repoHash1), TEN_USDC);
    }

    function test_pause_blocksBatchDonate() public {
        vm.prank(owner);
        escrow.pause();

        bytes32[] memory repos = new bytes32[](1);
        uint256[] memory amounts = new uint256[](1);
        bool[] memory flags = new bool[](1);
        repos[0] = repoHash1;
        amounts[0] = TEN_USDC;
        flags[0] = false;

        vm.prank(donor1);
        vm.expectRevert();
        escrow.batchDonate(repos, amounts, flags);
    }

    // ============================================
    // VIEWS
    // ============================================

    function test_getRepoInfo() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        IOpenGrantEscrow.RepoInfo memory info = escrow.getRepoInfo(repoHash1);
        assertEq(info.totalBalance, TEN_USDC);
        assertEq(info.totalDonated, TEN_USDC);
        assertEq(info.totalClaimed, 0);
        assertEq(info.claimedWallet, address(0));
        assertEq(info.donorCount, 1);
    }

    function test_getDonation() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, true);

        IOpenGrantEscrow.Donation memory d = escrow.getDonation(repoHash1, donor1);
        assertEq(d.amount, TEN_USDC);
        assertTrue(d.redistributeOnTimeout);
        assertGt(d.timestamp, 0);
    }

    function test_getFundedRepoCount() public {
        assertEq(escrow.getFundedRepoCount(), 0);

        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);
        assertEq(escrow.getFundedRepoCount(), 1);

        vm.prank(donor1);
        escrow.donate(repoHash2, TEN_USDC, false);
        assertEq(escrow.getFundedRepoCount(), 2);

        // Donating to same repo doesn't increase count
        vm.prank(donor2);
        escrow.donate(repoHash1, TEN_USDC, false);
        assertEq(escrow.getFundedRepoCount(), 2);
    }

    function test_getRepoInfo_afterClaim() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, HUNDRED_USDC, false);

        uint256 nonce = 1;
        bytes memory sig = _signClaim(repoHash1, claimWallet, nonce);
        escrow.claim(repoHash1, claimWallet, nonce, sig);

        IOpenGrantEscrow.RepoInfo memory info = escrow.getRepoInfo(repoHash1);
        assertEq(info.totalBalance, 0);
        assertEq(info.totalDonated, HUNDRED_USDC);
        assertEq(info.totalClaimed, HUNDRED_USDC);
        assertEq(info.claimedWallet, claimWallet);
    }

    // ============================================
    // EDGE CASES
    // ============================================

    function test_donate_exactMinimum() public {
        vm.prank(donor1);
        escrow.donate(repoHash1, ONE_USDC, false);
        assertEq(escrow.repoBalances(repoHash1), ONE_USDC);
    }

    function test_claim_thenDonateAgain() public {
        // First round: donate and claim
        vm.prank(donor1);
        escrow.donate(repoHash1, TEN_USDC, false);

        uint256 nonce1 = 1;
        bytes memory sig1 = _signClaim(repoHash1, claimWallet, nonce1);
        escrow.claim(repoHash1, claimWallet, nonce1, sig1);

        // Second round: new donation after claim
        vm.prank(donor2);
        escrow.donate(repoHash1, TEN_USDC * 2, false);

        assertEq(escrow.repoBalances(repoHash1), TEN_USDC * 2);

        // Claim again with new nonce
        uint256 nonce2 = 2;
        bytes memory sig2 = _signClaim(repoHash1, claimWallet, nonce2);
        escrow.claim(repoHash1, claimWallet, nonce2, sig2);

        assertEq(escrow.repoTotalClaimed(repoHash1), TEN_USDC * 3);
    }
}
