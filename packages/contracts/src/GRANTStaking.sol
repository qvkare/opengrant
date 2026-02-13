// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GRANTStaking
 * @notice Staking contract for GRANT tokens with dual rewards (GRANT emissions + USDC revenue share)
 * @dev Based on the Synthetix StakingRewards pattern — the most audited staking design in DeFi.
 *
 *      Dual Rewards:
 *        - GRANT token emissions (declining over 4 years)
 *        - USDC revenue share (30% of platform commissions)
 *
 *      Unstaking:
 *        - 7-day cooldown period after requesting withdrawal
 *        - Rewards continue accruing during cooldown
 */
contract GRANTStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============================================
    // STATE VARIABLES
    // ============================================

    IERC20 public immutable stakingToken; // GRANT
    IERC20 public immutable rewardTokenGrant; // GRANT (emissions)
    IERC20 public immutable rewardTokenUSDC; // USDC (revenue share)

    // GRANT reward state
    uint256 public grantRewardRate; // GRANT per second
    uint256 public grantPeriodFinish;
    uint256 public grantLastUpdateTime;
    uint256 public grantRewardPerTokenStored;
    mapping(address => uint256) public grantUserRewardPerTokenPaid;
    mapping(address => uint256) public grantRewards;

    // USDC reward state
    uint256 public usdcRewardRate; // USDC per second
    uint256 public usdcPeriodFinish;
    uint256 public usdcLastUpdateTime;
    uint256 public usdcRewardPerTokenStored;
    mapping(address => uint256) public usdcUserRewardPerTokenPaid;
    mapping(address => uint256) public usdcRewards;

    // Staking state
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    // Cooldown
    uint256 public constant COOLDOWN_PERIOD = 7 days;
    uint256 public constant WITHDRAW_WINDOW = 3 days; // Must withdraw within 3 days after cooldown
    mapping(address => uint256) public cooldownStart;
    mapping(address => uint256) public cooldownAmount;

    // Effective supply (totalSupply minus all cooldown amounts)
    // Used for reward calculation — cooldown tokens don't earn rewards
    uint256 private _totalCooldownAmount;

    // Reward duration
    uint256 public constant REWARD_DURATION = 30 days;

    // Reward notifier (can call notifyUSDCReward in addition to owner)
    address public rewardNotifier;

    // ============================================
    // EVENTS
    // ============================================

    event Staked(address indexed user, uint256 amount);
    event CooldownStarted(address indexed user, uint256 amount, uint256 cooldownEnd);
    event Withdrawn(address indexed user, uint256 amount);
    event CooldownCancelled(address indexed user, uint256 amount);
    event GrantRewardPaid(address indexed user, uint256 reward);
    event USDCRewardPaid(address indexed user, uint256 reward);
    event GrantRewardAdded(uint256 reward, uint256 duration);
    event USDCRewardAdded(uint256 reward, uint256 duration);
    event RewardNotifierUpdated(address indexed oldNotifier, address indexed newNotifier);

    // ============================================
    // CONSTRUCTOR
    // ============================================

    /**
     * @notice Deploy staking contract
     * @param _stakingToken GRANT token address (also used for GRANT emissions)
     * @param _rewardTokenUSDC USDC token address
     * @param _owner Admin address
     */
    constructor(
        address _stakingToken,
        address _rewardTokenUSDC,
        address _owner
    ) Ownable(_owner) {
        require(_stakingToken != address(0), "GRANTStaking: invalid staking token");
        require(_rewardTokenUSDC != address(0), "GRANTStaking: invalid USDC token");

        stakingToken = IERC20(_stakingToken);
        rewardTokenGrant = IERC20(_stakingToken); // Same token for emissions
        rewardTokenUSDC = IERC20(_rewardTokenUSDC);
    }

    // ============================================
    // VIEWS
    // ============================================

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Effective staked balance (excludes tokens in cooldown)
     * @dev Used by FeeDiscountOracle for tier calculation
     */
    function effectiveBalanceOf(address account) external view returns (uint256) {
        return _balances[account] - cooldownAmount[account];
    }

    function getGrantRewardForDuration() external view returns (uint256) {
        return grantRewardRate * REWARD_DURATION;
    }

    function getUSDCRewardForDuration() external view returns (uint256) {
        return usdcRewardRate * REWARD_DURATION;
    }

    // --- GRANT reward views ---

    function grantLastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < grantPeriodFinish ? block.timestamp : grantPeriodFinish;
    }

    function grantRewardPerToken() public view returns (uint256) {
        uint256 effectiveSupply = _totalSupply - _totalCooldownAmount;
        if (effectiveSupply == 0) {
            return grantRewardPerTokenStored;
        }
        return grantRewardPerTokenStored +
            ((grantLastTimeRewardApplicable() - grantLastUpdateTime) * grantRewardRate * 1e27) /
            effectiveSupply;
    }

    function earnedGrant(address account) public view returns (uint256) {
        uint256 effectiveBalance = _balances[account] - cooldownAmount[account];
        return (effectiveBalance * (grantRewardPerToken() - grantUserRewardPerTokenPaid[account]))
            / 1e27 + grantRewards[account];
    }

    // --- USDC reward views ---

    function usdcLastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < usdcPeriodFinish ? block.timestamp : usdcPeriodFinish;
    }

    function usdcRewardPerToken() public view returns (uint256) {
        uint256 effectiveSupply = _totalSupply - _totalCooldownAmount;
        if (effectiveSupply == 0) {
            return usdcRewardPerTokenStored;
        }
        return usdcRewardPerTokenStored +
            ((usdcLastTimeRewardApplicable() - usdcLastUpdateTime) * usdcRewardRate * 1e27) /
            effectiveSupply;
    }

    function earnedUSDC(address account) public view returns (uint256) {
        uint256 effectiveBalance = _balances[account] - cooldownAmount[account];
        return (effectiveBalance * (usdcRewardPerToken() - usdcUserRewardPerTokenPaid[account]))
            / 1e27 + usdcRewards[account];
    }

    // ============================================
    // STAKING FUNCTIONS
    // ============================================

    /**
     * @notice Stake GRANT tokens
     * @param amount Amount of GRANT to stake
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused updateRewards(msg.sender) {
        require(amount > 0, "GRANTStaking: cannot stake zero");

        _totalSupply += amount;
        _balances[msg.sender] += amount;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Request withdrawal — starts 7-day cooldown
     * @param amount Amount of GRANT to unstake
     */
    function requestWithdraw(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "GRANTStaking: cannot withdraw zero");
        require(cooldownAmount[msg.sender] == 0, "GRANTStaking: existing cooldown active");
        uint256 effectiveBalance = _balances[msg.sender] - cooldownAmount[msg.sender];
        require(amount <= effectiveBalance, "GRANTStaking: insufficient available balance");

        cooldownAmount[msg.sender] = amount;
        cooldownStart[msg.sender] = block.timestamp;
        _totalCooldownAmount += amount;

        emit CooldownStarted(msg.sender, amount, block.timestamp + COOLDOWN_PERIOD);
    }

    /**
     * @notice Complete withdrawal after cooldown expires
     */
    function withdraw() external nonReentrant updateRewards(msg.sender) {
        uint256 amount = cooldownAmount[msg.sender];
        require(amount > 0, "GRANTStaking: no pending withdrawal");
        uint256 cooldownEnd = cooldownStart[msg.sender] + COOLDOWN_PERIOD;
        require(
            block.timestamp >= cooldownEnd,
            "GRANTStaking: cooldown not finished"
        );
        require(
            block.timestamp <= cooldownEnd + WITHDRAW_WINDOW,
            "GRANTStaking: withdraw window expired, cancel and re-request"
        );

        cooldownAmount[msg.sender] = 0;
        cooldownStart[msg.sender] = 0;
        _totalCooldownAmount -= amount;

        _totalSupply -= amount;
        _balances[msg.sender] -= amount;

        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Cancel pending withdrawal and re-stake
     */
    function cancelCooldown() external nonReentrant updateRewards(msg.sender) {
        uint256 amount = cooldownAmount[msg.sender];
        require(amount > 0, "GRANTStaking: no pending withdrawal");

        cooldownAmount[msg.sender] = 0;
        cooldownStart[msg.sender] = 0;
        _totalCooldownAmount -= amount;

        emit CooldownCancelled(msg.sender, amount);
    }

    /**
     * @notice Claim all pending rewards (GRANT + USDC)
     */
    function claimRewards() external nonReentrant updateRewards(msg.sender) {
        uint256 grantReward = grantRewards[msg.sender];
        if (grantReward > 0) {
            grantRewards[msg.sender] = 0;
            rewardTokenGrant.safeTransfer(msg.sender, grantReward);
            emit GrantRewardPaid(msg.sender, grantReward);
        }

        uint256 usdcReward = usdcRewards[msg.sender];
        if (usdcReward > 0) {
            usdcRewards[msg.sender] = 0;
            rewardTokenUSDC.safeTransfer(msg.sender, usdcReward);
            emit USDCRewardPaid(msg.sender, usdcReward);
        }
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @notice Add GRANT emission rewards for a new period
     * @param reward Total GRANT to distribute over REWARD_DURATION
     * @dev Owner must transfer GRANT tokens to this contract before calling.
     *      Requires at least one staker to prevent reward loss.
     */
    function notifyGrantReward(
        uint256 reward
    ) external onlyOwner updateRewards(address(0)) {
        require(reward > 0, "GRANTStaking: reward is zero");
        require(_totalSupply > 0, "GRANTStaking: no stakers");

        if (block.timestamp >= grantPeriodFinish) {
            grantRewardRate = reward / REWARD_DURATION;
        } else {
            uint256 remaining = grantPeriodFinish - block.timestamp;
            uint256 leftover = remaining * grantRewardRate;
            grantRewardRate = (reward + leftover) / REWARD_DURATION;
        }

        require(grantRewardRate > 0, "GRANTStaking: reward rate is zero");

        // Verify contract has enough GRANT to cover rewards (excluding staked tokens)
        uint256 grantBalance = rewardTokenGrant.balanceOf(address(this));
        require(
            grantRewardRate * REWARD_DURATION <= grantBalance - _totalSupply,
            "GRANTStaking: insufficient reward balance"
        );

        grantLastUpdateTime = block.timestamp;
        grantPeriodFinish = block.timestamp + REWARD_DURATION;

        emit GrantRewardAdded(reward, REWARD_DURATION);
    }

    /**
     * @notice Set reward notifier address (e.g., OpenGrantPayments contract)
     * @param _notifier New notifier address (or zero to disable)
     */
    function setRewardNotifier(address _notifier) external onlyOwner {
        address old = rewardNotifier;
        rewardNotifier = _notifier;
        emit RewardNotifierUpdated(old, _notifier);
    }

    /**
     * @notice Add USDC revenue share rewards for a new period
     * @param reward Total USDC to distribute over REWARD_DURATION
     * @dev Called by OpenGrantPayments (rewardNotifier) or owner when distributing platform fees.
     *      Requires at least one staker to prevent reward loss.
     */
    function notifyUSDCReward(
        uint256 reward
    ) external updateRewards(address(0)) {
        require(
            msg.sender == owner() || msg.sender == rewardNotifier,
            "GRANTStaking: caller not authorized"
        );
        require(reward > 0, "GRANTStaking: reward is zero");
        require(_totalSupply > 0, "GRANTStaking: no stakers");

        if (block.timestamp >= usdcPeriodFinish) {
            usdcRewardRate = reward / REWARD_DURATION;
        } else {
            uint256 remaining = usdcPeriodFinish - block.timestamp;
            uint256 leftover = remaining * usdcRewardRate;
            usdcRewardRate = (reward + leftover) / REWARD_DURATION;
        }

        require(usdcRewardRate > 0, "GRANTStaking: reward rate is zero");

        // Verify contract has enough USDC to cover rewards
        uint256 usdcBalance = rewardTokenUSDC.balanceOf(address(this));
        require(
            usdcRewardRate * REWARD_DURATION <= usdcBalance,
            "GRANTStaking: insufficient reward balance"
        );

        usdcLastUpdateTime = block.timestamp;
        usdcPeriodFinish = block.timestamp + REWARD_DURATION;

        emit USDCRewardAdded(reward, REWARD_DURATION);
    }

    /**
     * @notice Pause staking (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause staking
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Recover accidentally sent tokens (not staking or reward tokens)
     * @param token Token address to recover
     * @param amount Amount to recover
     * @param to Recipient address
     */
    function recoverERC20(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        require(token != address(stakingToken), "GRANTStaking: cannot recover staking token");
        require(token != address(rewardTokenUSDC), "GRANTStaking: cannot recover reward token");
        require(to != address(0), "GRANTStaking: invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    // ============================================
    // MODIFIERS
    // ============================================

    modifier updateRewards(address account) {
        // Update GRANT rewards
        grantRewardPerTokenStored = grantRewardPerToken();
        grantLastUpdateTime = grantLastTimeRewardApplicable();

        // Update USDC rewards
        usdcRewardPerTokenStored = usdcRewardPerToken();
        usdcLastUpdateTime = usdcLastTimeRewardApplicable();

        if (account != address(0)) {
            grantRewards[account] = earnedGrant(account);
            grantUserRewardPerTokenPaid[account] = grantRewardPerTokenStored;

            usdcRewards[account] = earnedUSDC(account);
            usdcUserRewardPerTokenPaid[account] = usdcRewardPerTokenStored;
        }
        _;
    }
}
