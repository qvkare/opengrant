// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title IPublisherVault
 * @notice Interface for Publisher Vault (ERC-4626 + PaymentSplitter)
 */
interface IPublisherVault is IERC4626 {
    // ============================================
    // EVENTS
    // ============================================

    event PaymentReceived(
        address indexed from,
        uint256 grossAmount,
        uint256 platformFee,
        uint256 netAmount
    );

    event PayeeAdded(address indexed account, uint256 shares);

    event PayeeRemoved(address indexed account);

    event PayeesUpdated(address[] payees, uint256[] shares);

    event PaymentReleased(address indexed to, uint256 amount);

    // ============================================
    // FUNCTIONS
    // ============================================

    /**
     * @notice Receive payment from OpenGrantPayments contract
     * @param amount The gross amount being received
     * @dev Platform fee is deducted before deposit
     */
    function receivePayment(uint256 amount) external;

    /**
     * @notice Get releasable amount for a payee
     * @param account The payee address
     * @return Amount that can be released
     */
    function releasable(address account) external view returns (uint256);

    /**
     * @notice Release payment to a payee
     * @param account The payee to release to
     */
    function release(address account) external;

    /**
     * @notice Release payment to all payees
     */
    function releaseAll() external;

    /**
     * @notice Update payees and their shares (owner only)
     * @param payees Array of payee addresses
     * @param shares_ Array of shares for each payee
     */
    function updatePayees(
        address[] calldata payees,
        uint256[] calldata shares_
    ) external;

    /**
     * @notice Get all payees
     * @return Array of payee addresses
     */
    function getPayees() external view returns (address[] memory);

    /**
     * @notice Get shares for a specific payee
     * @param account The payee address
     * @return Number of shares
     */
    function shares(address account) external view returns (uint256);

    /**
     * @notice Get total shares
     * @return Total shares across all payees
     */
    function totalShares() external view returns (uint256);

    /**
     * @notice Get total released amount
     * @return Total amount released to all payees
     */
    function totalReleased() external view returns (uint256);

    /**
     * @notice Get released amount for a specific payee
     * @param account The payee address
     * @return Amount released to this payee
     */
    function released(address account) external view returns (uint256);

}
