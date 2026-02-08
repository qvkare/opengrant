# OpenGrant

Crypto-native API marketplace for open-source monetization using x402 micropayments and Chainlink CRE.

## Overview

OpenGrant enables open-source projects to monetize their APIs through HTTP-native micropayments. Built on Base L2 with USDC, it provides instant, low-cost payments with 2-second finality.

### Key Features

- **x402 Protocol**: HTTP-native micropayments via the 402 Payment Required status code
- **Chainlink CRE**: Decentralized workflow orchestration for payment verification and settlements
- **Base L2**: ~$0.001 transaction costs, 2-second finality
- **USDC Payments**: Stable, predictable pricing for API consumers
- **Particle Network ConnectKit**: Seamless wallet abstraction with email/social login support
- **Publisher Vaults**: ERC-4626 + PaymentSplitter for revenue distribution

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenGrant Platform                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │   Web    │  │   CLI    │  │   SDK    │  │       API        │ │
│  │  (Next)  │  │(Node.js) │  │   (TS)   │  │    (Express)     │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
│       └─────────────┴─────────────┴──────────────────┘           │
│                              │                                    │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                    x402 Payment Layer                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │   │
│  │  │  Facilitator │  │  Verifier   │  │  EIP-3009 Sigs  │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                    Chainlink CRE                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │   │
│  │  │   Payment   │  │   Usage     │  │     Health      │    │   │
│  │  │ Verification│  │ Aggregation │  │   Monitoring    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                   Smart Contracts (Base)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │   │
│  │  │  Registry   │  │  Payments   │  │ Publisher Vault │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
opengrant/
├── apps/
│   ├── api/          # Express API server
│   ├── web/          # Next.js 16 web application
│   └── cli/          # Command-line interface
├── packages/
│   ├── database/     # Drizzle ORM schema & migrations
│   ├── sdk/          # TypeScript SDK for consumers
│   ├── contracts/    # Solidity smart contracts (Foundry)
│   └── cre-workflows/# Chainlink CRE workflow definitions
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/opengrant/opengrant.git
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
```

## How It Works

### Payment Flow

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT token signing |
| `CHAIN_ID` | Blockchain chain ID (8453 for Base) |
| `RPC_URL` | Ethereum RPC URL |
| `PLATFORM_WALLET` | Platform fee recipient address |
| `NEXT_PUBLIC_PARTICLE_PROJECT_ID` | Particle Network project ID |

See `.env.example` for all available options.

## Smart Contracts

Contracts are built with Foundry and deployed on Base:

- **OpenGrantRegistry**: UUPS upgradeable registry for APIs and endpoints
- **OpenGrantPayments**: Payment routing and settlement
- **PublisherVault**: ERC-4626 vault with PaymentSplitter for revenue distribution
- **OpenGrantFactory**: Factory for deploying publisher vaults

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- Website: [opengrant.dev](https://opengrant.dev)
- Documentation: [docs.opengrant.dev](https://docs.opengrant.dev)
- GitHub: [github.com/opengrant](https://github.com/opengrant)
