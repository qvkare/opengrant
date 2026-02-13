// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { OpenGrantRegistry } from "../src/OpenGrantRegistry.sol";
import { OpenGrantPayments } from "../src/OpenGrantPayments.sol";
import { OpenGrantFactory } from "../src/OpenGrantFactory.sol";
import { OpenGrantEscrow } from "../src/OpenGrantEscrow.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployScript
 * @notice Deploys the OpenGrant contracts to any supported EVM chain
 *
 * @dev Supported networks:
 *   - Base Mainnet (8453)
 *   - Base Sepolia (84532)
 *   - Arbitrum One (42161)
 *   - Arbitrum Sepolia (421614)
 *   - Linea Mainnet (59144)
 *   - Linea Sepolia (59141)
 *   - Polygon PoS (137)
 *   - Polygon Amoy (80002)
 *   - Ethereum Mainnet (1)
 *
 * Usage:
 * 1. Set environment variables:
 *    - DEPLOYER_PRIVATE_KEY: Private key of deployer
 *    - PLATFORM_WALLET: Address to receive platform fees
 *
 * 2. Deploy:
 *    forge script script/Deploy.s.sol:DeployScript \
 *      --rpc-url $RPC_URL \
 *      --broadcast --verify -vvvv
 */
contract DeployScript is Script {
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

    // Platform fee: 2.5% (250 basis points)
    uint256 constant PLATFORM_FEE_BPS = 250;

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
        // Get deployment parameters from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address platformWallet = vm.envAddress("PLATFORM_WALLET");

        // Resolve chain config
        (address usdcAddress, string memory networkName) = _getChainConfig();

        console.log("=== OpenGrant Deployment ===");
        console.log("Network:", networkName);
        console.log("Chain ID:", block.chainid);
        console.log("USDC Address:", usdcAddress);
        console.log("Platform Wallet:", platformWallet);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer:", deployer);

        // 1. Deploy Registry Implementation
        OpenGrantRegistry registryImpl = new OpenGrantRegistry();
        console.log("Registry Implementation:", address(registryImpl));

        // 2. Deploy Registry Proxy
        bytes memory registryInitData = abi.encodeWithSelector(
            OpenGrantRegistry.initialize.selector,
            deployer
        );
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            registryInitData
        );
        OpenGrantRegistry registry = OpenGrantRegistry(address(registryProxy));
        console.log("Registry Proxy:", address(registry));

        // 3. Deploy Payments Contract
        OpenGrantPayments payments = new OpenGrantPayments(
            usdcAddress,
            address(registry),
            platformWallet,
            PLATFORM_FEE_BPS,
            deployer
        );
        console.log("Payments:", address(payments));

        // 4. Deploy Factory
        OpenGrantFactory factory = new OpenGrantFactory(
            usdcAddress,
            deployer
        );
        console.log("Factory:", address(factory));

        // 5. Configure Factory with platform contracts
        factory.setPaymentsContract(address(payments));
        factory.setRegistry(address(registry));
        console.log("Factory configured with payments and registry");

        // 6. Configure Registry
        registry.setPaymentsContract(address(payments));
        console.log("Registry configured with payments contract");

        vm.stopBroadcast();

        // NOTE: After deployment:
        // 1. Authorize the API gateway as payments caller:
        //    payments.setAuthorizedCaller(GATEWAY_ADDRESS, true);
        // 2. Deploy GRANT token + staking via DeployToken.s.sol which will:
        //    - Set feeDiscountOracle and stakingRewardPool on Payments
        //    - CRITICAL: Set staking.setRewardNotifier(address(payments))
        //    Without setRewardNotifier, USDC sent to staking pool stays locked.

        // Print summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Network:", networkName);
        console.log("Chain ID:", block.chainid);
        console.log("Registry (Proxy):", address(registry));
        console.log("Registry (Impl):", address(registryImpl));
        console.log("Payments:", address(payments));
        console.log("Factory:", address(factory));
        console.log("");
        console.log("Add these to your .env:");
        console.log("CHAIN_ID=", block.chainid);
        console.log("USDC_ADDRESS=", usdcAddress);
        console.log("OPENGRANT_REGISTRY_ADDRESS=", address(registry));
        console.log("OPENGRANT_PAYMENTS_ADDRESS=", address(payments));
        console.log("OPENGRANT_FACTORY_ADDRESS=", address(factory));
    }
}

