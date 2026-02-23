#!/usr/bin/env bash
# =============================================================================
# verify-blockscout.sh
# Verify all OpenGrant Base Sepolia contracts on Blockscout
#
# Usage:
#   cd packages/contracts
#   chmod +x scripts/verify-blockscout.sh
#   ./scripts/verify-blockscout.sh
#
# Prerequisites:
#   - foundry (forge) installed
#   - Contracts already deployed to Base Sepolia (chain ID 84532)
#   - Run from packages/contracts/ directory
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Configuration
# =============================================================================
CHAIN_ID=84532
VERIFIER="blockscout"
VERIFIER_URL="https://base-sepolia.blockscout.com/api/"

# Contract addresses (Base Sepolia deployment - 2026-02-14)
REGISTRY_IMPL="0x74A25B263c47bE53081274dB037a8182BD9eC90e"
REGISTRY_PROXY="0x9E82afb28b87957AFe50464A5717b5B53E395D0D"
PAYMENTS="0x2a5766F112666B52d2D7E2280dBa76CC3FC6d135"
FACTORY="0x8ec138B556A2c0324146e259d9eBEA38A9575cA0"
GRANT_TOKEN="0x2e5c75c560D4877899a49206c629d04b58faD51A"
GRANT_STAKING="0xF388E071bD758261980d585359Ce2BA0024A8D46"
FEE_DISCOUNT_ORACLE="0x4745DE55e4037b87768AB63Be1F479E4361096c1"
ESCROW="0x6c21371a0758c525f8632ee6466d0b7c35538953"

# Deployment parameters (from .env and deploy scripts)
DEPLOYER="0x32Ef480f66feFDC0fd42D086117d4Bdf90c2e3C3"
PLATFORM_WALLET="0x32Ef480f66feFDC0fd42D086117d4Bdf90c2e3C3"
USDC_BASE_SEPOLIA="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
PLATFORM_FEE_BPS=250
ESCROW_SIGNER="0x32Ef480f66feFDC0fd42D086117d4Bdf90c2e3C3"

# Track results
PASS=0
FAIL=0
SKIP=0

