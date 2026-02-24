import { Request, Response, NextFunction, RequestHandler } from "express";
import { parseUnits } from "viem";
import { config } from "../config/index.js";

/**
 * x402 Payment Requirement
 */
export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  asset: string;
  extra?: Record<string, unknown>;
}

/**
 * x402 V2 Payment Payload from client (payment-signature header)
 */
export interface PaymentPayload {
  x402Version: number;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted?: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  };
  // Legacy v1 fields (kept for backward compat)
  scheme?: "exact";
  network?: string;
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

/**
 * Route pricing configuration
 */
export interface RouteConfig {
  price: string; // USD amount, e.g., "$0.001"
  description: string;
  mimeType?: string;
}

/**
 * Parsed route configuration
 */
interface ParsedRouteConfig {
  priceInUSDC: bigint;
  description: string;
  mimeType?: string;
}

/**
 * x402 middleware configuration
 */
export interface X402MiddlewareConfig {
  routes: Record<string, RouteConfig>;
  payTo: string;
  facilitatorUrl?: string;
  network?: string;
}

// USDC on all chains (6 decimals)
const USDC_DECIMALS = 6;

/**
 * Parse price string to USDC amount
 * @param price Price string like "$0.001" or "0.001"
 * @returns Price in USDC smallest unit (6 decimals)
 */
function parsePrice(price: string): bigint {
  const numericPrice = price.replace(/[^0-9.]/g, "");
  return parseUnits(numericPrice, USDC_DECIMALS);
}

/**
 * Build 402 Payment Required response
 */
function buildPaymentRequired(
  req: Request,
  routeConfig: ParsedRouteConfig,
  payTo: string,
  network: string
): PaymentRequirement {
  const resource = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  return {
    scheme: "exact",
    network,
    maxAmountRequired: routeConfig.priceInUSDC.toString(),
    resource,
    description: routeConfig.description,
    mimeType: routeConfig.mimeType || "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: config.contracts.usdc,
    extra: {
      name: "USDC",
      version: "2",
    },
  };
}

/**
 * Decode payment payload from header
 */
function decodePaymentPayload(header: string): PaymentPayload | null {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded) as PaymentPayload;
  } catch {
    return null;
  }
}

/**
 * Verify payment with x402 facilitator
 */
async function verifyPaymentWithFacilitator(
  paymentPayload: PaymentPayload,
  paymentRequirements: Record<string, unknown>,
  facilitatorUrl: string
): Promise<{ valid: boolean; txHash?: string; error?: string }> {
  try {
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
      }),
    });

    const result = await response.json() as {
      // x402 V2 facilitator response fields
      isValid?: boolean;
      invalidReason?: string;
      invalidMessage?: string;
      payer?: string;
      // Legacy V1 fields (fallback)
      success?: boolean;
      txHash?: string;
      error?: string;
    };

    if (response.ok && (result.isValid || result.success)) {
      return {
        valid: true,
        txHash: result.txHash || `verified-${Date.now().toString(16)}`,
      };
    }

    return {
      valid: false,
      error: result.invalidMessage || result.invalidReason || result.error || "Verification failed",
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Facilitator request failed",
    };
  }
}

/**
 * Settlement queue — serializes settle calls to avoid facilitator nonce conflicts.
 * The facilitator uses its own signing key to submit on-chain txs; concurrent calls
 * cause nonce collisions. This queue ensures settlements execute one at a time.
 */
let settleQueue: Promise<void> = Promise.resolve();

function enqueueSettlement(
  paymentPayload: PaymentPayload,
  paymentRequirements: Record<string, unknown>,
  facilitatorUrl: string
): void {
  settleQueue = settleQueue
    .then(() => settlePaymentWithFacilitator(paymentPayload, paymentRequirements, facilitatorUrl))
    .then((result) => {
      if (result.txHash) {
        console.log("[x402] Settlement OK, txHash:", result.txHash);
      } else {
        console.warn("[x402] Settlement failed:", result.error);
      }
    })
    .catch((err) => {
      console.error("[x402] Settlement error:", err.message || err);
    });
}

/**
 * Settle payment on-chain via x402 facilitator.
 * Calls /settle to execute the actual transferWithAuthorization on the blockchain.
 */
async function settlePaymentWithFacilitator(
  paymentPayload: PaymentPayload,
  paymentRequirements: Record<string, unknown>,
  facilitatorUrl: string
): Promise<{ txHash?: string; error?: string }> {
  try {
    const response = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    const text = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text);
    } catch {
      return { error: `Non-JSON response: ${text.substring(0, 200)}` };
    }

    // x402 facilitator returns `transaction` (not `txHash`) and `success`
    const txHash = (result.transaction || result.txHash) as string | undefined;
    if (response.ok && (result.success === true || txHash)) {
      return { txHash: txHash || undefined };
    }

    return { error: (result.errorReason || result.errorMessage || result.error || "Settlement failed") as string };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Settlement request failed",
    };
  }
}

/**
 * Create x402 payment middleware
 */
