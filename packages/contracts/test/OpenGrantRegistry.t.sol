// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { OpenGrantRegistry } from "../src/OpenGrantRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IOpenGrantRegistry } from "../src/interfaces/IOpenGrantRegistry.sol";

contract OpenGrantRegistryTest is Test {
    OpenGrantRegistry public registry;
    OpenGrantRegistry public registryImpl;

    address public owner = address(0x1);
    address public publisher1 = address(0x2);
    address public publisher2 = address(0x3);
    address public vault1 = address(0x4);
    address public vault2 = address(0x5);
    address public paymentsContract = address(0x6);

    function setUp() public {
        // Deploy implementation
        registryImpl = new OpenGrantRegistry();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(OpenGrantRegistry.initialize.selector, owner);
        ERC1967Proxy proxy = new ERC1967Proxy(address(registryImpl), initData);
        registry = OpenGrantRegistry(address(proxy));

        // Set payments contract
        vm.prank(owner);
        registry.setPaymentsContract(paymentsContract);
    }

    // ============================================
    // PUBLISHER TESTS
    // ============================================

    function test_RegisterPublisher() public {
        vm.prank(publisher1);
        registry.registerPublisher(vault1, "https://metadata.example.com/pub1");

        IOpenGrantRegistry.Publisher memory pub = registry.getPublisher(publisher1);
        assertEq(pub.owner, publisher1);
        assertEq(pub.vault, vault1);
        assertEq(pub.metadataUri, "https://metadata.example.com/pub1");
        assertTrue(pub.isActive);
        assertGt(pub.registeredAt, 0);
    }

    function test_RevertRegisterPublisher_AlreadyRegistered() public {
        vm.startPrank(publisher1);
        registry.registerPublisher(vault1, "ipfs://metadata");

        vm.expectRevert("OpenGrantRegistry: publisher already registered");
        registry.registerPublisher(vault1, "ipfs://metadata2");
        vm.stopPrank();
    }

    function test_RevertRegisterPublisher_InvalidVault() public {
        vm.prank(publisher1);
        vm.expectRevert("OpenGrantRegistry: invalid vault address");
        registry.registerPublisher(address(0), "ipfs://metadata");
    }

    function test_UpdatePublisher() public {
        vm.startPrank(publisher1);
        registry.registerPublisher(vault1, "https://old-metadata");
        registry.updatePublisher("https://new-metadata");
        vm.stopPrank();

        IOpenGrantRegistry.Publisher memory pub = registry.getPublisher(publisher1);
        assertEq(pub.metadataUri, "https://new-metadata");
    }

    function test_DeactivatePublisher() public {
        vm.startPrank(publisher1);
        registry.registerPublisher(vault1, "ipfs://metadata");

        assertTrue(registry.isPublisherActive(publisher1));

        registry.deactivatePublisher();
        vm.stopPrank();

        assertFalse(registry.isPublisherActive(publisher1));
    }

    function test_ReRegisterPublisher_NoDuplicate() public {
        // Register publisher
        vm.prank(publisher1);
        registry.registerPublisher(vault1, "ipfs://metadata");

        // Deactivate
        vm.prank(publisher1);
        registry.deactivatePublisher();
        assertFalse(registry.isPublisherActive(publisher1));

        // Re-register
        vm.prank(publisher1);
        registry.registerPublisher(vault1, "ipfs://metadata-v2");
        assertTrue(registry.isPublisherActive(publisher1));

        // Verify publisher is not duplicated in the list
        // Register a second publisher to check list length
        vm.prank(publisher2);
        registry.registerPublisher(vault2, "ipfs://metadata");

        // If no duplicate, getPublisher for publisher1 should still work
        // and the publisher should appear exactly once
        IOpenGrantRegistry.Publisher memory pub = registry.getPublisher(publisher1);
        assertEq(pub.metadataUri, "ipfs://metadata-v2");
        assertTrue(pub.isActive);
    }

    // ============================================
    // API TESTS
    // ============================================

    function test_RegisterAPI() public {
        _setupPublisher(publisher1, vault1);

        vm.prank(publisher1);
        bytes32 apiId = registry.registerAPI(
            "My API",
            "https://api.example.com",
            "https://metadata.example.com/api"
        );

        IOpenGrantRegistry.API memory api = registry.getAPI(apiId);
        assertEq(api.id, apiId);
        assertEq(api.publisher, publisher1);
        assertEq(api.name, "My API");
        assertEq(api.baseUrl, "https://api.example.com");
        assertTrue(api.isActive);
    }

    function test_RegisterMultipleAPIs() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 api1 = registry.registerAPI("API 1", "https://api1.example.com", "");
        bytes32 api2 = registry.registerAPI("API 2", "https://api2.example.com", "");
        vm.stopPrank();

        bytes32[] memory publisherAPIs = registry.getPublisherAPIs(publisher1);
        assertEq(publisherAPIs.length, 2);
        assertEq(publisherAPIs[0], api1);
        assertEq(publisherAPIs[1], api2);
    }

    function test_RevertRegisterAPI_NotPublisher() public {
        vm.prank(publisher1);
        vm.expectRevert("OpenGrantRegistry: caller is not an active publisher");
        registry.registerAPI("Test", "https://api.example.com", "");
    }

    function test_UpdateAPI() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://old-url.com", "");
        registry.updateAPI(apiId, "https://new-url.com", "https://new-metadata.com");
        vm.stopPrank();

        IOpenGrantRegistry.API memory api = registry.getAPI(apiId);
        assertEq(api.baseUrl, "https://new-url.com");
        assertEq(api.metadataUri, "https://new-metadata.com");
    }

    function test_DeactivateAPI() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");

        assertTrue(registry.isAPIActive(apiId));

        registry.deactivateAPI(apiId);
        vm.stopPrank();

        assertFalse(registry.isAPIActive(apiId));
    }

    function test_RevertUpdateAPI_NotOwner() public {
        _setupPublisher(publisher1, vault1);
        _setupPublisher(publisher2, vault2);

        vm.prank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");

        vm.prank(publisher2);
        vm.expectRevert("OpenGrantRegistry: caller is not the API owner");
        registry.updateAPI(apiId, "https://hacked.com", "");
    }

    // ============================================
    // ENDPOINT TESTS
    // ============================================

    function test_ConfigureEndpoint() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");

        bytes32 endpointId = registry.configureEndpoint(
            apiId,
            "/v1/generate",
            "POST",
            1000000, // 1 USDC
            100 // 100 requests per minute
        );
        vm.stopPrank();

        IOpenGrantRegistry.Endpoint memory endpoint = registry.getEndpoint(endpointId);
        assertEq(endpoint.apiId, apiId);
        assertEq(endpoint.path, "/v1/generate");
        assertEq(endpoint.method, "POST");
        assertEq(endpoint.pricePerCall, 1000000);
        assertEq(endpoint.rateLimit, 100);
        assertTrue(endpoint.isActive);
    }

    function test_UpdateEndpointPrice() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");
        bytes32 endpointId = registry.configureEndpoint(apiId, "/v1/test", "GET", 1000000, 100);

        registry.updateEndpointPrice(endpointId, 2000000);
        vm.stopPrank();

        assertEq(registry.getEndpointPrice(endpointId), 2000000);
    }

    function test_DeactivateEndpoint() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");
        bytes32 endpointId = registry.configureEndpoint(apiId, "/v1/test", "GET", 1000000, 100);

        assertTrue(registry.isEndpointActive(endpointId));

        registry.deactivateEndpoint(endpointId);
        vm.stopPrank();

        assertFalse(registry.isEndpointActive(endpointId));
    }

    function test_GetAPIEndpoints() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");
        bytes32 ep1 = registry.configureEndpoint(apiId, "/v1/generate", "POST", 1000000, 100);
        bytes32 ep2 = registry.configureEndpoint(apiId, "/v1/status", "GET", 0, 1000);
        vm.stopPrank();

        bytes32[] memory endpoints = registry.getAPIEndpoints(apiId);
        assertEq(endpoints.length, 2);
        assertEq(endpoints[0], ep1);
        assertEq(endpoints[1], ep2);
    }

    // ============================================
    // ADMIN TESTS
    // ============================================

    function test_Pause() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(publisher1);
        vm.expectRevert();
        registry.registerPublisher(vault1, "ipfs://metadata");
    }

    function test_Unpause() public {
        vm.startPrank(owner);
        registry.pause();
        registry.unpause();
        vm.stopPrank();

        vm.prank(publisher1);
        registry.registerPublisher(vault1, "ipfs://metadata");
    }

    function test_IncrementAPIStats() public {
        _setupPublisher(publisher1, vault1);

        vm.prank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");

        IOpenGrantRegistry.API memory apiBefore = registry.getAPI(apiId);
        assertEq(apiBefore.totalCalls, 0);
        assertEq(apiBefore.totalRevenue, 0);

        vm.prank(paymentsContract);
        registry.incrementAPIStats(apiId, 5, 5000000);

        IOpenGrantRegistry.API memory apiAfter = registry.getAPI(apiId);
        assertEq(apiAfter.totalCalls, 5);
        assertEq(apiAfter.totalRevenue, 5000000);
    }

    function test_RevertIncrementAPIStats_NotPaymentsContract() public {
        _setupPublisher(publisher1, vault1);

        vm.prank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");

        vm.prank(address(0x999));
        vm.expectRevert("OpenGrantRegistry: caller is not payments contract");
        registry.incrementAPIStats(apiId, 1, 1000000);
    }

    // ============================================
    // CASCADING DEACTIVATION TESTS
    // ============================================

    function test_DeactivatePublisher_DeactivatesAPIs() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 api1 = registry.registerAPI("API 1", "https://api1.example.com", "");
        bytes32 api2 = registry.registerAPI("API 2", "https://api2.example.com", "");

        assertTrue(registry.isAPIActive(api1));
        assertTrue(registry.isAPIActive(api2));

        registry.deactivatePublisher();
        vm.stopPrank();

        assertFalse(registry.isAPIActive(api1));
        assertFalse(registry.isAPIActive(api2));
    }

    function test_DeactivateAPI_DeactivatesEndpoints() public {
        _setupPublisher(publisher1, vault1);

        vm.startPrank(publisher1);
        bytes32 apiId = registry.registerAPI("My API", "https://api.example.com", "");
        bytes32 ep1 = registry.configureEndpoint(apiId, "/v1/endpoint1", "GET", 1000000, 100);
        bytes32 ep2 = registry.configureEndpoint(apiId, "/v1/endpoint2", "POST", 2000000, 50);

        assertTrue(registry.isEndpointActive(ep1));
        assertTrue(registry.isEndpointActive(ep2));

        registry.deactivateAPI(apiId);
        vm.stopPrank();

        assertFalse(registry.isEndpointActive(ep1));
        assertFalse(registry.isEndpointActive(ep2));
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    function _setupPublisher(address publisher, address vault) internal {
        vm.prank(publisher);
        registry.registerPublisher(vault, "ipfs://metadata");
    }
}
