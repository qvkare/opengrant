// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PublisherVault } from "./PublisherVault.sol";

/**
 * @title OpenGrantFactory
 * @notice Factory for deploying PublisherVault contracts
 */
contract OpenGrantFactory is Ownable {
    // ============================================
    // STATE VARIABLES
    // ============================================

    // USDC token address
    IERC20 public immutable usdc;

    // Platform contracts
    address public registry;
    address public paymentsContract;

    // Deployed vaults
    mapping(address => address) public publisherVaults;
    address[] public allVaults;

    // ============================================
    // EVENTS
    // ============================================

    event VaultDeployed(
        address indexed publisher,
        address indexed vault,
        address[] payees,
        uint256[] shares
    );

    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event PaymentsContractUpdated(address indexed oldContract, address indexed newContract);

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(
        address _usdc,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0), "OpenGrantFactory: invalid USDC");

        usdc = IERC20(_usdc);
    }

    // ============================================
    // VAULT DEPLOYMENT
    // ============================================

    /**
     * @notice Deploy a new PublisherVault for a publisher
     * @param payees Array of payee addresses
     * @param shares Array of shares for each payee
     * @return vault The deployed vault address
     */
    function deployVault(
        address[] calldata payees,
        uint256[] calldata shares
    ) external returns (address vault) {
        require(
            publisherVaults[msg.sender] == address(0),
            "OpenGrantFactory: vault already exists"
        );
        require(payees.length > 0, "OpenGrantFactory: no payees");
        require(payees.length == shares.length, "OpenGrantFactory: arrays mismatch");
        require(paymentsContract != address(0), "OpenGrantFactory: payments not set");

        // Generate vault name and symbol
        string memory name = string(
            abi.encodePacked("OpenGrant Vault - ", _addressToString(msg.sender))
        );
        string memory symbol = "ogVault";

        // Deploy vault
        vault = address(
            new PublisherVault(
                usdc,
                name,
                symbol,
                msg.sender,
                payees,
                shares,
                paymentsContract
            )
        );

        // Track vault
        publisherVaults[msg.sender] = vault;
        allVaults.push(vault);

        emit VaultDeployed(msg.sender, vault, payees, shares);
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Get vault for a publisher
     * @param publisher Publisher address
     * @return Vault address (or zero if none)
     */
    function getVault(address publisher) external view returns (address) {
        return publisherVaults[publisher];
    }

    /**
     * @notice Get total number of vaults
     * @return Number of deployed vaults
     */
    function getVaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    /**
     * @notice Get all vault addresses
     * @return Array of vault addresses
     */
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @notice Set registry contract
     * @param _registry New registry address
     */
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "OpenGrantFactory: invalid registry");
        address old = registry;
        registry = _registry;
        emit RegistryUpdated(old, _registry);
    }

    /**
     * @notice Set payments contract
     * @param _paymentsContract New payments contract address
     */
    function setPaymentsContract(address _paymentsContract) external onlyOwner {
        require(_paymentsContract != address(0), "OpenGrantFactory: invalid payments contract");
        address old = paymentsContract;
        paymentsContract = _paymentsContract;
        emit PaymentsContractUpdated(old, _paymentsContract);
    }

    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================

    function _addressToString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(addr);
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}
