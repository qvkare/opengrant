// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IOpenGrantEscrow
 * @notice Interface for the OpenGrant Escrow contract - trustless USDC escrow for open source funding
 */
interface IOpenGrantEscrow {
    // ============================================
    // STRUCTS
    // ============================================

    struct Donation {
        uint256 amount;
        uint256 timestamp;
        bool redistributeOnTimeout;
    }

    struct RepoInfo {
        uint256 totalBalance;
        uint256 totalDonated;
        uint256 totalClaimed;
        address claimedWallet;
        uint256 donorCount;
    }

    // ============================================
    // EVENTS
    // ============================================

    event Donated(bytes32 indexed repoHash, address indexed donor, uint256 amount, bool redistributeOnTimeout);
    event Claimed(bytes32 indexed repoHash, address indexed wallet, uint256 amount);
    event Refunded(bytes32 indexed repoHash, address indexed donor, uint256 amount);
    event Redistributed(bytes32 indexed fromRepoHash, bytes32 indexed toRepoHash, address indexed donor, uint256 amount);
    event AuthorizedSignerUpdated(address indexed oldSigner, address indexed newSigner);

    // ============================================
    // FUNCTIONS
    // ============================================

    /**
     * @notice Donate USDC to a GitHub repo's escrow
     * @param repoHash keccak256(abi.encodePacked(uint256(githubId)))
     * @param amount USDC amount (6 decimals)
     * @param redistributeOnTimeout If true, donor allows redistribution after refund delay
     */
    function donate(bytes32 repoHash, uint256 amount, bool redistributeOnTimeout) external;

    /**
     * @notice Batch donate to multiple repos in a single transaction
     * @param repoHashes Array of repo hashes
     * @param amounts Array of USDC amounts
     * @param redistributeFlags Array of redistribute flags
     */
    function batchDonate(bytes32[] calldata repoHashes, uint256[] calldata amounts, bool[] calldata redistributeFlags) external;

    /**
     * @notice Claim escrow funds for a repo (user-initiated, backend signs authorization)
     * @param repoHash The repo to claim
     * @param wallet Destination wallet
     * @param nonce Unique nonce for replay protection
     * @param signature ECDSA signature from authorized signer
     */
    function claim(bytes32 repoHash, address wallet, uint256 nonce, bytes calldata signature) external;

    /**
     * @notice Refund a donation after the refund delay (365 days) if repo is unclaimed
     * @param repoHash The repo to refund from
     */
    function refund(bytes32 repoHash) external;

    /**
     * @notice Redistribute an unclaimed donation to another repo
     * @param fromRepoHash Source repo (must be unclaimed, donor must have opted in)
     * @param toRepoHash Destination repo
     */
    function redistribute(bytes32 fromRepoHash, bytes32 toRepoHash) external;

    /**
     * @notice Get aggregated info for a repo
     */
    function getRepoInfo(bytes32 repoHash) external view returns (RepoInfo memory);

    /**
     * @notice Get a specific donation
     */
    function getDonation(bytes32 repoHash, address donor) external view returns (Donation memory);
}
