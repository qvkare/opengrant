/**
 * Quick x402 payment flow test.
 * Tests: SDK → proxy → 402 → sign → retry → 200 (or error)
 */
import "dotenv/config";
import { OpenGrant } from "@opengrant/sdk";

const client = new OpenGrant({
  apiKey: process.env.OPENGRANT_API_KEY!,
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  chainId: parseInt(process.env.CHAIN_ID || "84532"),
  baseUrl: process.env.OPENGRANT_API_URL || "http://localhost:3001",
  debug: true,
  autoRetry: false,
});

async function main() {
  console.log("=== x402 Payment Flow Test ===\n");
  console.log("Wallet:", client.address);

  // Step 1: Check balance
  console.log("\n--- Balance Check ---");
  const balance = await client.getBalance();
  console.log("USDC:", balance.usdcFormatted, "USDC");
  console.log("ETH:", balance.eth);

  // Step 2: Test GET endpoint (pricePerCall: 3)
  console.log("\n--- GET /v1/suggestions (price: 3 units) ---");
  try {
    const res = await client.get("code-scanner", "/v1/suggestions", {
      params: { language: "typescript" },
    });
    console.log("Status:", res.status);
    console.log("Payment:", res.payment);
    console.log("Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("FAILED:", err.message);
    if (err.code) console.error("Code:", err.code);
  }

  // Step 3: Test POST endpoint (pricePerCall: 5)
  console.log("\n--- POST /v1/analyze-code (price: 5 units) ---");
  try {
    const res = await client.post("code-scanner", "/v1/analyze-code", {
      code: 'const x: any = "hello";',
      language: "typescript",
    });
    console.log("Status:", res.status);
    console.log("Payment:", res.payment);
    console.log("Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("FAILED:", err.message);
    if (err.code) console.error("Code:", err.code);
  }

  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