/**
 * @title UpgradeRegistryScript
 * @notice Upgrades the OpenGrant Registry to a new implementation
 */
contract UpgradeRegistryScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryProxy = vm.envAddress("OPENGRANT_REGISTRY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        OpenGrantRegistry newImpl = new OpenGrantRegistry();
        console.log("New Registry Implementation:", address(newImpl));

        // Upgrade proxy
        OpenGrantRegistry registry = OpenGrantRegistry(registryProxy);
        registry.upgradeToAndCall(address(newImpl), "");
        console.log("Registry upgraded successfully");

        vm.stopBroadcast();
    }
}

/**
 * @title DeployEscrowScript
 * @notice Deploys the OpenGrant Escrow contract for open source funding
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=... ESCROW_SIGNER=... forge script \
 *     script/Deploy.s.sol:DeployEscrowScript --rpc-url $RPC_URL --broadcast -vvvv
 */
contract DeployEscrowScript is Script {
    function _getChainConfig() internal view returns (address usdc, string memory name) {
        uint256 chainId = block.chainid;
        if (chainId == 1)      return (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, "Ethereum Mainnet");
        if (chainId == 8453)   return (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, "Base Mainnet");
        if (chainId == 42161)  return (0xaf88d065e77c8cC2239327C5EDb3A432268e5831, "Arbitrum One");
        if (chainId == 59144)  return (0xFEce4462D57bD51A6A552365A011b95f0E16d9B7, "Linea Mainnet");
        if (chainId == 137)    return (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359, "Polygon PoS");
        if (chainId == 84532)  return (0x036CbD53842c5426634e7929541eC2318f3dCF7e, "Base Sepolia");
        if (chainId == 421614) return (0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d, "Arbitrum Sepolia");
        if (chainId == 59141)  return (0xb33a204b04c0BBE78EB4252C6264C5C94e2FB0dB, "Linea Sepolia");
        if (chainId == 80002)  return (0x41E94EB71EF8C9770BAD3bBd3e492065b2B8ce75, "Polygon Amoy");
        revert("Unsupported chain");
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address escrowSigner = vm.envAddress("ESCROW_SIGNER");

        (address usdcAddress, string memory networkName) = _getChainConfig();

        console.log("=== OpenGrant Escrow Deployment ===");
        console.log("Network:", networkName);
        console.log("Chain ID:", block.chainid);
        console.log("USDC:", usdcAddress);
        console.log("Signer:", escrowSigner);

        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);

        OpenGrantEscrow escrow = new OpenGrantEscrow(
            usdcAddress,
            escrowSigner,
            deployer
        );
        console.log("Escrow:", address(escrow));

        vm.stopBroadcast();

        console.log("");
        console.log("Add to your .env:");
        console.log("OPENGRANT_ESCROW_ADDRESS=", address(escrow));
        console.log("ESCROW_SIGNER_PRIVATE_KEY=<the private key for", escrowSigner, ">");
    }
}

/**
 * @title VerifyDeploymentScript
 * @notice Verifies that contracts are deployed and configured correctly
 */
contract VerifyDeploymentScript is Script {
    function run() external view {
        address registryAddress = vm.envAddress("OPENGRANT_REGISTRY_ADDRESS");
        address paymentsAddress = vm.envAddress("OPENGRANT_PAYMENTS_ADDRESS");

        OpenGrantRegistry registry = OpenGrantRegistry(registryAddress);
        OpenGrantPayments payments = OpenGrantPayments(paymentsAddress);

        console.log("=== Verification ===");
        console.log("Chain ID:", block.chainid);
        console.log("Registry:", registryAddress);
        console.log("  Payments Contract:", registry.paymentsContract());
        console.log("  Owner:", registry.owner());

        console.log("Payments:", paymentsAddress);
        console.log("  Registry:", address(payments.registry()));
        console.log("  USDC:", address(payments.usdc()));
        console.log("  Platform Fee BPS:", payments.platformFeeBPS());
        console.log("  Platform Fee Receiver:", payments.platformFeeReceiver());
        console.log("  Owner:", payments.owner());

        // Verify configuration
        require(
            registry.paymentsContract() == paymentsAddress,
            "Registry payments contract mismatch"
        );
        require(
            address(payments.registry()) == registryAddress,
            "Payments registry mismatch"
        );

        console.log("");
        console.log("All verifications passed!");
    }
}
