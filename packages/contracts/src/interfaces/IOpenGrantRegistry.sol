// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IOpenGrantRegistry
 * @notice Interface for the OpenGrant API Registry contract
 */
interface IOpenGrantRegistry {
    // ============================================
    // STRUCTS
    // ============================================

    struct Publisher {
        address owner;
        address vault;
        string metadataUri; // IPFS hash for off-chain data
        bool isActive;
        uint256 registeredAt;
    }

    struct API {
        bytes32 id;
        address publisher;
        string name;
        string baseUrl;
        string metadataUri; // IPFS hash for documentation
        bool isActive;
        uint256 totalCalls;
        uint256 totalRevenue;
        uint256 createdAt;
    }

    struct Endpoint {
        bytes32 apiId;
        string path;
        string method;
        uint256 pricePerCall; // USDC with 6 decimals
        uint256 rateLimit; // calls per minute
        bool isActive;
    }

    // ============================================
    // EVENTS
    // ============================================

    event PublisherRegistered(
        address indexed publisher,
        address indexed vault,
        string metadataUri
    );

    event PublisherUpdated(address indexed publisher, string metadataUri);

    event PublisherDeactivated(address indexed publisher);

    event APIRegistered(
        bytes32 indexed apiId,
        address indexed publisher,
        string name,
        string baseUrl
    );

    event APIUpdated(bytes32 indexed apiId, string baseUrl, string metadataUri);

    event APIDeactivated(bytes32 indexed apiId);

    event EndpointConfigured(
        bytes32 indexed apiId,
        bytes32 indexed endpointId,
        string path,
        string method,
        uint256 pricePerCall
    );

    event EndpointPriceUpdated(bytes32 indexed endpointId, uint256 newPrice);

    event EndpointDeactivated(bytes32 indexed endpointId);

    // ============================================
    // FUNCTIONS
    // ============================================

    // Publisher functions
    function registerPublisher(
        address vault,
        string calldata metadataUri
    ) external;

    function updatePublisher(string calldata metadataUri) external;

    function updatePublisherVault(address newVault) external;

    function deactivatePublisher() external;

    function getPublisher(
        address publisher
    ) external view returns (Publisher memory);

    function isPublisherActive(address publisher) external view returns (bool);

    // API functions
    function registerAPI(
        string calldata name,
        string calldata baseUrl,
        string calldata metadataUri
    ) external returns (bytes32 apiId);

    function updateAPI(
        bytes32 apiId,
        string calldata baseUrl,
        string calldata metadataUri
    ) external;

    function deactivateAPI(bytes32 apiId) external;

    function getAPI(bytes32 apiId) external view returns (API memory);

    function getPublisherAPIs(
        address publisher
    ) external view returns (bytes32[] memory);

    function isAPIActive(bytes32 apiId) external view returns (bool);

    // Endpoint functions
    function configureEndpoint(
        bytes32 apiId,
        string calldata path,
        string calldata method,
        uint256 pricePerCall,
        uint256 rateLimit
    ) external returns (bytes32 endpointId);

    function updateEndpointPrice(
        bytes32 endpointId,
        uint256 newPrice
    ) external;

    function deactivateEndpoint(bytes32 endpointId) external;

    function getEndpoint(
        bytes32 endpointId
    ) external view returns (Endpoint memory);

    function getAPIEndpoints(
        bytes32 apiId
    ) external view returns (bytes32[] memory);

    function isEndpointActive(bytes32 endpointId) external view returns (bool);

    function getEndpointPrice(
        bytes32 endpointId
    ) external view returns (uint256);
}
