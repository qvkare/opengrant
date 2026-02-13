# OpenGrant

Crypto-native API marketplace and open source funding platform using x402 micropayments, on-chain USDC escrow, and Chainlink CRE.

## Overview

OpenGrant enables open-source projects to monetize their APIs through HTTP-native micropayments **and** receive direct funding through trustless on-chain escrow. Built on multi-chain EVM (Base, Arbitrum, Linea, Polygon) with USDC, it provides instant, low-cost payments with 2-second finality.

### Key Features

- **x402 Protocol**: HTTP-native micropayments via the 402 Payment Required status code
- **Open Source Funding**: USDC escrow for direct donations and dependency-based stack funding
- **Stack Fund**: Upload package.json/Cargo.toml/go.mod to fund your entire dependency tree
- **Trustless Escrow**: On-chain USDC escrow with ECDSA-signed claims, 365-day refund protection
- **Multi-Chain**: Supports Ethereum, Base, Arbitrum, Linea, Polygon (mainnets + testnets)
- **Chainlink CRE**: Decentralized workflow orchestration for payment verification and settlements
- **USDC Payments**: Stable, predictable pricing for API consumers and donors
- **Particle Network ConnectKit**: Seamless wallet abstraction with email/social login support
- **Publisher Vaults**: ERC-4626 + PaymentSplitter for revenue distribution

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         OpenGrant Platform                           │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │
│  │   Web    │  │   CLI    │  │   SDK    │  │       API          │   │
│  │(Next.js) │  │(Node.js) │  │   (TS)   │  │    (Express)       │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬───────────┘   │
│       │             │             │                  │               │
│       └─────────────┴─────────────┴──────────────────┘               │
│                              │                                       │
│  ┌───────────────────────────┴────────────────────────────────────┐  │
│  │                    x402 Payment Layer                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐        │  │
│  │  │  Facilitator │  │  Verifier   │  │  EIP-3009 Sigs  │        │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴────────────────────────────────────┐  │
│  │                    Chainlink CRE                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐        │  │
│  │  │   Payment   │  │   Usage     │  │     Health      │        │  │
│  │  │ Verification│  │ Aggregation │  │   Monitoring    │        │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴────────────────────────────────────┐  │
│  │                Smart Contracts (Multi-Chain EVM)               │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌───────────────┐   │  │
│  │  │ Registry │ │ Payments │ │   Escrow   │ │Publisher Vault│   │  │
│  │  └──────────┘ └──────────┘ └────────────┘ └───────────────┘   │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
opengrant/
├── apps/
│   ├── api/             # Express 5 API server
│   │   ├── routes/v1/   # REST endpoints (auth, apis, consumer, publisher, fund)
│   │   └── services/    # GitHub, escrow, dependency, payment services
│   ├── web/             # Next.js 16 web application
│   │   └── app/fund/    # Fund explore, project detail, stack fund, claim pages
│   └── cli/             # Command-line interface
├── packages/
│   ├── database/        # Drizzle ORM schema (publishers, apis, repos, donations)
│   ├── sdk/             # TypeScript SDK for consumers
│   ├── contracts/       # Solidity smart contracts (Foundry)
│   │   └── src/         # Registry, Payments, Escrow, Factory, GRANT token
│   └── cre-workflows/   # Chainlink CRE workflow definitions
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local development)
- Foundry (for smart contract development)

### Installation

```bash
# Clone the repository
git clone https://github.com/qvkare/opengrant.git
cd opengrant

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis)
pnpm docker:dev

# Run database migrations
pnpm db:push

# Start development servers
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm build            # Build all packages and apps
pnpm typecheck        # Type check all packages

# Testing
pnpm turbo test       # Run all JS/TS tests (281 tests)
cd packages/contracts && forge test  # Run Solidity tests (232 tests)

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema to database
pnpm db:studio        # Open Drizzle Studio

# Docker
pnpm docker:dev       # Start dev infrastructure
pnpm docker:dev:down  # Stop dev infrastructure
pnpm docker:build     # Build production images
pnpm docker:up        # Start production stack
```

## SDK Usage

```typescript
import { OpenGrant } from '@opengrant/sdk';

const client = new OpenGrant({
  apiKey: 'og_live_xxx',
  privateKey: '0x...', // Optional: for automatic payments
});

// Make an API call
const response = await client.post('tailwind', '/v1/generate', {
  input: 'A blue primary button with rounded corners',
});

console.log(response.data);
// { classes: 'bg-blue-500 text-white px-4 py-2 rounded-lg' }
```

## CLI Usage

```bash
# Install globally
npm install -g @opengrant/cli

# Login
opengrant login

# Check balance
opengrant balance

# Add funds
opengrant fund 50

# View usage stats
opengrant stats

# Create API key
opengrant keys create --name "my-app"

# Publisher: Verify GitHub identity
opengrant publish verify-github --token ghp_xxx

# Publisher: Register API with GitHub repo link
opengrant publish create-api \
  --name "Weather API" \
  --slug "weather" \
  --url "https://api.weather.example.com" \
  --github-repo "ali/weather-api" \
  --github-token ghp_xxx
```

