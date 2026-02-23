/**
 * Setup script for the AI Agent demo
 *
 * Checks prerequisites and guides the user through configuration.
 *
 * Usage: pnpm --filter @opengrant/ai-agent setup
 */

import "dotenv/config";

const REQUIRED_VARS = [
  { name: "OPENGRANT_API_KEY", hint: "Get from publisher dashboard or CLI: opengrant keys create" },
  { name: "PRIVATE_KEY", hint: "Wallet private key (0x...) with USDC for x402 payments" },
  { name: "ANTHROPIC_API_KEY", hint: "Get from console.anthropic.com" },
];

async function main() {
  console.log("\n  OpenGrant AI Agent — Setup\n");

  // Check environment variables
  let allPresent = true;
  for (const v of REQUIRED_VARS) {
    const value = process.env[v.name];
    if (value) {
      console.log(`  ✓ ${v.name} is set`);
    } else {
      console.log(`  ✗ ${v.name} is missing`);
      console.log(`    → ${v.hint}`);
      allPresent = false;
    }
  }

  console.log();

  // Check demo API health
  const demoApiUrl = "http://localhost:4000";
  console.log(`  Checking demo API at ${demoApiUrl}...`);
  try {
    const res = await fetch(`${demoApiUrl}/health`);
    if (res.ok) {
      const data = (await res.json()) as {
        service?: string;
        version?: string;
      };
      console.log(`  ✓ Demo API is running (${data.service} v${data.version})`);
    } else {
      console.log(`  ✗ Demo API returned status ${res.status}`);
      console.log(`    → Start it with: pnpm --filter @opengrant/ai-agent demo-api`);
    }
  } catch {
    console.log("  ✗ Demo API is not running");
    console.log("    → Start it with: pnpm --filter @opengrant/ai-agent demo-api");
  }

  console.log();

  if (!allPresent) {
    console.log("  Steps to complete setup:\n");
    console.log("  1. Copy .env.example to .env:");
    console.log("     cp apps/ai-agent/.env.example apps/ai-agent/.env\n");
    console.log("  2. Fill in the missing variables\n");
    console.log("  3. Start the main API server:");
    console.log("     pnpm --filter api dev\n");
    console.log("  4. Register as publisher and create an API (slug: code-scanner)");
    console.log("     via the web UI or CLI\n");
    console.log("  5. Start the demo API:");
    console.log("     pnpm --filter @opengrant/ai-agent demo-api\n");
    console.log("  6. Fund your wallet with testnet USDC\n");
    console.log("  7. Run the agent:");
    console.log('     pnpm --filter @opengrant/ai-agent dev "Your task here"\n');
  } else {
    console.log("  All prerequisites met! Run the agent:");
    console.log('  pnpm --filter @opengrant/ai-agent dev "Analyze code quality"\n');
  }
}

main().catch(console.error);
