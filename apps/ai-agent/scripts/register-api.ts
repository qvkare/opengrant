/**
 * Registers as publisher and creates the code-scanner API.
 * Run: pnpm --filter @opengrant/ai-agent tsx scripts/register-api.ts
 */
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const API_URL = process.env.OPENGRANT_API_URL || "http://localhost:3001";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Wallet:", account.address);

  // Login as publisher
  const timestamp = Date.now();
  const message = `OpenGrant Login\nTimestamp: ${timestamp}`;
  const signature = await account.signMessage({ message });

  console.log("Logging in as publisher...");
  const loginRes = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, message, type: "publisher" }),
  });
  const loginData = (await loginRes.json()) as { token?: string; userId?: string; error?: string };

  if (!loginData.token) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  console.log("Publisher login OK, userId:", loginData.userId);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginData.token}`,
  };

  // Create the code-scanner API
  console.log("Creating code-scanner API...");
  const apiRes = await fetch(`${API_URL}/v1/publisher/apis`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Code Scanner",
      slug: "code-scanner",
      description: "Static code analysis and best practice suggestions for multiple languages",
      baseUrl: "http://host.docker.internal:4000",
      category: "developer-tools",
      tags: ["code-analysis", "linting", "best-practices"],
    }),
  });
  const apiData = (await apiRes.json()) as { id?: string; slug?: string; error?: string };
  console.log("API response:", JSON.stringify(apiData));

  if (!apiData.id) {
    // Maybe already exists, try to list
    const listRes = await fetch(`${API_URL}/v1/publisher/apis`, { headers });
    const listData = (await listRes.json()) as { apis?: Array<{ id: string; slug: string; status: string }> };
    console.log("Existing APIs:", JSON.stringify(listData));

    const existing = listData.apis?.find((a) => a.slug === "code-scanner");
    if (existing) {
      console.log("code-scanner already exists, id:", existing.id);
      // Activate if needed
      if (existing.status !== "active") {
        await fetch(`${API_URL}/v1/publisher/apis/${existing.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status: "active" }),
        });
        console.log("Activated code-scanner API");
      }
    }
    return;
  }

  console.log("\ncode-scanner API created!");
  console.log("  ID:", apiData.id);
  console.log("  Slug:", apiData.slug);

  // Create endpoints
  console.log("\nCreating endpoints...");

  const endpoints = [
    { path: "/v1/analyze-code", method: "POST", description: "Analyze code for issues", pricePerCall: "0.001" },
    { path: "/v1/suggestions", method: "GET", description: "Get best practice suggestions", pricePerCall: "0.0005" },
  ];

  for (const ep of endpoints) {
    const epRes = await fetch(`${API_URL}/v1/apis/${apiData.id}/endpoints`, {
      method: "POST",
      headers,
      body: JSON.stringify(ep),
    });
    const epData = await epRes.json();
    console.log(`  ${ep.method} ${ep.path}:`, JSON.stringify(epData));
  }

  // Activate the API
  console.log("\nActivating API...");
  await fetch(`${API_URL}/v1/publisher/apis/${apiData.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status: "active" }),
  });

  console.log("Done! code-scanner is live.");
}

main().catch(console.error);
