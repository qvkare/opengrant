# OpenGrant v2 - Implementation Plan

> Last updated: February 5, 2026

## Project Overview

OpenGrant is a crypto-native API marketplace using x402 micropayments and Chainlink CRE (Chainlink Runtime Environment). Publishers can monetize their APIs with per-call pricing, and consumers pay using USDC on Base L2.

## Architecture

### Tech Stack
- **Monorepo**: Turborepo 2.8.3 with pnpm 9.15 workspaces
- **Database**: PostgreSQL 16 with Drizzle ORM 0.45.1 (node-postgres)
- **API**: Express 5.2.1 with TypeScript 5.9.3
- **Web**: Next.js 16.1.2 with App Router, Particle Network ConnectKit 2.1.3
- **CLI**: Commander.js with TypeScript
- **Blockchain**: Base L2, USDC, EIP-3009 TransferWithAuthorization
- **Smart Contracts**: Solidity 0.8.24, OpenZeppelin 5.x, Foundry
- **Oracles**: Chainlink CRE for payment verification
- **Payments**: x402 Protocol v2 (@x402/evm 2.1.0, @x402/express 2.1.0)

### Package Structure
```
opengrant/
├── apps/
│   ├── api/          # Express 5 API server (17 source files)
│   ├── cli/          # CLI tool (10 source files)
│   └── web/          # Next.js 16 web app (35+ files, 18 routes)
├── packages/
│   ├── contracts/    # Solidity smart contracts (4 contracts + 3 interfaces)
│   ├── cre-workflows/# Chainlink CRE workflows
│   ├── database/     # Drizzle schema (7 tables, 6 enums)
│   └── sdk/          # TypeScript SDK for consumers
├── .github/          # CI/CD (GitHub Actions)
├── Dockerfile        # Multi-stage Docker build
├── docker-compose.yml# Production orchestration
└── docker-compose.dev.yml # Development environment
```

## Dependency Versions (February 2026)

### Core Packages

| Package | Project Version | Latest Stable | Status |
|---------|----------------|---------------|--------|
| `next` | 16.1.2 | 16.1.2 | Current |
| `react` | 19.2.4 | 19.2.4 | Current |
| `express` | 5.2.1 | 5.2.1 | Current |
| `typescript` | 5.9.3 | 5.9.3 | Current |
| `vitest` | 4.0.18 | 4.0.18 | Current |
| `turbo` | 2.8.3 | 2.8.3 | Current |

### Blockchain & Web3

| Package | Project Version | Latest Stable | Status |
|---------|----------------|---------------|--------|
| `viem` | 2.45.1 | 2.45.1 | Current |
| `@particle-network/connectkit` | 2.1.3 | 2.1.3 | Current |
| `@x402/evm` | 2.1.0 | 2.1.0 | Current |
| `@x402/express` | 2.1.0 | 2.1.0 | Current |
| OpenZeppelin Contracts | 5.x (Foundry lib/) | 5.4.0-5.5.0 | `forge update` needed |
| Foundry | System | **v1.4.3** | `foundryup` needed |

### Database & Infra

| Package | Project Version | Latest Stable | Status |
|---------|----------------|---------------|--------|
| `drizzle-orm` | 0.45.1 | 0.45.1 (v1.0.0-beta.2 pre-release) | Current (stable) |
| `drizzle-kit` | 0.31.8 | 0.31.8 | Current |
| `ioredis` | 5.9.2 | 5.9.x | Current |
| `pg` | 8.13.1 | 8.13.x | Current |
| `@tanstack/react-query` | 5.90.19 | 5.90.19 | Current |
| `zod` | 3.24.0 | 3.24.x | Current |
| Tailwind CSS | 4.1.18 | 4.1.x | Current |

### Version Upgrade Notes

**Foundry v1.4.3**: Stable since Feb 2025. Includes 10%+ performance improvements, EIP-7702 support, Etherscan v1 API deprecation. Run `foundryup` to update.

**OpenZeppelin 5.4-5.5**: Safe to update within 5.x (no storage layout breaks). Run `forge update` in packages/contracts.

**Drizzle ORM v1.0**: Pre-release (beta.2). Major breaking changes in relational query builder. Stay on 0.45.x stable for production.

**x402 Protocol v2**: Project already migrated. Headers standardized (`PAYMENT-SIGNATURE`), CAIP-2 network identifiers, accepts array config.

**Chainlink CRE**: Rebranded to "Chainlink Runtime Environment" (Nov 2025). SDK available as `@chainlink/cre-sdk`. Trigger-and-callback model. Confidential Compute coming 2026.

