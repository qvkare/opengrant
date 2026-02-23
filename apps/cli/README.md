# @opengrant/cli

The official CLI for [OpenGrant](https://opengrant.dev) — manage API monetization, USDC payments, and OSS funding directly from your terminal.

## Installation

```bash
npm install -g @opengrant/cli
# or
pnpm add -g @opengrant/cli
```

**Requirements:** Node.js >= 18

## Quick Start

```bash
# Log in to your OpenGrant account
opengrant login

# Check your USDC balance
opengrant balance

# View usage statistics
opengrant stats
```

## Commands

### Authentication

```bash
opengrant login              # Browser-based login (opens wallet popup)
opengrant login --headless   # Terminal-only login (private key)
opengrant logout             # Log out
opengrant whoami             # Show current wallet address
```

### API Keys

```bash
opengrant keys create --name "my-app"   # Create a new API key
opengrant keys list                      # List all API keys
opengrant keys revoke <keyId>            # Revoke an API key
```

### Wallet

```bash
opengrant balance            # Check USDC balance
opengrant fund 50            # Fund wallet with $50 via browser onramp
opengrant fund 50 --headless # Fund via direct USDC transfer
```

### Usage & Stats

```bash
opengrant stats                          # View 30-day usage summary
opengrant stats --period 7d              # Last 7 days
opengrant stats --api <slug>             # Stats for a specific API
```

### OSS Donations

```bash
# Donate 10 USDC to a GitHub repo
opengrant donate facebook/react 10

# Donate with auto-redistribution if unclaimed after 1 year
opengrant donate vercel/next.js 5 --redistribute

# Claim funds for repos you own
opengrant claim --github-token ghp_xxx
```

### Publisher Commands

Register and manage your APIs on OpenGrant:

```bash
# Verify your GitHub identity
opengrant publish verify-github --token ghp_xxx

# Register a new API
opengrant publish create-api \
  --name "My AI API" \
  --slug "my-ai-api" \
  --url "https://api.example.com" \
  --description "AI-powered API" \
  --github-repo owner/repo

# Activate an API (make it public)
opengrant publish activate <slug>
```

### Project Config

```bash
opengrant init                         # Initialize OpenGrant in current project
opengrant config list                  # Show all config values
opengrant config get apiKey            # Get a specific value
opengrant config set tipPercentage 5   # Donate 5% of payments to linked OSS
```

## Project Config File

`opengrant init` creates `.opengrantrc.json` in your project root:

```json
{
  "apiKey": "og_live_xxx",
  "baseUrl": "https://api.opengrant.dev",
  "chainId": 84532,
  "tipPercentage": 5
}
```

`tipPercentage` automatically donates a percentage of every paid API call to the linked open source project.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENGRANT_API_KEY` | API key (overrides config file) |
| `OPENGRANT_PRIVATE_KEY` | Wallet private key for signing |
| `OPENGRANT_API_URL` | API base URL (default: `https://api.opengrant.dev`) |
| `GITHUB_TOKEN` | GitHub PAT for repo verification and claiming |

## License

MIT — see [LICENSE](../../LICENSE)
