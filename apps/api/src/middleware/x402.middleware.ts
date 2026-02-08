import { Request, Response, NextFunction, RequestHandler } from "express";
import { createPublicClient, http, parseUnits } from "viem";
import { base, baseSepolia } from "viem/chains";
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
 * x402 Payment Payload from client
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
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

// USDC on Base (6 decimals)
const USDC_DECIMALS = 6;

// Network identifiers
const NETWORKS = {
  baseMainnet: "eip155:8453",
  baseSepolia: "eip155:84532",
} as const;

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
  paymentRequirement: PaymentRequirement,
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
        paymentRequirements: paymentRequirement,
      }),
    });

    const result = await response.json() as {
      success?: boolean;
      txHash?: string;
      txID?: string;
      errorReason?: string;
      error?: string;
    };

    if (response.ok && result.success) {
      return {
        valid: true,
        txHash: result.txHash || result.txID,
      };
    }

    return {
      valid: false,
      error: result.errorReason || result.error || "Verification failed",
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Facilitator request failed",
    };
  }
}

/**
 * Create x402 payment middleware
 */
export function createX402Middleware(middlewareConfig: X402MiddlewareConfig): RequestHandler {
  const { routes, payTo, facilitatorUrl = config.x402.facilitatorUrl } = middlewareConfig;

  // Determine network based on chain ID
  const network =
    middlewareConfig.network ||
    (config.blockchain.chainId === 8453 ? NETWORKS.baseMainnet : NETWORKS.baseSepolia);

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

    // Verify with facilitator
    const paymentRequirement = buildPaymentRequired(req, routeConfig, payTo, network);
    const verification = await verifyPaymentWithFacilitator(
      paymentPayload,
      paymentRequirement,
      facilitatorUrl
    );

    if (!verification.valid) {
      res.status(402).json({
        error: "Payment verification failed",
        reason: verification.error,
      });
      return;
    }

    // Attach payment info to request for downstream handlers
    (req as any).x402Payment = {
      verified: true,
      txHash: verification.txHash,
      amount: paymentAmount.toString(),
      payer: paymentPayload.payload.authorization.from,
      timestamp: Date.now(),
    };

    // Set payment response header
    res.set({
      "PAYMENT-RESPONSE": Buffer.from(
        JSON.stringify({
          success: true,
          txHash: verification.txHash,
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