---

## Core Features

### 1. x402 Payment Protocol
- HTTP 402 Payment Required responses
- EIP-3009 TransferWithAuthorization for USDC
- EIP-712 typed data signatures
- Payment verification via Chainlink CRE
- v2 headers: `PAYMENT-SIGNATURE` (input), `PAYMENT-RESPONSE` (output)

### 2. Publisher Features
- Register and manage APIs
- Set per-call pricing in USDC
- View analytics and earnings
- Automatic settlement to wallet via PublisherVault (ERC-4626)

### 3. Consumer Features
- Browse and discover APIs
- Fund wallet with USDC
- Automatic payment signing with SDK
- Usage tracking and history

### 4. Smart Contracts
- **OpenGrantRegistry**: API registration/discovery (UUPS upgradeable)
- **OpenGrantPayments**: Payment processing and distribution
- **PublisherVault**: ERC-4626 vault with PaymentSplitter for revenue distribution
- **OpenGrantFactory**: Vault deployment factory

## Database Schema

### Core Tables (7 tables, 6 enums)
- `publishers` - Publisher accounts (wallet, profile, vault, settings)
- `consumers` - Consumer accounts (wallet, credit balance, settings)
- `apis` - Registered APIs (publisher ref, metadata, stats)
- `endpoints` - API endpoints (pricing, rate limits, schemas)
- `api_keys` - Consumer API keys (permissions, rate limits)
- `usage_records` - Call tracking (payment status, performance)
- `payments` - Payment/settlement history
- `withdrawals` - Publisher withdrawal records

## API Endpoints

### Authentication
- `POST /auth/login` - Web wallet login (message format validated)
- `GET /auth/verify` - Verify JWT token
- `POST /auth/refresh` - Refresh JWT token (24h window)
- `POST /auth/cli/init` - Start CLI auth session
- `POST /auth/cli/complete` - Complete CLI auth
- `GET /auth/cli/poll` - Poll CLI session status
- `POST /auth/cli/verify` - Direct CLI token verification

### Publisher Routes
- `GET /v1/publishers/me` - Get publisher profile
- `POST /v1/publishers/register` - Register as publisher
- `GET /v1/publishers/me/apis` - List publisher's APIs
- `POST /v1/publishers/me/apis` - Register new API
- `PUT /v1/publishers/me/apis/:id` - Update API
- `DELETE /v1/publishers/me/apis/:id` - Soft delete API
- `POST /v1/publishers/me/apis/:apiId/endpoints` - Add endpoint
- `GET /v1/publishers/me/analytics` - Get analytics
- `GET /v1/publishers/me/earnings` - Get earnings

### Consumer Routes
- `GET /v1/consumers/me` - Get consumer profile
- `POST /v1/consumers/register` - Register as consumer
- `GET /v1/consumers/me/api-keys` - List API keys
- `POST /v1/consumers/me/api-keys` - Create API key
- `DELETE /v1/consumers/me/api-keys/:id` - Revoke API key
- `GET /v1/consumers/me/usage` - Get usage stats
- `GET /v1/consumers/me/payments` - Get payment history
- `GET /v1/consumers/me/balance` - Get wallet balance (on-chain + credit)
- `POST /v1/consumers/me/fund` - Add credit to balance

### Public Routes
- `GET /v1/apis` - List all APIs (with search/filter)
- `GET /v1/apis/:slug` - Get API details with endpoints

### Proxy Routes
- `ALL /v1/proxy/:apiSlug/*` - Proxy requests with x402 payment + SSRF protection

### Health Routes
- `GET /health` - Basic health check

---

## Implementation Progress

### Phase 0: Build Fix - COMPLETED
- Fixed SSR issue in providers.tsx (mounted state check)

### Phase 1: Testing & Integration - COMPLETED
- SDK tests: 48 tests (client, signer, errors)
- API unit tests: 45 tests (x402, auth middleware, payment service)
- API integration tests: 52 tests (auth, APIs, consumer routes)
- API E2E tests: 9 tests (payment flow)
- Contract tests: 72 tests (Foundry)
- **Total: 226 tests passing**

### Phase 1.5: Code Completion - COMPLETED
- Added missing DELETE /v1/apis/:id endpoint (soft delete)
- Added missing GET /v1/consumer/payments endpoint
- Connected web app frontend to backend API
- Implemented blockchain balance check in consumer balance endpoint
- Fixed CLI fund command balance polling
- Created API client helper (apps/web/src/lib/api.ts - 16 functions)
- Created API auth hook (apps/web/src/hooks/useApiAuth.ts)
- Bug fixes: authMiddleware invocation, config TDZ, JWTPayload property names