# =============================================================================
# Helper functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
    PASS=$((PASS + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAIL=$((FAIL + 1))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    SKIP=$((SKIP + 1))
}

verify_contract() {
    local name="$1"
    local address="$2"
    local contract="$3"
    shift 3
    # Remaining args are extra forge flags (e.g., --constructor-args ...)
    local extra_args=()
    if [ $# -gt 0 ]; then
        extra_args=("$@")
    fi

    echo ""
    echo "============================================"
    log_info "Verifying: $name @ $address"
    log_info "Source: $contract"
    if [ ${#extra_args[@]} -gt 0 ]; then
        log_info "Extra args: ${extra_args[*]}"
    fi
    echo "--------------------------------------------"

    local cmd=(forge verify-contract
        "$address"
        "$contract"
        --chain-id "$CHAIN_ID"
        --verifier "$VERIFIER"
        --verifier-url "$VERIFIER_URL"
    )
    if [ ${#extra_args[@]} -gt 0 ]; then
        cmd+=("${extra_args[@]}")
    fi

    if "${cmd[@]}" 2>&1; then
        log_ok "$name verified successfully"
    else
        log_fail "$name verification failed"
    fi
}

# =============================================================================
# Pre-flight checks
# =============================================================================

echo "============================================"
echo "  OpenGrant Base Sepolia Contract Verification"
echo "  Chain ID: $CHAIN_ID"
echo "  Verifier: Blockscout"
echo "============================================"
echo ""

# Ensure we're in the right directory
if [ ! -f "foundry.toml" ]; then
    echo -e "${RED}ERROR: foundry.toml not found. Run this script from packages/contracts/${NC}"
    exit 1
fi

# Ensure forge is available
if ! command -v forge &> /dev/null; then
    echo -e "${RED}ERROR: forge not found. Install foundry: https://getfoundry.sh${NC}"
    exit 1
fi

log_info "Building contracts first (ensures artifacts are up to date)..."
forge build --quiet
log_info "Build complete."

# =============================================================================
# 1. Registry Implementation (no constructor args -- uses _disableInitializers)
#    constructor() { _disableInitializers(); }
# =============================================================================

verify_contract \
    "Registry (Implementation)" \
    "$REGISTRY_IMPL" \
    "src/OpenGrantRegistry.sol:OpenGrantRegistry"

# =============================================================================
# 2. Registry Proxy (ERC1967Proxy)
#    constructor(address implementation, bytes memory _data)
#
#    Constructor args:
#      - implementation = REGISTRY_IMPL (0x74A25B263c47bE53081274dB037a8182BD9eC90e)
#      - _data = abi.encodeWithSelector(OpenGrantRegistry.initialize.selector, DEPLOYER)
#              = initialize(address) = 0xc4d66de8 + deployer address
#
#    We use --constructor-args with the ABI-encoded values.
# =============================================================================

# The initialize call data: initialize(address) selector + deployer address
# initialize.selector = bytes4(keccak256("initialize(address)")) = 0xc4d66de8
# Full calldata: 0xc4d66de800000000000000000000000032ef480f66fefdc0fd42d086117d4bdf90c2e3c3
INIT_CALLDATA="0xc4d66de800000000000000000000000032ef480f66fefdc0fd42d086117d4bdf90c2e3c3"

verify_contract \
    "Registry (Proxy - ERC1967Proxy)" \
    "$REGISTRY_PROXY" \
    "lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy" \
    --constructor-args "$(cast abi-encode 'constructor(address,bytes)' "$REGISTRY_IMPL" "$INIT_CALLDATA")"

# =============================================================================
# 3. Payments Contract
#    constructor(
#        address _usdc,           = USDC_BASE_SEPOLIA
#        address _registry,       = REGISTRY_PROXY
#        address _platformFeeReceiver, = PLATFORM_WALLET
#        uint256 _platformFeeBPS, = 250
#        address _owner           = DEPLOYER
#    )
# =============================================================================

verify_contract \
    "OpenGrantPayments" \
    "$PAYMENTS" \
    "src/OpenGrantPayments.sol:OpenGrantPayments" \
    --constructor-args "$(cast abi-encode 'constructor(address,address,address,uint256,address)' \
        "$USDC_BASE_SEPOLIA" \
        "$REGISTRY_PROXY" \
        "$PLATFORM_WALLET" \
        "$PLATFORM_FEE_BPS" \
        "$DEPLOYER")"

# =============================================================================
# 4. Factory (OpenGrantFactory, NOT PublisherVaultFactory)
#    constructor(address _usdc, address _owner)
# =============================================================================

verify_contract \
    "OpenGrantFactory" \
    "$FACTORY" \
    "src/OpenGrantFactory.sol:OpenGrantFactory" \
    --constructor-args "$(cast abi-encode 'constructor(address,address)' \
        "$USDC_BASE_SEPOLIA" \
        "$DEPLOYER")"

# =============================================================================
# 5. GRANTToken
#    constructor() -- no args, mints to msg.sender
# =============================================================================

verify_contract \
    "GRANTToken" \
    "$GRANT_TOKEN" \
    "src/GRANTToken.sol:GRANTToken"

# =============================================================================
# 6. GRANTStaking
#    constructor(
#        address _stakingToken,    = GRANT_TOKEN
#        address _rewardTokenUSDC, = USDC_BASE_SEPOLIA
#        address _owner            = DEPLOYER
#    )
# =============================================================================

verify_contract \
    "GRANTStaking" \
    "$GRANT_STAKING" \
    "src/GRANTStaking.sol:GRANTStaking" \
    --constructor-args "$(cast abi-encode 'constructor(address,address,address)' \
        "$GRANT_TOKEN" \
        "$USDC_BASE_SEPOLIA" \
        "$DEPLOYER")"

# =============================================================================
# 7. FeeDiscountOracle
#    constructor(address _stakingContract, address _owner)
# =============================================================================

verify_contract \
    "FeeDiscountOracle" \
    "$FEE_DISCOUNT_ORACLE" \
    "src/FeeDiscountOracle.sol:FeeDiscountOracle" \
    --constructor-args "$(cast abi-encode 'constructor(address,address)' \
        "$GRANT_STAKING" \
        "$DEPLOYER")"

# =============================================================================
# 8. Escrow (OpenGrantEscrow)
#    constructor(
#        address _usdc,             = USDC_BASE_SEPOLIA
#        address _authorizedSigner, = ESCROW_SIGNER (same as DEPLOYER)
#        address _owner             = DEPLOYER
#    )
# =============================================================================

verify_contract \
    "OpenGrantEscrow" \
    "$ESCROW" \
    "src/OpenGrantEscrow.sol:OpenGrantEscrow" \
    --constructor-args "$(cast abi-encode 'constructor(address,address,address)' \
        "$USDC_BASE_SEPOLIA" \
        "$ESCROW_SIGNER" \
        "$DEPLOYER")"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "============================================"
echo "  Verification Summary"
echo "============================================"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo "  Total:  $((PASS + FAIL + SKIP)) / 8"
echo "============================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${YELLOW}Some verifications failed. Common issues:${NC}"
    echo "  1. Contract already verified (this is fine -- Blockscout returns an error but it's verified)"
    echo "  2. Compiler mismatch -- ensure foundry.toml matches deployment settings"
    echo "  3. Constructor args mismatch -- double-check deployed transaction input data"
    echo ""
    echo "To debug a specific contract, run manually:"
    echo "  forge verify-contract <ADDRESS> <SOURCE> \\"
    echo "    --chain-id $CHAIN_ID \\"
    echo "    --verifier $VERIFIER \\"
    echo "    --verifier-url $VERIFIER_URL \\"
    echo "    --constructor-args \$(cast abi-encode ...) -vvvv"
    exit 1
fi

echo -e "${GREEN}All contracts verified successfully!${NC}"
echo ""
echo "View on Blockscout:"
echo "  Registry (Proxy):    https://base-sepolia.blockscout.com/address/$REGISTRY_PROXY"
echo "  Registry (Impl):     https://base-sepolia.blockscout.com/address/$REGISTRY_IMPL"
echo "  Payments:            https://base-sepolia.blockscout.com/address/$PAYMENTS"
echo "  Factory:             https://base-sepolia.blockscout.com/address/$FACTORY"
echo "  GRANTToken:          https://base-sepolia.blockscout.com/address/$GRANT_TOKEN"
echo "  GRANTStaking:        https://base-sepolia.blockscout.com/address/$GRANT_STAKING"
echo "  FeeDiscountOracle:   https://base-sepolia.blockscout.com/address/$FEE_DISCOUNT_ORACLE"
echo "  Escrow:              https://base-sepolia.blockscout.com/address/$ESCROW"
