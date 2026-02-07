// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { OpenGrantRegistry } from "../src/OpenGrantRegistry.sol";
import { OpenGrantPayments } from "../src/OpenGrantPayments.sol";
import { OpenGrantFactory } from "../src/OpenGrantFactory.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployScript
 * @notice Deploys the OpenGrant contracts to Base Sepolia or Base Mainnet
 *
 * @dev Usage:
 * 1. Set environment variables:
 *    - DEPLOYER_PRIVATE_KEY: Private key of deployer
 *    - PLATFORM_WALLET: Address to receive platform fees
 *    - BASE_SEPOLIA_RPC_URL or BASE_MAINNET_RPC_URL
 *
 * 2. Deploy to Base Sepolia:
 *    forge script script/Deploy.s.sol:DeployScript \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      --broadcast --verify -vvvv
 *
 * 3. Deploy to Base Mainnet:
 *    forge script script/Deploy.s.sol:DeployScript \
 *      --rpc-url $BASE_MAINNET_RPC_URL \
 *      --broadcast --verify -vvvv
 */
contract DeployScript is Script {
    // USDC addresses
    address constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // Platform fee: 5% (500 basis points)
    uint256 constant PLATFORM_FEE_BPS = 500;

    function run() external {
        // Get deployment parameters from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address platformWallet = vm.envAddress("PLATFORM_WALLET");

        // Determine USDC address based on chain
        uint256 chainId = block.chainid;
        address usdcAddress;
        string memory networkName;

        if (chainId == 8453) {
            // Base Mainnet
            usdcAddress = USDC_BASE_MAINNET;
            networkName = "Base Mainnet";
        } else if (chainId == 84532) {
            // Base Sepolia
            usdcAddress = USDC_BASE_SEPOLIA;
            networkName = "Base Sepolia";
        } else {
            revert("Unsupported chain");
        }

        console.log("Deploying to:", networkName);
        console.log("Chain ID:", chainId);
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

        // 4. Deploy Factory (args: usdc, platformFeeReceiver, owner)
        OpenGrantFactory factory = new OpenGrantFactory(
            usdcAddress,
            platformWallet,
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

        // 7. Authorize factory to record payments
        payments.setAuthorizedCaller(address(factory), true);
        console.log("Factory authorized as payments caller");

        vm.stopBroadcast();

        // Print summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Network:", networkName);
        console.log("Registry (Proxy):", address(registry));
        console.log("Registry (Impl):", address(registryImpl));
        console.log("Payments:", address(payments));
        console.log("Factory:", address(factory));
        console.log("");
        console.log("Add these to your .env:");
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
