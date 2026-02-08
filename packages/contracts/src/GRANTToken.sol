// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title GRANTToken
 * @notice The native utility token of the OpenGrant Protocol
 * @dev ERC-20 with Permit (gasless approve) and Votes (governance delegation)
 *      Fixed supply of 1,000,000,000 GRANT minted entirely at deployment.
 *      No mint function exists — supply can never increase.
 */
contract GRANTToken is ERC20, ERC20Permit, ERC20Votes {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1 billion with 18 decimals

    /**
     * @notice Deploy GRANT token and mint entire supply to the deployer
     * @dev The deployer is responsible for distributing tokens to vesting contracts,
     *      staking rewards, liquidity pools, etc.
     */
    constructor() ERC20("Grant Token", "GRANT") ERC20Permit("Grant Token") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    // ============================================
    // REQUIRED OVERRIDES (ERC20 + ERC20Votes)
    // ============================================

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(
        address owner_
    ) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }
}