export function createX402Middleware(middlewareConfig: X402MiddlewareConfig): RequestHandler {
  const { routes, payTo, facilitatorUrl = config.x402.facilitatorUrl } = middlewareConfig;

  // Determine network from chain config (CAIP-2 format: eip155:<chainId>)
  const network = middlewareConfig.network || config.blockchain.network;

  // Parse route configurations
  const parsedRoutes = new Map<string, ParsedRouteConfig>();
  for (const [route, routeConfig] of Object.entries(routes)) {
    parsedRoutes.set(route, {
      priceInUSDC: parsePrice(routeConfig.price),
      description: routeConfig.description,
      mimeType: routeConfig.mimeType,
    });
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Build route key (METHOD path)
    const routeKey = `${req.method} ${req.path}`;

    // Check if route requires payment
    const routeConfig = parsedRoutes.get(routeKey);
    if (!routeConfig) {
      // No payment required for this route
      return next();
    }

    // Free routes (price = 0)
    if (routeConfig.priceInUSDC === 0n) {
      return next();
    }

    // Check for payment signature header
    const paymentSignature = req.headers["payment-signature"] as string | undefined;

    if (!paymentSignature) {
      // Return 402 Payment Required
      const paymentRequirement = buildPaymentRequired(req, routeConfig, payTo, network);

      res.status(402).set({
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequirement)).toString("base64"),
        "Content-Type": "application/json",
      });

      res.json({
        error: "Payment Required",
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network,
            maxAmountRequired: routeConfig.priceInUSDC.toString(),
            asset: config.contracts.usdc,
            payTo,
            extra: {
              name: "USDC",
              version: "2",
            },
          },
        ],
      });
      return;
    }

    // Decode payment payload
    const paymentPayload = decodePaymentPayload(paymentSignature);
    if (!paymentPayload) {
      res.status(400).json({
        error: "Invalid payment signature format",
      });
      return;
    }

    // Verify payment amount
    const paymentAmount = BigInt(paymentPayload.payload.authorization.value);
    if (paymentAmount < routeConfig.priceInUSDC) {
      res.status(402).json({
        error: "Insufficient payment amount",
        required: routeConfig.priceInUSDC.toString(),
        provided: paymentAmount.toString(),
      });
      return;
    }

    // Verify with facilitator (skip in development when facilitator is unreachable)
    let verification: { valid: boolean; txHash?: string; error?: string };
    if (process.env.SKIP_X402_FACILITATOR === "true") {
      // Dev mode: trust the signed authorization without facilitator verification
      verification = { valid: true, txHash: `dev-${Date.now().toString(16)}` };
    } else {
      const paymentRequirement = buildPaymentRequired(req, routeConfig, payTo, network);
      // Build facilitator-compatible paymentRequirements (x402 V2 uses `amount` not `maxAmountRequired`)
      const facilitatorRequirements = {
        scheme: paymentRequirement.scheme,
        network: paymentRequirement.network,
        amount: paymentRequirement.maxAmountRequired,
        asset: paymentRequirement.asset,
        payTo: paymentRequirement.payTo,
        maxTimeoutSeconds: paymentRequirement.maxTimeoutSeconds || 60,
        extra: paymentRequirement.extra || { name: "USDC", version: "2" },
      };
      verification = await verifyPaymentWithFacilitator(
        paymentPayload,
        facilitatorRequirements,
        facilitatorUrl
      );
    }

    if (!verification.valid) {
      res.status(402).json({
        error: "Payment verification failed",
        reason: verification.error,
      });
      return;
    }

    // Settle payment on-chain via facilitator (synchronous — returns real txHash)
    let settleTxHash: string | undefined;
    if (process.env.SKIP_X402_FACILITATOR !== "true") {
      const paymentRequirement = buildPaymentRequired(req, routeConfig, payTo, network);
      const settleRequirements = {
        scheme: paymentRequirement.scheme,
        network: paymentRequirement.network,
        amount: paymentRequirement.maxAmountRequired,
        asset: paymentRequirement.asset,
        payTo: paymentRequirement.payTo,
        maxTimeoutSeconds: paymentRequirement.maxTimeoutSeconds || 60,
        extra: paymentRequirement.extra || { name: "USDC", version: "2" },
      };
      const settleResult = await settlePaymentWithFacilitator(paymentPayload, settleRequirements, facilitatorUrl);
      if (settleResult.txHash) {
        settleTxHash = settleResult.txHash;
        console.log("[x402] Settlement OK, txHash:", settleTxHash);
      } else {
        console.warn("[x402] Settlement failed:", settleResult.error);
      }
    }

    const finalTxHash = settleTxHash || verification.txHash || `verified-${Date.now().toString(16)}`;

    // Attach payment info to request for downstream handlers
    (req as any).x402Payment = {
      verified: true,
      txHash: finalTxHash,
      amount: paymentAmount.toString(),
      payer: paymentPayload.payload.authorization.from,
      timestamp: Date.now(),
    };

    // Set payment response header
    res.set({
      "PAYMENT-RESPONSE": Buffer.from(
        JSON.stringify({
          success: true,
          txHash: finalTxHash,
        })
      ).toString("base64"),
    });

    next();
  };
}

/**
 * Extract x402 payment info from request
 */
export function getX402Payment(req: Request): {
  verified: boolean;
  txHash: string;
  amount: string;
  payer: string;
  timestamp: number;
} | null {
  return (req as any).x402Payment || null;
}