### Phase 1.6: Frontend-Backend Integration - COMPLETED
- Connected all 14 web pages to real backend APIs
- All mock data removed - every page fetches from the backend
- Pages handle API unavailability gracefully (empty states)

### Phase 1.7: Package Update - COMPLETED
- All dependencies updated to latest (February 2026)
- Next.js 15 -> 16, vitest 2 -> 4, Express 4 -> 5, Tailwind 3 -> 4
- Migration fixes: Privy v3 signMessage syntax, Tailwind v4 CSS config, Next.js 16 config changes

### Phase 1.8: Security Code Review - COMPLETED
- 121 findings across 5 packages (3 CRITICAL, 6 HIGH, ~9 MEDIUM per package)
- ~20 critical/high fixes applied:
  - **API**: Removed default JWT secret, message format validation, SSRF protection, atomic credit SQL, trust proxy, 24h refresh window
  - **SDK**: apiKey validation, security header protection, runtime PaymentDetails validation
  - **Web**: Open redirect fix, role-specific token storage
  - **Contracts**: Deploy script args fix, double platform fee removal, zero-address checks
  - **Database**: Foreign keys on usageRecords, missing indexes added

### Phase 2: Smart Contract Deployment - PENDING (needs credentials)
1. Run `foundryup` to update Foundry to v1.4.3
2. Run `forge update` to update OpenZeppelin to 5.5.0
3. Deploy contracts to Base Sepolia testnet (needs `DEPLOYER_PRIVATE_KEY`)
4. Verify contracts on Basescan (needs `BASESCAN_API_KEY`)
5. Test contract interactions
6. Note: Etherscan v1 API deprecated in Foundry v1.4 - update verification config

### Phase 3: CRE Deployment - PENDING (needs credentials)
1. Install `@chainlink/cre-sdk` TypeScript package
2. Refactor workflows to trigger-and-callback model (new CRE standard)
3. Configure Chainlink CRE credentials (DON ID)
4. Deploy workflows to DON
5. Test multi-node verification

### Phase 4: Production Launch - PARTIALLY COMPLETE
- [x] CI/CD pipeline (GitHub Actions: typecheck, test, build, contract tests)
- [x] Dockerfile (multi-stage: API + Web images)
- [x] docker-compose.yml (PostgreSQL 16 + Redis 7 + API + Web)
- [ ] Deploy to production infrastructure
- [ ] Set up monitoring and alerting
- [ ] Create documentation
- [ ] Configure production environment variables

### Phase 5: Auth Provider Migration - COMPLETED
- Evaluated 12 providers (see "Web3 Auth Provider Comparison" section below)
- Decision: Migrated from Privy + wagmi + RainbowKit to Particle Network ConnectKit 2.1.3
- Zero cost, social + external wallet support, Account Abstraction

---

## Web3 Auth Provider Comparison

> **COMPLETED**: Migrated to **Particle Network ConnectKit 2.1.3** (was Privy @privy-io/react-auth 3.8.1)

### Provider Summary (February 2026)

| Provider | Free Tier | Paid Start | Embedded Wallets | Social Login | Open Source | Best For |
|----------|-----------|------------|-----------------|-------------|-------------|----------|
| **Privy** (current) | 500 MAU | $299/mo (2,500) | Yes (TEE) | Yes (19+) | No | Polished UX, progressive onboarding |
| **Better Auth** | Unlimited | Free (self-hosted) | No | Yes (20+ OAuth) | Yes (MIT) | Zero-cost wallet sign-in (SIWE) |
| **Dynamic** | 1,000 MAU | $249/mo (5,000) | Yes (MPC) | Yes | Partial | Multi-chain, polished UI widget |
| **Web3Auth** | 1,000 MAW | $69/mo (3,000) | Yes (MPC) | Yes | Yes | Budget social login + embedded wallets |
| **Thirdweb** | 1,000 MAW | $99/mo | Yes | Yes | Yes | Full-stack web3 platform |
| **Magic** | 1,000 MAW | $99/mo (2,500) | Yes | Yes | Partial | Email-first auth, enterprise |
| **Particle Network** | Unlimited | Free | Yes (AA) | Yes | Partial | Free embedded wallets, chain abstraction |
| **Turnkey** | 100 wallet, 25 tx | $99/mo (2,000) | Yes (TEE) | Yes | Partial | Infra-level key management |
| **Para** (ex-Capsule) | 1,200 MAU | $200/mo (2,500) | Yes (MPC) | Yes | Partial | Cross-app portable wallets |
| **ZeroDev** | 50K testnet | $69/mo | Via integrations | Via integrations | Yes | AA add-on, smart wallets |
| **Openfort** | 1,000 MAU + 500 tx | $99/mo (5,000) | Yes | Yes (any OIDC) | Yes | Open-source infra, no vendor lock-in |
| **Coinbase CDP** | 5,000 ops/mo | $0.005/op | Yes (smart) | Yes | Partial | Pay-as-you-go, Coinbase ecosystem |
| **Stytch** | 10,000 MAU | $0.10/MAU overage | No | Yes | No | Web2-first with web3 add-on |

