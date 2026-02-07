/**
 * Payment Verification Workflow
 *
 * This CRE workflow verifies x402 payment signatures using multi-node consensus.
 * It's triggered via HTTP when a payment needs verification.
 *
 * Flow:
 * 1. Receive payment payload from API gateway
 * 2. Decode and validate EIP-712 signature
 * 3. Call x402 facilitator for on-chain verification
 * 4. Return consensus result to API gateway
 */

import type {
  VerifyPaymentInput,
  VerifyPaymentOutput,
  X402PaymentPayload,
  X402PaymentRequirement,
  X402VerifyResponse,
} from "../types";

// Configuration
const X402_FACILITATOR_URL = "https://x402.org/facilitator";
const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NETWORK = "eip155:8453"; // Base mainnet

/**
 * Decode base64 payment payload
 */
function decodePaymentPayload(encoded: string): X402PaymentPayload | null {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(decoded) as X402PaymentPayload;
  } catch {
    return null;
  }
}

/**
 * Validate EIP-712 signature structure
 */
function validateSignatureStructure(payload: X402PaymentPayload): boolean {
  if (payload.x402Version !== 2) return false;
  if (payload.scheme !== "exact") return false;
  if (!payload.payload?.signature) return false;
  if (!payload.payload?.authorization) return false;

  const auth = payload.payload.authorization;
  if (!auth.from || !auth.to || !auth.value) return false;
  if (!auth.validAfter || !auth.validBefore || !auth.nonce) return false;

  return true;
}

/**
 * Check if payment is within validity window
 */
function isValidityWindowActive(payload: X402PaymentPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = parseInt(payload.payload.authorization.validAfter, 10);
  const validBefore = parseInt(payload.payload.authorization.validBefore, 10);

  return now >= validAfter && now <= validBefore;
}

/**
 * Verify payment amount meets minimum requirement
 */
function verifyAmount(payload: X402PaymentPayload, requiredAmount: string): boolean {
  const paymentValue = BigInt(payload.payload.authorization.value);
  const required = BigInt(requiredAmount);
  return paymentValue >= required;
}

/**
 * Build payment requirement for facilitator
 */
function buildPaymentRequirement(
  input: VerifyPaymentInput,
  payload: X402PaymentPayload
): X402PaymentRequirement {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: input.amount,
    resource: input.endpoint,
    description: `API call to ${input.apiId}`,
    payTo: payload.payload.authorization.to,
    asset: USDC_ADDRESS,
  };
}

/**
 * Main workflow handler
 *
 * Note: In actual CRE SDK, this would use:
 * - cre.handler() for workflow registration
 * - httpTrigger() for HTTP trigger configuration
 * - runtime.HTTPClient for consensus-verified HTTP calls
 *
 * This is a TypeScript representation of the workflow logic.
 */
export async function verifyPayment(
  input: VerifyPaymentInput,
  httpClient: {
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  }
): Promise<VerifyPaymentOutput> {
  const timestamp = Date.now();

  // Step 1: Decode payment payload
  const payload = decodePaymentPayload(input.paymentPayload);
  if (!payload) {
    return {
      valid: false,
      error: "Invalid payment payload format",
      verifiedAt: timestamp,
    };
  }

  // Step 2: Validate signature structure
  if (!validateSignatureStructure(payload)) {
    return {
      valid: false,
      error: "Invalid signature structure",
      verifiedAt: timestamp,
    };
  }

  // Step 3: Check validity window
  if (!isValidityWindowActive(payload)) {
    return {
      valid: false,
      error: "Payment outside validity window",
      verifiedAt: timestamp,
    };
  }

  // Step 4: Verify amount
  if (!verifyAmount(payload, input.amount)) {
    return {
      valid: false,
      error: "Insufficient payment amount",
      verifiedAt: timestamp,
    };
  }

  // Step 5: Verify consumer address matches
  if (payload.payload.authorization.from.toLowerCase() !== input.consumer.toLowerCase()) {
    return {
      valid: false,
      error: "Consumer address mismatch",
      verifiedAt: timestamp,
    };
  }

  // Step 6: Call x402 facilitator for on-chain verification
  // This call is executed across multiple DON nodes for consensus
  try {
    const paymentRequirement = buildPaymentRequirement(input, payload);

    const response = await httpClient.post(`${X402_FACILITATOR_URL}/verify`, {
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: paymentRequirement,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result: X402VerifyResponse = JSON.parse(response.body);

    if (result.success) {
      return {
        valid: true,
        txHash: result.txHash || result.txID,
        verifiedAt: timestamp,
      };
    }

    return {
      valid: false,
      error: result.errorReason || result.error || "Facilitator verification failed",
      verifiedAt: timestamp,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Facilitator request failed",
      verifiedAt: timestamp,
    };
  }
}

/**
 * CRE Workflow Configuration
 *
 * This config defines the workflow for the Chainlink CRE SDK.
 * Trigger: HTTP POST to /verify-payment
 * Handler: verifyPayment function
 */
export const workflowConfig = {
  name: "payment-verification",
  trigger: {
    type: "http" as const,
    path: "/verify-payment",
    method: "POST" as const,
  },
  handler: verifyPayment,
};
