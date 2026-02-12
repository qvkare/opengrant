// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IOpenGrantEscrow } from "./interfaces/IOpenGrantEscrow.sol";

/**
 * @title OpenGrantEscrow
 * @notice Trustless USDC escrow for funding open source GitHub projects
 * @dev Immutable (not upgradeable) for maximum trust. User-initiated claims
 *      with backend ECDSA authorization to verify GitHub repo ownership.
 */
contract OpenGrantEscrow is IOpenGrantEscrow, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============================================
    // CONSTANTS
    // ============================================

    uint256 public constant MIN_DONATION = 1e6;      // 1 USDC (6 decimals)
    uint256 public constant REFUND_DELAY = 365 days;

    // ============================================
    // STATE
    // ============================================

    IERC20 public immutable usdc;
    address public authorizedSigner;

    // Per-repo state
    mapping(bytes32 => uint256) public repoBalances;
    mapping(bytes32 => uint256) public repoTotalDonated;
    mapping(bytes32 => uint256) public repoTotalClaimed;
    mapping(bytes32 => address) public repoClaimedWallet;
    mapping(bytes32 => uint256) public repoDonorCount;
    mapping(bytes32 => mapping(address => Donation)) public donations;

    // Replay protection
    mapping(uint256 => bool) public usedNonces;

    // Funded repos tracking
    bytes32[] public fundedRepos;
    mapping(bytes32 => bool) public isFundedRepo;

    // Global stats
    uint256 public totalDonated;
    uint256 public totalClaimed;
    uint256 public totalRefunded;

    // ============================================
    // CONSTRUCTOR
    // ============================================

    /**
     * @param _usdc USDC token address
     * @param _authorizedSigner Backend signing key for claim authorization
     * @param _owner Contract owner (for pause/signer updates)
     */
    constructor(
        address _usdc,
        address _authorizedSigner,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_authorizedSigner != address(0), "Invalid signer address");

        usdc = IERC20(_usdc);
        authorizedSigner = _authorizedSigner;
    }

    // ============================================
    // DONATE
    // ============================================

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function donate(
        bytes32 repoHash,
        uint256 amount,
        bool redistributeOnTimeout
    ) external whenNotPaused nonReentrant {
        require(repoHash != bytes32(0), "Invalid repo hash");
        require(amount >= MIN_DONATION, "Below minimum donation");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        _recordDonation(repoHash, msg.sender, amount, redistributeOnTimeout);
    }

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function batchDonate(
        bytes32[] calldata repoHashes,
        uint256[] calldata amounts,
        bool[] calldata redistributeFlags
    ) external whenNotPaused nonReentrant {
        uint256 len = repoHashes.length;
        require(len > 0, "Empty arrays");
        require(len == amounts.length && len == redistributeFlags.length, "Array length mismatch");

        // Calculate total and validate
        uint256 total = 0;
        for (uint256 i = 0; i < len; i++) {
            require(repoHashes[i] != bytes32(0), "Invalid repo hash");
            require(amounts[i] >= MIN_DONATION, "Below minimum donation");
            total += amounts[i];
        }

        // Single transfer for gas efficiency
        usdc.safeTransferFrom(msg.sender, address(this), total);

        // Record each donation
        for (uint256 i = 0; i < len; i++) {
            _recordDonation(repoHashes[i], msg.sender, amounts[i], redistributeFlags[i]);
        }
    }

    // ============================================
    // CLAIM
    // ============================================

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function claim(
        bytes32 repoHash,
        address wallet,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        require(wallet != address(0), "Invalid wallet");
        require(repoBalances[repoHash] > 0, "No funds to claim");
        require(!usedNonces[nonce], "Nonce already used");

        // Verify backend signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(repoHash, wallet, nonce, block.chainid, address(this))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        require(recovered == authorizedSigner, "Invalid signature");

        usedNonces[nonce] = true;

        uint256 amount = repoBalances[repoHash];
        repoBalances[repoHash] = 0;
        repoTotalClaimed[repoHash] += amount;
        repoClaimedWallet[repoHash] = wallet;
        totalClaimed += amount;

        usdc.safeTransfer(wallet, amount);

        emit Claimed(repoHash, wallet, amount);
    }

    // ============================================
    // REFUND
    // ============================================

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function refund(bytes32 repoHash) external nonReentrant {
        Donation storage donation = donations[repoHash][msg.sender];
        require(donation.amount > 0, "No donation found");
        require(
            block.timestamp >= donation.timestamp + REFUND_DELAY,
            "Refund delay not elapsed"
        );
        require(repoClaimedWallet[repoHash] == address(0), "Repo already claimed");

        uint256 refundAmount = donation.amount;

        // Cap refund to available balance (in case of partial redistribution)
        if (refundAmount > repoBalances[repoHash]) {
            refundAmount = repoBalances[repoHash];
        }

        donation.amount = 0;
        repoBalances[repoHash] -= refundAmount;
        totalRefunded += refundAmount;

        usdc.safeTransfer(msg.sender, refundAmount);

        emit Refunded(repoHash, msg.sender, refundAmount);
    }

    // ============================================
    // REDISTRIBUTE
    // ============================================

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function redistribute(bytes32 fromRepoHash, bytes32 toRepoHash) external nonReentrant {
        require(fromRepoHash != toRepoHash, "Cannot redistribute to same repo");
        require(toRepoHash != bytes32(0), "Invalid destination");
        require(repoClaimedWallet[fromRepoHash] == address(0), "Source repo already claimed");

        Donation storage donation = donations[fromRepoHash][msg.sender];
        require(donation.amount > 0, "No donation found");
        require(donation.redistributeOnTimeout, "Redistribution not opted in");
        require(
            block.timestamp >= donation.timestamp + REFUND_DELAY,
            "Refund delay not elapsed"
        );

        uint256 amount = donation.amount;

        // Cap to available balance
        if (amount > repoBalances[fromRepoHash]) {
            amount = repoBalances[fromRepoHash];
        }

        donation.amount = 0;
        repoBalances[fromRepoHash] -= amount;

        _recordDonation(toRepoHash, msg.sender, amount, false);
        // Note: no additional transfer needed, funds are already in contract

        emit Redistributed(fromRepoHash, toRepoHash, msg.sender, amount);
    }

    // ============================================
    // ADMIN
    // ============================================

    /**
     * @notice Update the authorized signer for claim verification
     */
    function setAuthorizedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid signer");
        address oldSigner = authorizedSigner;
        authorizedSigner = newSigner;
        emit AuthorizedSignerUpdated(oldSigner, newSigner);
    }

    /**
     * @notice Pause the contract (blocks new donations)
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

    // ============================================
    // VIEWS
    // ============================================

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function getRepoInfo(bytes32 repoHash) external view returns (RepoInfo memory) {
        return RepoInfo({
            totalBalance: repoBalances[repoHash],
            totalDonated: repoTotalDonated[repoHash],
            totalClaimed: repoTotalClaimed[repoHash],
            claimedWallet: repoClaimedWallet[repoHash],
            donorCount: repoDonorCount[repoHash]
        });
    }

    /**
     * @inheritdoc IOpenGrantEscrow
     */
    function getDonation(bytes32 repoHash, address donor) external view returns (Donation memory) {
        return donations[repoHash][donor];
    }

    /**
     * @notice Get the number of funded repos
     */
    function getFundedRepoCount() external view returns (uint256) {
        return fundedRepos.length;
    }

    /**
     * @notice Get a funded repo hash by index
     */
    function getFundedRepo(uint256 index) external view returns (bytes32) {
        return fundedRepos[index];
    }

    // ============================================
    // INTERNAL
    // ============================================

    function _recordDonation(
        bytes32 repoHash,
        address donor,
        uint256 amount,
        bool redistributeOnTimeout
    ) internal {
        Donation storage existing = donations[repoHash][donor];
        if (existing.amount == 0) {
            repoDonorCount[repoHash]++;
        }

        existing.amount += amount;
        existing.timestamp = block.timestamp;
        existing.redistributeOnTimeout = redistributeOnTimeout;

        repoBalances[repoHash] += amount;
        repoTotalDonated[repoHash] += amount;
        totalDonated += amount;

        // Track funded repos
        if (!isFundedRepo[repoHash]) {
            isFundedRepo[repoHash] = true;
            fundedRepos.push(repoHash);
        }

        emit Donated(repoHash, donor, amount, redistributeOnTimeout);
    }
}
