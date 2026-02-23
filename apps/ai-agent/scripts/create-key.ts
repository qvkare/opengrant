/**
 * Creates a consumer account and API key via wallet signature login.
 * Run: pnpm --filter @opengrant/ai-agent tsx scripts/create-key.ts
 */
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const API_URL = process.env.OPENGRANT_API_URL || "http://localhost:3001";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set in .env");
  process.exit(1);
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Wallet:", account.address);

  // Sign login message
  const timestamp = Date.now();
  const message = `OpenGrant Login\nTimestamp: ${timestamp}`;
  const signature = await account.signMessage({ message });

  // Login as consumer
  console.log("Logging in as consumer...");
  const loginRes = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, message, type: "consumer" }),
  });
  const loginData = (await loginRes.json()) as { token?: string; userId?: string; error?: string };

  if (!loginData.token) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  console.log("Login OK, userId:", loginData.userId);

  // Create API key
  console.log("Creating API key...");
  const keyRes = await fetch(`${API_URL}/v1/consumer/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loginData.token}`,
    },
    body: JSON.stringify({ name: "ai-agent" }),
  });
  const keyData = (await keyRes.json()) as { key?: string; id?: string; error?: string };

  if (!keyData.key) {
    console.error("Key creation failed:", keyData);
    process.exit(1);
  }

  console.log("\n===========================");
  console.log("OPENGRANT_API_KEY=" + keyData.key);
  console.log("===========================\n");
  console.log("Copy the key above into apps/ai-agent/.env");
}

main().catch(console.error);
