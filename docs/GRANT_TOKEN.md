# GRANT Token

**The Native Utility Token of OpenGrant Protocol**

*Crypto-Native API Marketplace on Base L2*

---

## Executive Summary

OpenGrant is a decentralized API marketplace built on Base (Ethereum L2) that enables publishers to monetize their APIs with per-call USDC payments via the x402 protocol. GRANT is the native utility token that aligns incentives between API publishers, consumers, and the platform through staking rewards, fee discounts, and governance rights.

**Key Metrics:**

| Parameter | Value |
|-----------|-------|
| Token Name | GRANT |
| Network | Base (Ethereum L2) |
| Standard | ERC-20 |
| Total Supply | 1,000,000,000 (fixed, no inflation) |
| Initial Circulating | ~75,000,000 (7.5%) |
| Payment Currency | USDC (stablecoin) |
| Settlement | On-chain, per API call |

---

## The Problem

The $300B+ API economy runs on outdated infrastructure:

- **Subscription Lock-in:** Developers pay monthly fees for APIs they barely use. 73% of API subscriptions are underutilized.
- **Payment Friction:** Cross-border API payments involve wire transfers, invoicing delays, and currency conversion fees.
- **No Revenue Sharing:** API platforms capture 100% of listing fees. Publishers have no ownership stake in the marketplace they build.
- **Opaque Pricing:** Enterprise API pricing is hidden behind "Contact Sales" walls. No price discovery mechanism exists.

## The Solution

OpenGrant introduces a **pay-per-call API marketplace** where:

1. **Consumers** pay only for what they use, settled in USDC per API call
2. **Publishers** receive instant revenue distribution through on-chain vaults
3. **GRANT holders** earn a share of platform revenue and govern protocol parameters
4. **x402 Protocol** enables HTTP-native micropayments (payment headers in API requests)

---

## Protocol Architecture

```
Consumer                    OpenGrant Gateway                    Publisher
   │                              │                                │
   │  API Request + x402 Payment  │                                │
   │─────────────────────────────▶│                                │
   │                              │  Verify payment on-chain       │
   │                              │──────────────────────┐         │
   │                              │◀─────────────────────┘         │
   │                              │                                │
   │                              │  Forward request               │
   │                              │───────────────────────────────▶│
   │                              │◀───────────────────────────────│
   │           Response           │                                │
   │◀─────────────────────────────│                                │
   │                              │                                │
   │                              │  Distribute revenue            │
   │                              │───────▶ PublisherVault ────▶ Payees
   │                              │───────▶ StakingRewards ───▶ GRANT Stakers
   │                              │───────▶ Platform Treasury
```

### Smart Contract Stack

| Contract | Purpose | Status |
|----------|---------|--------|
| `OpenGrantRegistry` | Publisher & API registration (UUPS upgradeable) | Deployed |
| `OpenGrantPayments` | Payment recording & vault distribution | Deployed |
| `PublisherVault` | ERC-4626 revenue splitting per publisher | Deployed |
| `OpenGrantFactory` | Vault deployment factory | Deployed |
| `GRANTToken` | ERC-20 utility token | Planned |
| `GRANTStaking` | Staking, rewards & tier management | Planned |
| `TokenVesting` | Investor & team vesting schedules | Planned |

All existing contracts have undergone **3 rounds of security review** with 20+ critical/high findings resolved.

---

## Token Utility

GRANT is not a speculative asset. It serves four concrete functions within the protocol:

### 1. Fee Discounts (Consumer Utility)

API consumers who stake GRANT receive reduced platform commissions:

| Tier | GRANT Staked | Commission | Discount |
|------|-------------|------------|----------|
| Standard | 0 | 5.00% | — |
| Silver | 10,000 | 3.50% | 30% |
| Gold | 50,000 | 2.50% | 50% |
| Platinum | 250,000 | 1.50% | 70% |
| Diamond | 1,000,000 | 0.50% | 90% |

