// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPublisherVault } from "./interfaces/IPublisherVault.sol";

/**
 * @title PublisherVault
 * @notice ERC-4626 vault with PaymentSplitter functionality for revenue distribution
 * @dev Receives USDC payments and distributes among configured payees
 */
contract PublisherVault is ERC4626, Ownable, ReentrancyGuard, IPublisherVault {
    using SafeERC20 for IERC20;

    // ============================================
    // STATE VARIABLES
    // ============================================

    // PaymentSplitter state
    address[] private _payees;
    mapping(address => uint256) private _shares;
    mapping(address => uint256) private _released;
    uint256 private _totalShares;
    uint256 private _totalReleased;

    // Payments contract that can call receivePayment
    address public paymentsContract;

    // Unreleased funds from failed _tryRelease during updatePayees
    // These funds stay in the vault but are excluded from future distribution
    uint256 private _unreleasedReserve;

    // ============================================
    // CONSTRUCTOR
    // ============================================

    /**
     * @notice Initialize the vault
     * @param asset_ The underlying asset (USDC)
     * @param name_ The vault token name
     * @param symbol_ The vault token symbol
     * @param owner_ The vault owner (publisher)
     * @param payees_ Initial payees
     * @param shares_ Initial shares for each payee
     * @param paymentsContract_ OpenGrantPayments contract address
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address owner_,
        address[] memory payees_,
        uint256[] memory shares_,
        address paymentsContract_
    ) ERC4626(asset_) ERC20(name_, symbol_) Ownable(owner_) {
        require(
            payees_.length == shares_.length,
            "PublisherVault: payees and shares length mismatch"
        );
        require(payees_.length > 0, "PublisherVault: no payees");
        require(paymentsContract_ != address(0), "PublisherVault: invalid payments contract");

        paymentsContract = paymentsContract_;

        for (uint256 i = 0; i < payees_.length; i++) {
            _addPayee(payees_[i], shares_[i]);
        }

        require(_totalShares > 0, "PublisherVault: total shares must be positive");
    }

    // ============================================
    // PAYMENT RECEIVING
    // ============================================

    /**
     * @inheritdoc IPublisherVault
     */
    function receivePayment(
        uint256 amount
    ) external override nonReentrant {
        require(
            msg.sender == paymentsContract,
            "PublisherVault: caller is not payments contract"
        );
        require(amount > 0, "PublisherVault: amount is zero");

        IERC20 asset_ = IERC20(asset());

        // Platform fee is already deducted in OpenGrantPayments._distributeToVault
        // so vault receives the net amount directly - no double fee
        asset_.safeTransferFrom(msg.sender, address(this), amount);

        emit PaymentReceived(msg.sender, amount, 0, amount);
    }

    // ============================================
    // PAYMENT SPLITTER FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IPublisherVault
     */
    function releasable(
        address account
    ) public view override returns (uint256) {
        return _releasable(account);
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function release(address account) public override nonReentrant {
        _release(account);
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function releaseAll() external override nonReentrant {
        for (uint256 i = 0; i < _payees.length; i++) {
            if (_releasable(_payees[i]) > 0) {
                _release(_payees[i]);
            }
        }
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function updatePayees(
        address[] calldata payees_,
        uint256[] calldata shares_
    ) external override onlyOwner nonReentrant {
        require(
            payees_.length == shares_.length,
            "PublisherVault: payees and shares length mismatch"
        );
        require(payees_.length > 0, "PublisherVault: no payees");

        // Best-effort release all pending payments (non-reverting)
        // Track failed releases to reserve those funds
        uint256 failedTotal = 0;
        for (uint256 i = 0; i < _payees.length; i++) {
            uint256 pending = _releasable(_payees[i]);
            bool success = _tryRelease(_payees[i]);
            if (!success && pending > 0) {
                failedTotal += pending;
            }
        }

        // Reserve funds that couldn't be released (e.g., blacklisted payee)
        // These are excluded from future distribution to prevent fund misattribution
        _unreleasedReserve += failedTotal;

        // Clear existing payees and their released accounting
        for (uint256 i = 0; i < _payees.length; i++) {
            delete _released[_payees[i]];
            delete _shares[_payees[i]];
        }
        delete _payees;
        _totalShares = 0;
        _totalReleased = 0;

        // Add new payees
        for (uint256 i = 0; i < payees_.length; i++) {
            _addPayee(payees_[i], shares_[i]);
        }

        emit PayeesUpdated(payees_, shares_);
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function getPayees() external view override returns (address[] memory) {
        return _payees;
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function shares(
        address account
    ) external view override returns (uint256) {
        return _shares[account];
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function totalShares() external view override returns (uint256) {
        return _totalShares;
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function totalReleased() external view override returns (uint256) {
        return _totalReleased;
    }

    /**
     * @inheritdoc IPublisherVault
     */
    function released(
        address account
    ) external view override returns (uint256) {
        return _released[account];
    }

    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================

    function _releasable(address account) internal view returns (uint256) {
        uint256 totalReceived = IERC20(asset()).balanceOf(address(this)) +
            _totalReleased - _unreleasedReserve;
        return _pendingPayment(account, totalReceived, _released[account]);
    }

    function _release(address account) internal {
        require(_shares[account] > 0, "PublisherVault: account has no shares");

        uint256 payment = _releasable(account);
        require(payment > 0, "PublisherVault: no payment due");

        _released[account] += payment;
        _totalReleased += payment;

        IERC20(asset()).safeTransfer(account, payment);

        emit PaymentReleased(account, payment);
    }

    /**
     * @notice Best-effort release — does not revert if transfer fails (e.g. USDC blacklist)
     * @dev Uses low-level call to avoid griefing via reverting payee
     */
    function _tryRelease(address account) internal returns (bool) {
        if (_shares[account] == 0) return true;
        uint256 payment = _releasable(account);
        if (payment == 0) return true;

        // Optimistic accounting
        _released[account] += payment;
        _totalReleased += payment;

        (bool success, bytes memory returndata) = asset().call(
            abi.encodeCall(IERC20.transfer, (account, payment))
        );

        if (success && (returndata.length == 0 || abi.decode(returndata, (bool)))) {
            emit PaymentReleased(account, payment);
            return true;
        }

        // Transfer failed — revert accounting, funds stay in vault
        _released[account] -= payment;
        _totalReleased -= payment;
        emit ReleaseFailed(account, payment);
        return false;
    }

    function _addPayee(address account, uint256 shares_) private {
        require(account != address(0), "PublisherVault: zero address payee");
        require(shares_ > 0, "PublisherVault: shares are zero");
        require(_shares[account] == 0, "PublisherVault: payee already exists");

        _payees.push(account);
        _shares[account] = shares_;
        _totalShares += shares_;

        emit PayeeAdded(account, shares_);
    }

    function _pendingPayment(
        address account,
        uint256 totalReceived,
        uint256 alreadyReleased
    ) private view returns (uint256) {
        return
            (totalReceived * _shares[account]) / _totalShares - alreadyReleased;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    event PaymentsContractUpdated(address indexed oldContract, address indexed newContract);
    event ReleaseFailed(address indexed account, uint256 amount);
    event UnreleasedReserveClaimed(address indexed to, uint256 amount);

    /**
     * @notice Claim unreleased reserve (funds from failed releases during updatePayees)
     * @param to Recipient address
     * @param amount Amount to claim from the reserve
     */
    function claimUnreleasedReserve(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "PublisherVault: zero address");
        require(amount > 0 && amount <= _unreleasedReserve, "PublisherVault: invalid amount");

        _unreleasedReserve -= amount;
        IERC20(asset()).safeTransfer(to, amount);

        emit UnreleasedReserveClaimed(to, amount);
    }

    /**
     * @notice Get current unreleased reserve amount
     */
    function unreleasedReserve() external view returns (uint256) {
        return _unreleasedReserve;
    }

    /**
     * @notice Update the payments contract address
     * @param _paymentsContract New payments contract address
     */
    function setPaymentsContract(
        address _paymentsContract
    ) external onlyOwner {
        require(_paymentsContract != address(0), "PublisherVault: zero address");
        address old = paymentsContract;
        paymentsContract = _paymentsContract;
        emit PaymentsContractUpdated(old, _paymentsContract);
    }

    // ============================================
    // ERC4626 OVERRIDES - Deposits/withdrawals disabled
    // ============================================

    function deposit(uint256, address) public pure override(ERC4626, IERC4626) returns (uint256) {
        revert("PublisherVault: deposits disabled");
    }

    function mint(uint256, address) public pure override(ERC4626, IERC4626) returns (uint256) {
        revert("PublisherVault: deposits disabled");
    }

    function withdraw(uint256, address, address) public pure override(ERC4626, IERC4626) returns (uint256) {
        revert("PublisherVault: withdrawals disabled");
    }

    function redeem(uint256, address, address) public pure override(ERC4626, IERC4626) returns (uint256) {
        revert("PublisherVault: withdrawals disabled");
    }

    function maxDeposit(address) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function maxMint(address) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function maxWithdraw(address) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function maxRedeem(address) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }

    function previewDeposit(uint256) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function previewMint(uint256) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function previewWithdraw(uint256) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
    function previewRedeem(uint256) public pure override(ERC4626, IERC4626) returns (uint256) { return 0; }
}
