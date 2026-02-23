# @opengrant/sdk

The official JavaScript/TypeScript SDK for [OpenGrant](https://opengrant.dev) — a platform for monetizing APIs with USDC micropayments using the [x402 protocol](https://x402.org).

## Features

- **Pay-per-call APIs** — Call any registered API and pay only for what you use in USDC
- **Multi-chain** — Base, Arbitrum, Linea, Polygon, World Chain (mainnet & testnet)
- **Auto-retry** — Exponential backoff with configurable retries
- **OSS Donations** — Donate USDC directly to GitHub repos via on-chain escrow
- **Auto-tip** — Automatically tip linked open source projects on every paid API call
- **TypeScript-first** — Full type safety, dual CJS/ESM output

## Installation

```bash
npm install @opengrant/sdk
# or
pnpm add @opengrant/sdk
# or
yarn add @opengrant/sdk
```

**Requirements:** Node.js >= 18 (uses native `fetch`)

## Quick Start

```typescript
import { OpenGrant } from '@opengrant/sdk';

const client = new OpenGrant({
  apiKey: 'og_live_xxx',    // Your OpenGrant API key
  privateKey: '0x...',      // Wallet private key for signing payments
});

// Call a paid API endpoint
const response = await client.call('tailwind-ai', 'POST', '/v1/generate', {
  body: { prompt: 'button primary' },
});

console.log(response.data);
// response.payment → { amount: "1000", txHash: "0x..." }
```

## Configuration

```typescript
const client = new OpenGrant({
  // Required
  apiKey: 'og_live_xxx',

  // Wallet (one of these required for paid calls)
  privateKey: '0x...',        // Private key string
  walletClient: walletClient, // Or a viem WalletClient

  // Optional
  baseUrl: 'https://api.opengrant.dev', // Default
  chainId: 84532,   // Base Sepolia (default). Use 8453 for Base mainnet
  rpcUrl: 'https://...', // Override default RPC for the chain
  timeout: 30000,   // Request timeout ms (default: 30000)
  autoRetry: true,  // Auto-retry on network errors (default: true)
  maxRetries: 3,    // Max retry attempts (default: 3)
  debug: false,     // Log debug info (default: false)

  // Auto-tipping (donate a % of each payment to linked OSS projects)
  tipPercentage: 5, // Tip 5% of each payment to the API's linked GitHub repo
  onTip: (result) => {
    if (result.success) {
      console.log(`Tipped ${result.amount} USDC to ${result.repo}`);
    }
  },
});
```

## API Calls

```typescript
// GET request
const { data } = await client.get('weather-api', '/v1/forecast', {
  params: { city: 'Istanbul' },
});

// POST request
const { data } = await client.post('image-gen', '/v1/generate', {
  prompt: 'a cat wearing a hat',
  size: '1024x1024',
});

// Full call with all options
const response = await client.call('my-api', 'POST', '/v1/endpoint', {
  body: { key: 'value' },
  params: { filter: 'active' },
  headers: { 'X-Custom': 'header' },
  timeout: 60000,   // Override timeout for this request
  maxPrice: 5000n,  // Reject if price > 5000 USDC wei ($0.005)
});
```

## Supported Chains

| Chain | Chain ID | USDC Address |
|-------|----------|-------------|
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Ethereum | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Arbitrum One | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Linea | 59144 | `0xFEce4462d57bD51A6A552365a011b95f0E16d9B7` |
| Polygon PoS | 137 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| World Chain | 480 | `0x79A02482A880bCe3F13E09da970dC34dB4cD24D1` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (default) |

## Wallet Balance

```typescript
const balance = await client.getBalance();
// { usdc: "10000000", usdcFormatted: "10.00", eth: "1000000000000000" }
```

## Usage Statistics

```typescript
const stats = await client.getUsage('30d'); // '7d' | '30d' | '90d'
// { totalCalls: 150, totalSpent: "15000000", byApi: [...], daily: [...] }
```

## OSS Donations

Donate USDC directly to any GitHub repository. Funds are held in an on-chain escrow and released when the repo owner verifies ownership.

```typescript
// Donate to a single repo
const result = await client.donate({
  repoOwner: 'facebook',
  repoName: 'react',
  amount: '10.00',   // USDC (human-readable)
  redistributeOnTimeout: false, // If unclaimed after 1 year, redistribute (default: false)
});
// result → { txHash: '0x...', repoHash: '0x...', amount: '10.00', chainId: 8453 }

// Donate to multiple repos in one transaction
const result = await client.batchDonate({
  donations: [
    { repoOwner: 'facebook', repoName: 'react', amount: '5.00' },
    { repoOwner: 'vercel', repoName: 'next.js', amount: '5.00' },
  ],
});
// result → { txHash: '0x...', repoCount: 2, totalAmount: '10.00', chainId: 8453 }
```

## Claiming Escrow Funds

If you're a repo owner, you can claim accumulated donations:

```typescript
const result = await client.claim({
  repoOwner: 'your-github-username',
  repoName: 'your-repo',
  githubToken: 'ghp_xxx',  // GitHub PAT to prove ownership
});
// result → { txHash: '0x...', repoHash: '0x...', chainId: 8453 }
```

## Repository Funding Info

```typescript
const info = await client.getRepoFundInfo('facebook', 'react');
// { id, owner, name, totalFunded, donorCount, claimStatus, repoHash }
```

## Error Handling

```typescript
import {
  OpenGrantError,
  InsufficientBalanceError,
  PaymentRequiredError,
  UnauthorizedError,
  APINotFoundError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '@opengrant/sdk';

try {
  const response = await client.call('my-api', 'GET', '/v1/data');
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.log('Not enough USDC. Fund your wallet first.');
  } else if (err instanceof UnauthorizedError) {
    console.log('Invalid API key.');
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${err.retryAfter}s`);
  } else if (err instanceof OpenGrantError) {
    console.log(`Error ${err.code}: ${err.message}`);
  }
}
```

## Auto-Tipping OSS

Automatically donate a percentage of every payment to the API's linked GitHub repository:

```typescript
const client = new OpenGrant({
  apiKey: 'og_live_xxx',
  privateKey: '0x...',
  tipPercentage: 10,   // Tip 10% of every paid call
  onTip: ({ success, repo, amount, error }) => {
    if (success) console.log(`Tipped $${amount} to ${repo}`);
    else console.warn(`Tip failed: ${error}`);
  },
});

// Every paid call now automatically donates 10% to the API's linked OSS project
await client.call('react-docs-api', 'GET', '/v1/search');
```

## Multi-Chain Example

```typescript
// Base Sepolia (default — testnet)
const testClient = new OpenGrant({ apiKey, privateKey });

// Base (mainnet)
const baseClient = new OpenGrant({ apiKey, privateKey, chainId: 8453 });

// Arbitrum
const arbClient = new OpenGrant({ apiKey, privateKey, chainId: 42161 });
```

## TypeScript Types

```typescript
import type {
  OpenGrantConfig,
  APIResponse,
  APIInfo,
  UsageStats,
  WalletBalance,
  DonationConfig,
  DonationResult,
  BatchDonationConfig,
  BatchDonationResult,
  ClaimConfig,
  ClaimResult,
  RepoFundInfo,
  Donation,
  TipResult,
  CallOptions,
  PaymentDetails,
} from '@opengrant/sdk';
```

## License

MIT — see [LICENSE](../../LICENSE)