**Example:** A consumer spending $100,000/month on API calls saves $4,500/month at Diamond tier vs. Standard. The breakeven on a Diamond-tier stake occurs within months of moderate usage.

### 2. Revenue Sharing (Staker Yield)

30% of all platform commission revenue is distributed to GRANT stakers in USDC:

```
Platform Commission (5% default)
    │
    ├── 70% → Platform Treasury (operations, development)
    └── 30% → Staking Reward Pool (USDC, distributed pro-rata)
```

Stakers earn **real yield in USDC**, not inflationary token emissions. This creates sustainable, revenue-backed returns that scale with platform adoption.

### 3. Publisher Benefits

Publishers who stake GRANT receive marketplace advantages:

| Benefit | Requirement |
|---------|-------------|
| Verified Publisher badge | 10,000 GRANT staked |
| Featured listing placement | 50,000 GRANT staked |
| Priority support & SLA | 100,000 GRANT staked |
| Early access to new features | 25,000 GRANT staked |

### 4. Governance

GRANT holders vote on protocol parameters:

- Platform commission rate (0.5% – 10% range)
- Staking reward split percentage
- Treasury fund allocation
- New feature prioritization
- Publisher listing standards

Governance weight scales with lock duration (see Staking Mechanism below).

---

## Tokenomics

### Distribution

```
                        GRANT Token Distribution
                        Total: 1,000,000,000

    ┌─────────────────────────────────────────────────────────┐
    │  Staking & Ecosystem Rewards     350,000,000    35.0%   │
    │  ████████████████████████████████████                    │
    │                                                         │
    │  Treasury / DAO                  200,000,000    20.0%   │
    │  ████████████████████████                               │
    │                                                         │
    │  Team & Advisors                 120,000,000    12.0%   │
    │  ██████████████                                         │
    │                                                         │
    │  Seed Round                       80,000,000     8.0%   │
    │  █████████                                              │
    │                                                         │
    │  Strategic Round                  70,000,000     7.0%   │
    │  ████████                                               │
    │                                                         │
    │  Public Sale                      50,000,000     5.0%   │
    │  ██████                                                 │
    │                                                         │
    │  Liquidity Provision              50,000,000     5.0%   │
    │  ██████                                                 │
    │                                                         │
    │  Publisher Incentives             40,000,000     4.0%   │
    │  █████                                                  │
    │                                                         │
    │  Community & Grants               40,000,000     4.0%   │
    │  █████                                                  │
    └─────────────────────────────────────────────────────────┘
```

### Vesting Schedule

| Allocation | TGE Unlock | Cliff | Vesting | Total Duration |
|------------|-----------|-------|---------|----------------|
| Staking Rewards | 0% | None | 4 years (declining curve) | 48 months |
| Treasury / DAO | 0% | 6 months | 3 years linear | 42 months |
| Team & Advisors | 0% | 12 months | 3 years linear | 48 months |
| Seed Round | 0% | 6 months | 2 years linear | 30 months |
| Strategic Round | 5% | 3 months | 18 months linear | 21 months |
| Public Sale | 25% | None | 6 months linear | 6 months |
| Liquidity | 100% | None | None | Immediate |
| Publisher Incentives | 0% | None | Milestone-based | 24 months |
| Community & Grants | 5% | None | Ongoing | 36 months |

### Emission Schedule (Staking Rewards)

350,000,000 GRANT distributed over 4 years with front-loaded curve to incentivize early adoption:

| Year | Emission | % of Rewards | Cumulative |
|------|----------|-------------|------------|
| Year 1 | 120,000,000 | 34.3% | 34.3% |
| Year 2 | 95,000,000 | 27.1% | 61.4% |
| Year 3 | 75,000,000 | 21.4% | 82.9% |
| Year 4 | 60,000,000 | 17.1% | 100.0% |