### Detailed Provider Analysis

#### Privy (Current)
- **Pricing**: Free 500 MAU, $299/mo for 2,500 MAU, enterprise custom
- **Strengths**: Best onboarding UX, 19+ social providers, TEE-secured embedded wallets, MFA, account linking, progressive onboarding
- **Weaknesses**: Most restrictive free tier (500 MAU), steepest price jump ($0 -> $299), proprietary/closed-source
- **Framework**: React, Next.js, Expo, Swift, Unity

#### Better Auth
- **Pricing**: Free forever (MIT, self-hosted)
- **Strengths**: 15K+ GitHub stars, 150K+ weekly downloads, SIWE plugin (ERC-4361), 20+ OAuth providers, plugin architecture, zero cost
- **Weaknesses**: No embedded wallets (users must bring their own wallet), requires self-hosting
- **Web3**: SIWE plugin maps directly to existing viem `verifyMessage` flow, ENS integration, multi-wallet per user
- **Framework**: Framework-agnostic TypeScript (Next.js, Express, Hono, etc.)

#### Dynamic
- **Pricing**: Free 1,000 MAU, $249/mo for 5,000 MAU (Growth), $0.05/extra MAU
- **Strengths**: 2x Privy free tier, broadest chain support (EVM + Solana + Starknet + Algorand + Cosmos + Flow), polished UI, smart wallets on Growth
- **Weaknesses**: Core infrastructure proprietary, Growth tier required for MFA and smart wallets
- **Framework**: React, Next.js, React Native

#### Web3Auth
- **Pricing**: Free 1,000 MAW, $69/mo for 3,000 (cheapest paid tier), $0.045/extra MAW
- **Strengths**: MPC-based non-custodial keys, open-source core, cheapest paid option, Plug and Play SDK + headless Core Kit
- **Weaknesses**: UI customization requires higher tiers, passkeys/AA on Growth+ only
- **Framework**: React, Next.js, Angular, Vue, React Native, Flutter, Unity, Unreal

#### Thirdweb
- **Pricing**: Free 1,000 MAW + $0.02/extra, $99/mo Growth
- **Strengths**: Full platform (auth + contracts + RPC + storage + payments), open source, AI agent infra, SIWE support
- **Weaknesses**: Platform lock-in if using full stack, pricing changed Jan 2026
- **Framework**: React, Next.js, React Native, Unity, .NET

#### Particle Network
- **Pricing**: Completely free for developers (token-centric economy)
- **Strengths**: Zero cost, Universal Accounts (chain abstraction), 17M+ wallets, 900+ integrations, BTC Connect
- **Weaknesses**: Dependency on PARTI token economy, less mature than Privy/Dynamic
- **Framework**: React, Next.js, Unity, Unreal, Flutter, Android, iOS

#### Openfort
- **Pricing**: Free 1,000 MAU + 500 tx, $99/mo for 5,000 MAU (Growth)
- **Strengths**: Open-source OpenSigner (self-hostable), supports any OIDC provider (Better Auth, Firebase, etc.), no vendor lock-in, exportable keys
- **Weaknesses**: Newer/smaller community, gas sponsorship has percentage fee (10% Starter, 5% Pro)
- **Framework**: React, Next.js, Unity, Unreal. EIP-1193 compatible

#### Coinbase CDP Embedded Wallets
- **Pricing**: 5,000 free ops/mo, $0.005/op (no subscription)
- **Strengths**: Simple pay-as-you-go, native smart accounts, USDC rewards (3.85%), Coinbase ecosystem alignment, good fit with x402
- **Weaknesses**: Coinbase ecosystem dependency

#### Stytch
- **Pricing**: Free 10,000 MAU (highest free tier), $0.10/MAU overage
- **Strengths**: Highest free tier by far, full web2 auth (magic links, OTP, biometrics, passkeys), fraud detection
- **Weaknesses**: Web3 is an add-on not the focus, no embedded wallets, less specialized for crypto

### Recommendations for OpenGrant

