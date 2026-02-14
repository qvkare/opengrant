/**
 * Payment Verification Workflow
 *
 * Verifies x402 payment signatures using multi-node consensus.
 * Triggered via HTTP webhook when a payment needs verification.
 *
 * Flow:
 * 1. Receive x402 payment payload via HTTP trigger
 * 2. Validate payload structure (x402Version, scheme, network, payload)
 * 3. HTTP POST to facilitator /verify endpoint
 * 4. Return verification result
 */

import {
  Runner,
  cre,
  consensusIdenticalAggregation,
  ok,
  json,
  type Runtime,
  type HTTPSendRequester,
  type HTTPPayload,
} from "@chainlink/cre-sdk";
import { toBase64 } from "../../lib/base64.js";

interface Config {
  apiUrl: string;
  facilitatorUrl: string;
  usdcAddress: string;
  network: string;
}

interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

interface VerificationResult {
  valid: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Validate x402 payment payload structure
 */
function validatePayload(payload: X402PaymentPayload): string | null {
  if (payload.x402Version !== 2) return "Invalid x402 version";
  if (payload.scheme !== "exact") return "Invalid scheme";
  if (!payload.payload?.signature) return "Missing signature";
  if (!payload.payload?.authorization) return "Missing authorization";

  const auth = payload.payload.authorization;
  if (!auth.from || !auth.to || !auth.value)
    return "Missing authorization fields";
  if (!auth.validAfter || !auth.validBefore || !auth.nonce)
    return "Missing authorization timing fields";

  return null;
}

const verifyWithFacilitator = (
  sendRequester: HTTPSendRequester,
  facilitatorUrl: string,
  paymentPayload: X402PaymentPayload,
  paymentRequirement: Record<string, string>
) => {
  const resp = sendRequester
    .sendRequest({
      url: facilitatorUrl + "/verify",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: toBase64(
        JSON.stringify({
          paymentPayload,
          paymentRequirements: paymentRequirement,
        })
      ),
    })
    .result();

  if (!ok(resp)) {
    throw new Error(`Facilitator returned status ${resp.statusCode}`);
  }

  return json(resp) as {
    success: boolean;
    txHash?: string;
    txID?: string;
    errorReason?: string;
    error?: string;
  };
};

const onHTTPTrigger = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
): string => {
  // Step 1: Parse the incoming payment payload
  let paymentPayload: X402PaymentPayload;
  try {
    const bodyStr = new TextDecoder().decode(payload.input);
    paymentPayload = JSON.parse(bodyStr) as X402PaymentPayload;
  } catch {
    return JSON.stringify({
      valid: false,
      error: "Invalid JSON payload",
    } satisfies VerificationResult);
  }

  // Step 2: Validate payload structure
  const validationError = validatePayload(paymentPayload);
  if (validationError) {
    return JSON.stringify({
      valid: false,
      error: validationError,
    } satisfies VerificationResult);
  }

  runtime.log(
    `Verifying payment from ${paymentPayload.payload.authorization.from}`
  );

  // Step 3: Call facilitator for on-chain verification
  const httpClient = new cre.capabilities.HTTPClient();

  const paymentRequirement = {
    scheme: "exact",
    network: runtime.config.network,
    maxAmountRequired: paymentPayload.payload.authorization.value,
    payTo: paymentPayload.payload.authorization.to,
    asset: runtime.config.usdcAddress,
  };

  try {
    const result = httpClient
      .sendRequest(
        runtime,
        verifyWithFacilitator,
        consensusIdenticalAggregation()
      )(
        runtime.config.facilitatorUrl,
        paymentPayload,
        paymentRequirement
      )
      .result();

    // Step 4: Build verification result
    if (result.success) {
      runtime.log("Payment verified successfully");
      return JSON.stringify({
        valid: true,
        txHash: result.txHash || result.txID,
      } satisfies VerificationResult);
    }

    const errorMsg =
      result.errorReason ||
      result.error ||
      "Facilitator verification failed";
    runtime.log(`Payment verification failed: ${errorMsg}`);

    return JSON.stringify({
      valid: false,
      error: errorMsg,
    } satisfies VerificationResult);
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Facilitator request failed";
    runtime.log(`Payment verification error: ${errorMsg}`);

    return JSON.stringify({
      valid: false,
      error: errorMsg,
    } satisfies VerificationResult);
  }
};

const initWorkflow = (config: Config) => {
  const httpCap = new cre.capabilities.HTTPCapability();
  return [
    cre.handler(httpCap.trigger({}), onHTTPTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({});
  await runner.run(initWorkflow);
}