After Year 4, staking rewards come exclusively from platform revenue share (USDC). No new GRANT tokens are ever minted.

### Circulating Supply Projection

| Month | Event | New Circulating | Total Circulating | % of Supply |
|-------|-------|----------------|-------------------|-------------|
| 0 (TGE) | Public Sale (25%), Liquidity, Community | ~75M | 75,000,000 | 7.5% |
| 3 | Strategic unlock begins | +3.5M/mo | ~85,500,000 | 8.6% |
| 6 | Seed cliff ends, Treasury cliff ends | +5M/mo | ~115,000,000 | 11.5% |
| 12 | Team cliff ends | +3.3M/mo | ~175,000,000 | 17.5% |
| 24 | Seed fully vested | — | ~310,000,000 | 31.0% |
| 36 | Team continues, rewards continue | — | ~480,000,000 | 48.0% |
| 48 | All vesting complete | — | ~650,000,000 | 65.0% |

*Remaining 35% = Treasury (governed by DAO) + unclaimed rewards*

---

## Staking Mechanism

### Design Reference

The staking contract is based on the **Synthetix StakingRewards** pattern — the most battle-tested and widely audited staking mechanism in DeFi, used by Aave, Curve, Lido, and 100+ protocols.

### How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                      GRANT Staking                           │
│                                                              │
│   User stakes GRANT ──────▶ Earns USDC (revenue share)      │
│                    ──────▶ Earns GRANT (emission rewards)    │
│                    ──────▶ Gets fee discount tier             │
│                    ──────▶ Gets governance weight             │
│                                                              │
│   Unstake: 7-day cooldown period                             │
│   No lock-in: withdraw anytime after cooldown                │
│   Rewards: claim anytime, no auto-compound                   │
└──────────────────────────────────────────────────────────────┘
```

### Dual Rewards

Stakers earn two types of rewards simultaneously:

1. **USDC Revenue Share** — 30% of platform commissions, distributed proportionally to stake
2. **GRANT Emissions** — Declining schedule over 4 years, distributed per second

### Governance Weight Multiplier

Voluntary lock-up increases governance voting power (not staking rewards):

| Lock Period | Governance Multiplier |
|-------------|----------------------|
| No lock (7-day cooldown only) | 1.0x |
| 3 months | 1.5x |
| 6 months | 2.0x |
| 12 months | 3.0x |

---

## Revenue Model

### Platform Revenue Sources

| Source | Description | Status |
|--------|-------------|--------|
| **API Commission** | 0.5% – 5.0% per API call (tier-dependent) | Live |
| **Premium Listings** | Featured placement for publishers | Planned |
| **Enterprise Gateway** | Dedicated infrastructure + SLA | Planned |
| **Analytics Dashboard** | Usage insights for publishers | Planned |

### Revenue Flow

```
API Call Payment (USDC)
    │
    ├── 95-99.5% ──▶ Publisher Vault ──▶ Publisher Payees
    │
    └── 0.5-5.0% ──▶ Platform Commission
                         │
                         ├── 70% ──▶ Platform Treasury
                         │              │
                         │              ├── Operations & Development
                         │              ├── Security Audits
                         │              └── Marketing & Growth
                         │
                         └── 30% ──▶ Staking Reward Pool
                                        │
                                        └── USDC to GRANT Stakers
