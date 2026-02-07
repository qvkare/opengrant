// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IOpenGrantRegistry } from "./interfaces/IOpenGrantRegistry.sol";

/**
 * @title OpenGrantRegistry
 * @notice Registry for publishers, APIs, and endpoints in the OpenGrant marketplace
 * @dev Upgradeable via UUPS pattern
 */
contract OpenGrantRegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IOpenGrantRegistry
{
    // ============================================
    // STATE VARIABLES
    // ============================================

    // Publishers
    mapping(address => Publisher) private _publishers;
    address[] private _publisherList;

    // APIs
    mapping(bytes32 => API) private _apis;
    mapping(address => bytes32[]) private _publisherAPIs;
    uint256 private _apiCount;

    // Endpoints
    mapping(bytes32 => Endpoint) private _endpoints;
    mapping(bytes32 => bytes32[]) private _apiEndpoints;

    // Payments contract reference
    address public paymentsContract;

    // ============================================
    // STORAGE GAP (for future upgrades)
    // ============================================

    uint256[50] private __gap;

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyActivePublisher() {
        require(
            _publishers[msg.sender].isActive,
            "OpenGrantRegistry: caller is not an active publisher"
        );
        _;
    }

    modifier onlyAPIOwner(bytes32 apiId) {
        require(
            _apis[apiId].publisher == msg.sender,
            "OpenGrantRegistry: caller is not the API owner"
        );
        _;
    }

    // ============================================
    // INITIALIZER
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
    }

    // ============================================
    // PUBLISHER FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function registerPublisher(
        address vault,
        string calldata metadataUri
    ) external override whenNotPaused {
        require(
            !_publishers[msg.sender].isActive,
            "OpenGrantRegistry: publisher already registered"
        );
        require(vault != address(0), "OpenGrantRegistry: invalid vault address");

        _publishers[msg.sender] = Publisher({
            owner: msg.sender,
            vault: vault,
            metadataUri: metadataUri,
            isActive: true,
            registeredAt: block.timestamp
        });

        _publisherList.push(msg.sender);

        emit PublisherRegistered(msg.sender, vault, metadataUri);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function updatePublisher(
        string calldata metadataUri
    ) external override whenNotPaused onlyActivePublisher {
        _publishers[msg.sender].metadataUri = metadataUri;
        emit PublisherUpdated(msg.sender, metadataUri);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function deactivatePublisher() external override onlyActivePublisher {
        _publishers[msg.sender].isActive = false;

        // Deactivate all APIs
        bytes32[] memory apiIds = _publisherAPIs[msg.sender];
        for (uint256 i = 0; i < apiIds.length; i++) {
            if (_apis[apiIds[i]].isActive) {
                _apis[apiIds[i]].isActive = false;
                emit APIDeactivated(apiIds[i]);
            }
        }

        emit PublisherDeactivated(msg.sender);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getPublisher(
        address publisher
    ) external view override returns (Publisher memory) {
        return _publishers[publisher];
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function isPublisherActive(
        address publisher
    ) external view override returns (bool) {
        return _publishers[publisher].isActive;
    }

    // ============================================
    // API FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function registerAPI(
        string calldata name,
        string calldata baseUrl,
        string calldata metadataUri
    )
        external
        override
        whenNotPaused
        onlyActivePublisher
        returns (bytes32 apiId)
    {
        apiId = keccak256(abi.encodePacked(msg.sender, name, _apiCount));

        require(
            _apis[apiId].createdAt == 0,
            "OpenGrantRegistry: API already exists"
        );

        _apis[apiId] = API({
            id: apiId,
            publisher: msg.sender,
            name: name,
            baseUrl: baseUrl,
            metadataUri: metadataUri,
            isActive: true,
            totalCalls: 0,
            totalRevenue: 0,
            createdAt: block.timestamp
        });

        _publisherAPIs[msg.sender].push(apiId);
        _apiCount++;

        emit APIRegistered(apiId, msg.sender, name, baseUrl);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function updateAPI(
        bytes32 apiId,
        string calldata baseUrl,
        string calldata metadataUri
    ) external override whenNotPaused onlyAPIOwner(apiId) {
        require(_apis[apiId].isActive, "OpenGrantRegistry: API is not active");

        _apis[apiId].baseUrl = baseUrl;
        _apis[apiId].metadataUri = metadataUri;

        emit APIUpdated(apiId, baseUrl, metadataUri);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function deactivateAPI(
        bytes32 apiId
    ) external override onlyAPIOwner(apiId) {
        require(_apis[apiId].isActive, "OpenGrantRegistry: API already inactive");

        _apis[apiId].isActive = false;

        // Deactivate all endpoints
        bytes32[] memory endpointIds = _apiEndpoints[apiId];
        for (uint256 i = 0; i < endpointIds.length; i++) {
            if (_endpoints[endpointIds[i]].isActive) {
                _endpoints[endpointIds[i]].isActive = false;
                emit EndpointDeactivated(endpointIds[i]);
            }
        }

        emit APIDeactivated(apiId);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getAPI(
        bytes32 apiId
    ) external view override returns (API memory) {
        return _apis[apiId];
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getPublisherAPIs(
        address publisher
    ) external view override returns (bytes32[] memory) {
        return _publisherAPIs[publisher];
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function isAPIActive(bytes32 apiId) external view override returns (bool) {
        return _apis[apiId].isActive;
    }

    // ============================================
    // ENDPOINT FUNCTIONS
    // ============================================

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function configureEndpoint(
        bytes32 apiId,
        string calldata path,
        string calldata method,
        uint256 pricePerCall,
        uint256 rateLimit
    )
        external
        override
        whenNotPaused
        onlyAPIOwner(apiId)
        returns (bytes32 endpointId)
    {
        require(_apis[apiId].isActive, "OpenGrantRegistry: API is not active");

        endpointId = keccak256(abi.encodePacked(apiId, path, method));

        _endpoints[endpointId] = Endpoint({
            apiId: apiId,
            path: path,
            method: method,
            pricePerCall: pricePerCall,
            rateLimit: rateLimit,
            isActive: true
        });

        // Add to API endpoints if new
        bool exists = false;
        bytes32[] memory existing = _apiEndpoints[apiId];
        for (uint256 i = 0; i < existing.length; i++) {
            if (existing[i] == endpointId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            _apiEndpoints[apiId].push(endpointId);
        }

        emit EndpointConfigured(apiId, endpointId, path, method, pricePerCall);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function updateEndpointPrice(
        bytes32 endpointId,
        uint256 newPrice
    ) external override whenNotPaused {
        Endpoint storage endpoint = _endpoints[endpointId];
        require(endpoint.isActive, "OpenGrantRegistry: endpoint is not active");
        require(
            _apis[endpoint.apiId].publisher == msg.sender,
            "OpenGrantRegistry: caller is not the API owner"
        );

        endpoint.pricePerCall = newPrice;
        emit EndpointPriceUpdated(endpointId, newPrice);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function deactivateEndpoint(bytes32 endpointId) external override {
        Endpoint storage endpoint = _endpoints[endpointId];
        require(endpoint.isActive, "OpenGrantRegistry: endpoint already inactive");
        require(
            _apis[endpoint.apiId].publisher == msg.sender,
            "OpenGrantRegistry: caller is not the API owner"
        );

        endpoint.isActive = false;
        emit EndpointDeactivated(endpointId);
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getEndpoint(
        bytes32 endpointId
    ) external view override returns (Endpoint memory) {
        return _endpoints[endpointId];
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getAPIEndpoints(
        bytes32 apiId
    ) external view override returns (bytes32[] memory) {
        return _apiEndpoints[apiId];
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function isEndpointActive(
        bytes32 endpointId
    ) external view override returns (bool) {
        return _endpoints[endpointId].isActive;
    }

    /**
     * @inheritdoc IOpenGrantRegistry
     */
    function getEndpointPrice(
        bytes32 endpointId
    ) external view override returns (uint256) {
        return _endpoints[endpointId].pricePerCall;
    }

    // ============================================
    // INTERNAL FUNCTIONS (for payments contract)
    // ============================================

    /**
     * @notice Increment API statistics (called by payments contract)
     * @param apiId The API ID
     * @param calls Number of calls to add
     * @param revenue Revenue to add
     */
    function incrementAPIStats(
        bytes32 apiId,
        uint256 calls,
        uint256 revenue
    ) external {
        require(
            msg.sender == paymentsContract,
            "OpenGrantRegistry: caller is not payments contract"
        );
        _apis[apiId].totalCalls += calls;
        _apis[apiId].totalRevenue += revenue;
    }

    /**
     * @notice Get publisher vault address
     * @param publisher The publisher address
     * @return Vault address
     */
    function getPublisherVault(
        address publisher
    ) external view returns (address) {
        return _publishers[publisher].vault;
    }

    /**
     * @notice Get API publisher
     * @param apiId The API ID
     * @return Publisher address
     */
    function getAPIPublisher(bytes32 apiId) external view returns (address) {
        return _apis[apiId].publisher;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @notice Set the payments contract address
     * @param _paymentsContract The payments contract address
     */
    function setPaymentsContract(
        address _paymentsContract
    ) external onlyOwner {
        require(_paymentsContract != address(0), "OpenGrantRegistry: zero address");
        address oldContract = paymentsContract;
        paymentsContract = _paymentsContract;
        emit PaymentsContractUpdated(oldContract, _paymentsContract);
    }

    event PaymentsContractUpdated(address indexed oldContract, address indexed newContract);

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============================================
    // UPGRADE AUTHORIZATION
    // ============================================

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
