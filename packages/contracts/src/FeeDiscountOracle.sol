// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FeeDiscountOracle
 * @notice Reads staked GRANT balance and returns the effective platform fee in BPS
 * @dev Used by OpenGrantPayments to apply tier-based fee discounts
 *
 *      Tier structure:
 *        Standard   (0 GRANT staked)          → 250 BPS (2.50%)
 *        Silver     (10,000 GRANT staked)     → 200 BPS (2.00%)
 *        Gold       (50,000 GRANT staked)     → 150 BPS (1.50%)
 *        Platinum   (250,000 GRANT staked)    → 100 BPS (1.00%)
 *        Diamond    (1,000,000 GRANT staked)  → 50 BPS  (0.50%)
 */
contract FeeDiscountOracle is Ownable {
    // ============================================
    // TYPES
    // ============================================

    struct Tier {
        uint256 minStake; // Minimum GRANT staked (18 decimals)
        uint256 feeBPS; // Fee in basis points
    }

    // ============================================
    // STATE VARIABLES
    // ============================================

    address public stakingContract;
    Tier[] public tiers; // Sorted descending by minStake
    uint256 public defaultFeeBPS = 250; // 2.5% for non-stakers

    // ============================================
    // EVENTS
    // ============================================

    event StakingContractUpdated(address indexed oldContract, address indexed newContract);
    event TiersUpdated(uint256 tierCount);
    event DefaultFeeUpdated(uint256 oldFee, uint256 newFee);

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(address _stakingContract, address _owner) Ownable(_owner) {
        require(_stakingContract != address(0), "FeeDiscountOracle: invalid staking contract");
        stakingContract = _stakingContract;

        // Initialize default tiers (descending order by minStake)
        tiers.push(Tier({ minStake: 1_000_000 ether, feeBPS: 50 }));  // Diamond  (0.5%)
        tiers.push(Tier({ minStake: 250_000 ether, feeBPS: 100 }));   // Platinum (1.0%)
        tiers.push(Tier({ minStake: 50_000 ether, feeBPS: 150 }));    // Gold     (1.5%)
        tiers.push(Tier({ minStake: 10_000 ether, feeBPS: 200 }));    // Silver   (2.0%)
    }

    // ============================================
    // MAIN FUNCTION
    // ============================================

    /**
     * @notice Get the effective fee BPS for a given user based on their GRANT staking tier
     * @param user The user address (typically the publisher whose earnings are being distributed)
     * @return feeBPS The effective fee in basis points
     */
    function getEffectiveFeeBPS(address user) external view returns (uint256 feeBPS) {
        if (stakingContract == address(0)) {
            return defaultFeeBPS;
        }

        // Read effective staked balance from staking contract
        // effectiveBalanceOf excludes tokens in cooldown
        (bool success, bytes memory data) = stakingContract.staticcall(
            abi.encodeWithSignature("effectiveBalanceOf(address)", user)
        );

        if (!success || data.length < 32) {
            return defaultFeeBPS;
        }

        uint256 stakedAmount = abi.decode(data, (uint256));

        // Check tiers (sorted descending, first match wins)
        for (uint256 i = 0; i < tiers.length; i++) {
            if (stakedAmount >= tiers[i].minStake) {
                return tiers[i].feeBPS;
            }
        }

        return defaultFeeBPS;
    }

    /**
     * @notice Get the tier name for a given staked amount
     * @param stakedAmount Amount of GRANT staked
     * @return tierIndex The tier index (0=Diamond, 1=Platinum, 2=Gold, 3=Silver, 4=Standard)
     */
    function getTierIndex(uint256 stakedAmount) external view returns (uint256 tierIndex) {
        for (uint256 i = 0; i < tiers.length; i++) {
            if (stakedAmount >= tiers[i].minStake) {
                return i;
            }
        }
        return tiers.length; // Standard tier (no discount)
    }

    /**
     * @notice Get total number of tiers (excluding default)
     */
    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @notice Update tier thresholds and fees
     * @param minStakes Array of minimum stake amounts (must be descending)
     * @param feeBPSValues Array of fee BPS values
     */
    function setTiers(
        uint256[] calldata minStakes,
        uint256[] calldata feeBPSValues
    ) external onlyOwner {
        require(minStakes.length == feeBPSValues.length, "FeeDiscountOracle: arrays mismatch");
        require(minStakes.length > 0, "FeeDiscountOracle: empty tiers");

        // Validate descending order and fee bounds
        for (uint256 i = 0; i < minStakes.length; i++) {
            require(feeBPSValues[i] <= 1000, "FeeDiscountOracle: fee too high"); // Max 10%
            require(feeBPSValues[i] > 0, "FeeDiscountOracle: fee cannot be zero");
            if (i > 0) {
                require(
                    minStakes[i] < minStakes[i - 1],
                    "FeeDiscountOracle: must be descending order"
                );
            }
        }

        // Clear and rebuild
        delete tiers;
        for (uint256 i = 0; i < minStakes.length; i++) {
            tiers.push(Tier({ minStake: minStakes[i], feeBPS: feeBPSValues[i] }));
        }

        emit TiersUpdated(minStakes.length);
    }

    /**
     * @notice Update default fee for non-stakers
     * @param newFeeBPS New default fee in basis points
     */
    function setDefaultFeeBPS(uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= 1000, "FeeDiscountOracle: fee too high");
        require(newFeeBPS > 0, "FeeDiscountOracle: fee cannot be zero");

        uint256 oldFee = defaultFeeBPS;
        defaultFeeBPS = newFeeBPS;

        emit DefaultFeeUpdated(oldFee, newFeeBPS);
    }

    /**
     * @notice Check if the staking contract is responsive (for off-chain monitoring)
     * @return True if staking contract responds to effectiveBalanceOf call
     */
    function isStakingContractResponsive() external view returns (bool) {
        if (stakingContract == address(0)) return false;
        if (stakingContract.code.length == 0) return false;
        (bool success,) = stakingContract.staticcall(
            abi.encodeWithSignature("effectiveBalanceOf(address)", address(0))
        );
        return success;
    }

    /**
     * @notice Update staking contract address
     * @param _stakingContract New staking contract address
     */
    function setStakingContract(address _stakingContract) external onlyOwner {
        require(_stakingContract != address(0), "FeeDiscountOracle: invalid address");
        address old = stakingContract;
        stakingContract = _stakingContract;
        emit StakingContractUpdated(old, _stakingContract);
    }
}