## How It Works

### API Payment Flow (x402)

1. Consumer makes API request with `Authorization: Bearer <api_key>`
2. API returns `402 Payment Required` with payment details in `X-402-Payment` header
3. SDK automatically signs EIP-3009 `transferWithAuthorization`
4. Signed payment sent to x402 Facilitator
5. Facilitator returns payment token
6. Request retried with `X-402-Payment-Token` header
7. API verifies payment and returns response

### Settlement Flow

1. Chainlink CRE aggregates usage records every 5 minutes
2. Payments are batched and distributed to Publisher Vaults
3. Publishers can withdraw from their vaults anytime
4. Platform fee (5%) is automatically deducted

### Open Source Funding Flow

**Direct Fund:**
1. Browse funded projects at `/fund` or search by language/stars
2. Select a project and choose donation amount (USDC)
3. Approve USDC and call `escrow.donate()` on-chain
4. Funds held in trustless escrow until claimed by project maintainer

**Stack Fund:**
1. Upload `package.json`, `Cargo.toml`, or `go.mod` at `/fund/stack`
2. System resolves dependencies to GitHub repos and scores by importance
3. Set a total budget and review distribution across projects
4. Single `escrow.batchDonate()` call funds entire dependency tree

**Claim Flow (for maintainers):**
1. Connect wallet and verify GitHub ownership
2. Backend signs ECDSA claim authorization (attesting repo ownership)
3. Maintainer calls `escrow.claim()` with the signature (user pays gas)
4. Escrow transfers accumulated USDC to maintainer's wallet

**Refund:** Unclaimed donations can be refunded after 365 days, or redistributed to other projects.

### Publisher GitHub Verification

Publishers can verify their GitHub identity to link their APIs to GitHub repositories. This creates a bridge between the escrow (donation) flow and the publisher (API revenue) flow:

1. Publisher verifies GitHub identity: `POST /v1/publisher/verify-github` (with GitHub PAT)
2. Backend calls GitHub API to confirm the user's identity (`GET /api.github.com/user`)
3. Publisher links an API to a GitHub repo: `POST /v1/publisher/apis` with `githubRepo: "owner/name"`
4. Backend verifies admin access on the repo via GitHub API
5. The `apis.githubRepoId` column now references the same `github_repos` row used by the escrow system

This means a project's fund page (`/fund/owner/name`) can show linked APIs, and a publisher's API page can show the associated funding status. The two revenue streams (donations and API income) remain separate wallets but are unified through GitHub identity.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT token signing (min 32 chars) |
| `CHAIN_ID` | Blockchain chain ID (8453 for Base) |
| `RPC_URL` | Ethereum RPC URL |
| `PLATFORM_WALLET` | Platform fee recipient address |
| `NEXT_PUBLIC_PARTICLE_PROJECT_ID` | Particle Network project ID |
| `NEXT_PUBLIC_PARTICLE_CLIENT_KEY` | Particle Network client key |
| `NEXT_PUBLIC_PARTICLE_APP_ID` | Particle Network app ID |
| `GITHUB_TOKEN` | GitHub PAT for API reads (optional) |
| `OPENGRANT_ESCROW_ADDRESS` | Deployed escrow contract address (optional) |
| `ESCROW_SIGNER_PRIVATE_KEY` | Backend key for claim authorization signing (optional) |

See `.env.example` for all available options.

## Smart Contracts

Contracts are built with Foundry and support 9 EVM chains (5 mainnets + 4 testnets):

- **OpenGrantRegistry**: UUPS upgradeable registry for APIs and endpoints
- **OpenGrantPayments**: Payment routing and settlement with fee oracle
- **OpenGrantEscrow**: Trustless USDC escrow for open source funding (donate, claim, refund, redistribute)
- **PublisherVault**: ERC-4626 vault with PaymentSplitter for revenue distribution
- **OpenGrantFactory**: Factory for deploying publisher vaults
- **GRANTToken**: Platform governance token (fixed supply)
- **GRANTStaking**: Staking contract for fee discounts

### Supported Chains

| Chain | Chain ID | Type |
|-------|----------|------|
| Ethereum | 1 | Mainnet |
| Base | 8453 | Mainnet |
| Arbitrum One | 42161 | Mainnet |
| Linea | 59144 | Mainnet |
| Polygon PoS | 137 | Mainnet |
| Base Sepolia | 84532 | Testnet |
| Arbitrum Sepolia | 421614 | Testnet |
| Linea Sepolia | 59141 | Testnet |
| Polygon Amoy | 80002 | Testnet |

## Testing

```bash
# All JS/TS tests (281 tests: 233 API + 48 SDK)
pnpm turbo test

# Solidity tests (232 tests)
cd packages/contracts && forge test -vvv

# Total: 513 tests
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- Website: [opengrant.dev](https://opengrant.dev)
- Documentation: [docs.opengrant.dev](https://docs.opengrant.dev)
- GitHub: [github.com/qvkare/opengrant](https://github.com/qvkare/opengrant)
