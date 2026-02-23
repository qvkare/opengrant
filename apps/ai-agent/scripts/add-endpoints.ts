import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const API_URL = process.env.OPENGRANT_API_URL || "http://localhost:3001";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const API_ID = "82218e09-3931-429b-8a4b-d5e62468a1a5";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const timestamp = Date.now();
  const message = `OpenGrant Login\nTimestamp: ${timestamp}`;
  const signature = await account.signMessage({ message });

  const loginRes = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, message, type: "publisher" }),
  });
  const { token } = (await loginRes.json()) as { token: string };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  for (const ep of [
    { path: "/v1/analyze-code", method: "POST", description: "Analyze code for issues", pricePerCall: 1000 },
    { path: "/v1/suggestions", method: "GET", description: "Get best practice suggestions", pricePerCall: 500 },
  ]) {
    const res = await fetch(`${API_URL}/v1/apis/${API_ID}/endpoints`, {
      method: "POST",
      headers,
      body: JSON.stringify(ep),
    });
    const data = await res.json();
    console.log(`${ep.method} ${ep.path}:`, JSON.stringify(data).slice(0, 150));
  }

  // Activate
  const actRes = await fetch(`${API_URL}/v1/publisher/apis/${API_ID}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status: "active" }),
  });
  console.log("Activate:", (await actRes.json() as { status?: string }).status || "done");
}

main().catch(console.error);