```

### Revenue Projections

| Scenario | Monthly API Volume | Avg Commission | Monthly Revenue | Annual Revenue |
|----------|-------------------|----------------|-----------------|----------------|
| Conservative | $500,000 | 3.5% | $17,500 | $210,000 |
| Base Case | $5,000,000 | 3.0% | $150,000 | $1,800,000 |
| Bull Case | $50,000,000 | 2.5% | $1,250,000 | $15,000,000 |

### Staker Yield (Base Case Scenario)

| Metric | Value |
|--------|-------|
| Monthly platform revenue | $150,000 |
| Staker share (30%) | $45,000 / month in USDC |
| Assumed total staked | 200,000,000 GRANT |
| USDC yield per 1M GRANT staked | $225 / month |
| + GRANT emission rewards | Variable (market-priced) |

---

## Security

### Audit History

| Round | Scope | Findings | Critical Fixed |
|-------|-------|----------|---------------|
| Round 1 | Full codebase review | 121 findings | 20 critical/high |
| Round 2 | Adversarial review | 12 findings | 6 critical/high |
| Round 3 | Black-hat review | 8 findings | 4 critical/medium |

### Key Security Properties

- **No mint function:** Total supply is fixed at 1B. No address can create new tokens.
- **USDC protection:** Emergency withdraw cannot extract USDC from the payments contract.
- **Reentrancy guards:** All payment and release functions are protected.
- **Accounting integrity:** Payment splitter resets on payee changes to prevent fund theft.
- **Publisher sovereignty:** Platform owner cannot access funds inside publisher vaults.

### Contract References

| Component | Reference Implementation | Audited By |
|-----------|------------------------|------------|
| ERC-20 Token | OpenZeppelin ERC20 + Permit + Votes | OpenZeppelin |
| Staking | Synthetix StakingRewards | Iosiro, Sigma Prime |
| Vesting | OpenZeppelin VestingWallet | OpenZeppelin |
| Vault | OpenZeppelin ERC-4626 | OpenZeppelin |

---

## Roadmap

### Phase 1 — Foundation (Completed)

- [x] Core smart contracts (Registry, Payments, Vaults, Factory)
- [x] API gateway with x402 payment verification
- [x] Web application (Next.js 16) with wallet authentication
- [x] SDK for API consumers
- [x] CLI for publishers
- [x] 276 automated tests across all packages
- [x] 3 rounds of security review

### Phase 2 — Token Launch

- [ ] GRANT token deployment on Base
- [ ] Staking contract deployment
- [ ] Vesting contracts for investors & team
- [ ] DEX liquidity pool (Aerodrome/Uniswap on Base)
- [ ] Fee discount oracle integration
- [ ] Token claim portal

### Phase 3 — Growth

- [ ] Publisher onboarding program (40M GRANT incentives)
- [ ] Enterprise API gateway
- [ ] Cross-chain expansion (Arbitrum, Optimism)
- [ ] Analytics dashboard for publishers
- [ ] Governance portal (on-chain voting)

### Phase 4 — Maturity

- [ ] DAO transition (treasury managed by governance)
- [ ] Advanced staking (veGRANT model consideration)
- [ ] Fiat on-ramp for API consumers
- [ ] Mobile SDK
- [ ] AI-powered API discovery & recommendation

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Base (Ethereum L2) |
| Smart Contracts | Solidity 0.8.24, Foundry |
| Backend | Express 5, TypeScript |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Auth | Wallet-based (Particle Network ConnectKit) |
| Payments | USDC via x402 protocol |
| ORM | Drizzle ORM |
| Testing | Vitest 4 + Foundry |
| CI/CD | GitHub Actions, Docker |

---

## Team

*[Team information to be added]*

---

## Legal Disclaimer

This document is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any tokens or securities. GRANT tokens are utility tokens designed for use within the OpenGrant protocol. Token holders should not expect profits derived from the efforts of others. The purchase of GRANT tokens involves significant risk, including the potential loss of the entire purchase amount. Prospective purchasers should conduct their own due diligence and consult with legal and financial advisors before making any purchase decisions. The regulatory status of cryptographic tokens and digital assets is evolving and varies by jurisdiction. Certain activities involving GRANT tokens may be restricted or prohibited in certain jurisdictions. The projections and estimates contained herein are forward-looking statements based on assumptions that may not materialize.

---

*OpenGrant Protocol — Decentralizing the API Economy*

*Document Version: 1.0 | February 2026*
