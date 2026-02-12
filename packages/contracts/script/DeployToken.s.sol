// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { GRANTToken } from "../src/GRANTToken.sol";
import { GRANTStaking } from "../src/GRANTStaking.sol";
import { FeeDiscountOracle } from "../src/FeeDiscountOracle.sol";
import { OpenGrantPayments } from "../src/OpenGrantPayments.sol";

/**
 * @title DeployTokenScript
 * @notice Deploys the GRANT token, staking, and fee oracle contracts
 *
 * @dev Supported networks: Same as Deploy.s.sol (Base, Arbitrum, Linea, Polygon, Ethereum)
 *
 * Usage:
 * 1. Set environment variables:
 *    - DEPLOYER_PRIVATE_KEY: Private key of deployer
 *    - OPENGRANT_PAYMENTS_ADDRESS: Existing OpenGrantPayments contract
 *
 * 2. Deploy:
 *    forge script script/DeployToken.s.sol:DeployTokenScript \
 *      --rpc-url $RPC_URL \
 *      --broadcast --verify -vvvv
 *
 * Post-deployment steps:
 *    1. Stake initial GRANT (at least 1 staker required before notifyReward)
 *    2. Transfer GRANT rewards to staking contract
 *    3. Call staking.notifyGrantReward() to start emissions
 *    4. Call payments.setFeeDiscountOracle() to enable tier discounts
 *    5. Call payments.setStakingRewardPool() to enable USDC rewards
 */
contract DeployTokenScript is Script {
    // ============================================
    // NATIVE USDC ADDRESSES (Circle-issued, EIP-3009)
    // ============================================

    // Mainnets
    address constant USDC_ETHEREUM       = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDC_BASE           = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_ARBITRUM       = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address constant USDC_LINEA          = 0xFEce4462D57bD51A6A552365A011b95f0E16d9B7;
    address constant USDC_POLYGON        = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    // Testnets
    address constant USDC_BASE_SEPOLIA   = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant USDC_ARB_SEPOLIA    = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
    address constant USDC_LINEA_SEPOLIA  = 0xb33a204b04c0BBE78EB4252C6264C5C94e2FB0dB;
    address constant USDC_POLYGON_AMOY   = 0x41E94EB71EF8C9770BAD3bBd3e492065b2B8ce75;

    /**
     * @notice Resolve USDC address and network name from chain ID
     */
    function _getChainConfig() internal view returns (address usdc, string memory name) {
        uint256 chainId = block.chainid;

        if (chainId == 1)      return (USDC_ETHEREUM,      "Ethereum Mainnet");
        if (chainId == 8453)   return (USDC_BASE,          "Base Mainnet");
        if (chainId == 42161)  return (USDC_ARBITRUM,      "Arbitrum One");
        if (chainId == 59144)  return (USDC_LINEA,         "Linea Mainnet");
        if (chainId == 137)    return (USDC_POLYGON,       "Polygon PoS");
        if (chainId == 84532)  return (USDC_BASE_SEPOLIA,  "Base Sepolia");
        if (chainId == 421614) return (USDC_ARB_SEPOLIA,   "Arbitrum Sepolia");
        if (chainId == 59141)  return (USDC_LINEA_SEPOLIA, "Linea Sepolia");
        if (chainId == 80002)  return (USDC_POLYGON_AMOY,  "Polygon Amoy");

        revert("Unsupported chain - add USDC address for this chain ID");
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address paymentsAddress = vm.envOr("OPENGRANT_PAYMENTS_ADDRESS", address(0));

        (address usdcAddress, string memory networkName) = _getChainConfig();

        console.log("=== GRANT Token Deployment ===");
        console.log("Network:", networkName);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);

        // 1. Deploy GRANT Token (1B minted to deployer)
        GRANTToken token = new GRANTToken();
        console.log("GRANTToken:", address(token));
        console.log("  Total Supply:", token.totalSupply() / 1e18, "GRANT");
        console.log("  Deployer Balance:", token.balanceOf(deployer) / 1e18, "GRANT");

        // 2. Deploy Staking Contract
        GRANTStaking staking = new GRANTStaking(
            address(token),
            usdcAddress,
            deployer
        );
        console.log("GRANTStaking:", address(staking));

        // 3. Deploy Fee Discount Oracle
        FeeDiscountOracle oracle = new FeeDiscountOracle(
            address(staking),
            deployer
        );
        console.log("FeeDiscountOracle:", address(oracle));

        // 4. Configure OpenGrantPayments (if address provided)
        if (paymentsAddress != address(0)) {
            OpenGrantPayments payments = OpenGrantPayments(paymentsAddress);
            payments.setFeeDiscountOracle(address(oracle));
            payments.setStakingRewardPool(address(staking));
            console.log("OpenGrantPayments configured with oracle and staking pool");
        } else {
            console.log("WARN: OPENGRANT_PAYMENTS_ADDRESS not set, skipping integration");
        }

        vm.stopBroadcast();

        // Print summary
        console.log("");
        console.log("=== GRANT Token Deployment Summary ===");
        console.log("Network:", networkName);
        console.log("Chain ID:", block.chainid);
        console.log("GRANTToken:", address(token));
        console.log("GRANTStaking:", address(staking));
        console.log("FeeDiscountOracle:", address(oracle));
        console.log("");
        console.log("Add these to your .env:");
        console.log("GRANT_TOKEN_ADDRESS=", address(token));
        console.log("GRANT_STAKING_ADDRESS=", address(staking));
        console.log("FEE_DISCOUNT_ORACLE_ADDRESS=", address(oracle));
        console.log("");
        console.log("=== Post-Deployment Checklist ===");
        console.log("1. Stake initial GRANT (at least 1 staker required before notifyReward)");
        console.log("2. Transfer staking rewards: token.transfer(staking, amount)");
        console.log("3. Start emissions: staking.notifyGrantReward(amount)");
        console.log("4. Set up vesting contracts for team/investors");
        console.log("5. Add liquidity to DEX");
        console.log("6. Distribute publisher airdrop");
    }
}