OpenGrant uses wallet-based auth (`viem verifyMessage`) with JWT tokens. Embedded wallets are not currently required.

1. **Best free/open-source**: **Better Auth + wagmi/RainbowKit**. Replace Privy wallet UI with RainbowKit, use Better Auth SIWE plugin on server. Maps directly to existing `POST /auth/login` flow. Zero cost, self-hosted, no vendor lock-in.

2. **Best drop-in replacement**: **Dynamic**. 2x free MAUs vs Privy, similar API surface, $249/mo (vs $299) with more MAUs included.

3. **Best budget with embedded wallets**: **Web3Auth**. Cheapest paid tier at $69/mo with MPC wallets and open-source core.

4. **Best zero-cost with embedded wallets**: **Particle Network**. Completely free. Trade-off is token economy dependency.

5. **Best open-source infrastructure**: **Openfort + Better Auth**. Better Auth for OIDC auth (free), Openfort for embedded wallets (open-source OpenSigner). Maximum escape from vendor lock-in.

6. **Best x402 ecosystem alignment**: **Coinbase CDP**. Same ecosystem as x402 protocol. Pay-as-you-go model.

---

## Build & Test Status

### Build: 7/7 packages passing
- @opengrant/contracts (Foundry, requires `forge`)
- @opengrant/cre-workflows (tsup)
- @opengrant/database (tsup)
- @opengrant/sdk (tsup, CJS + ESM)
- @opengrant/cli (tsup)
- @opengrant/api (tsup)
- @opengrant/web (Next.js 16 Turbopack)

### Tests: 226 total
- SDK: 48 tests (3 files - client, signer, errors)
- API: 106 tests (7 files - middleware, routes, services, e2e)
- Contracts: 72 tests (3 files - Foundry, requires `forge`)

### Infrastructure
- CI/CD: GitHub Actions (typecheck, test SDK, test API, test contracts, build, lint, security scan)
- Docker: Multi-stage Dockerfile (API port 3001, Web port 3000)
- Docker Compose: PostgreSQL 16, Redis 7, API, Web
- Dev Environment: docker-compose.dev.yml

---

## Key Technical Decisions

1. **node-postgres over Neon**: Using standard `pg` package with connection pooling for better compatibility and control.

2. **Redis for Sessions**: CLI authentication sessions stored in Redis with 5-minute TTL for browser-to-CLI auth flow.

3. **SSR/SSG Handling**: Web app uses `ClientShell` component with `next/dynamic` (ssr: false) to load Particle Network ConnectKit client-only.

4. **Suspense Boundaries**: Pages using `useSearchParams` wrapped in Suspense for Next.js 16 compatibility.

5. **x402 v2 Protocol**: Using standardized PAYMENT-SIGNATURE headers, CAIP-2 network identifiers, accepts array configuration.

6. **Express 5**: Native async error handling, improved route security. No `express-async-errors` needed.

7. **Tailwind CSS v4**: CSS-based config (`@import "tailwindcss"` + `@theme inline`), no `tailwind.config.ts` file.

8. **Particle Network ConnectKit**: Replaced Privy + wagmi + RainbowKit. Zero cost, supports social + external wallets, Account Abstraction via Universal Accounts.

9. **Security hardening**: JWT secret required (no defaults), SSRF protection on proxy, atomic SQL for balance updates, message format validation, 24h token refresh window.

---

## Environment Variables

```env
# Server
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/opengrant

# Redis
REDIS_URL=redis://localhost:6379

# JWT (min 32 characters, no default)
JWT_SECRET=<your-secure-secret-min-32-chars>
JWT_EXPIRES_IN=7d

# Blockchain
BASE_RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# Contracts
OPENGRANT_REGISTRY_ADDRESS=0x...
OPENGRANT_PAYMENTS_ADDRESS=0x...
OPENGRANT_FACTORY_ADDRESS=0x...
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# x402
X402_FACILITATOR_URL=https://x402.org/facilitator
PLATFORM_WALLET=0x...

# Particle Network (Web)
NEXT_PUBLIC_PARTICLE_PROJECT_ID=your-particle-project-id
NEXT_PUBLIC_PARTICLE_CLIENT_KEY=your-particle-client-key
NEXT_PUBLIC_PARTICLE_APP_ID=your-particle-app-id

# API URLs
NEXT_PUBLIC_API_URL=http://localhost:3001

# Contract Deployment (Phase 2)
DEPLOYER_PRIVATE_KEY=0x...
BASESCAN_API_KEY=...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Chainlink CRE (Phase 3)
CRE_DON_ID=...
CRE_CREDENTIALS=...
```
