import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const API_URL = process.env.OPENGRANT_API_URL || "http://localhost:3001";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const API_ID = "82218e09-3931-429b-8a4b-d5e62468a1a5";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Wallet:", account.address);

  const timestamp = Date.now();
  const message = `OpenGrant Login\nTimestamp: ${timestamp}`;
  const signature = await account.signMessage({ message });

  const loginRes = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, message, type: "publisher" }),
  });
  const loginData = (await loginRes.json()) as { token?: string; error?: string };
  if (!loginData.token) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  console.log("Login OK");

  const res = await fetch(`${API_URL}/v1/publisher/apis/${API_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loginData.token}`,
    },
    body: JSON.stringify({ baseUrl: "http://host.docker.internal:4000" }),
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Result:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
