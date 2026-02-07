/**
 * CRE Workflow Types for OpenGrant
 */

// ============================================
// PAYMENT VERIFICATION TYPES
// ============================================

export interface VerifyPaymentInput {
  /** API ID that was called */
  apiId: string;
  /** Consumer wallet address */
  consumer: string;
  /** Base64 encoded x402 payment payload */
  paymentPayload: string;
  /** Payment amount in USDC (6 decimals) */
  amount: string;
  /** Endpoint that was called */
  endpoint: string;
}

export interface VerifyPaymentOutput {
  /** Whether the payment is valid */
  valid: boolean;
  /** Transaction hash if payment was settled */
  txHash?: string;
  /** Error message if validation failed */
  error?: string;
  /** Timestamp of verification */
  verifiedAt: number;
}

// ============================================
// USAGE AGGREGATION TYPES
// ============================================

export interface UsageRecord {
  /** Unique record ID */
  id: string;
  /** API ID */
  apiId: string;
  /** Endpoint ID */
  endpointId: string;
  /** Consumer wallet */
  consumer: string;
  /** Amount charged */
  amount: string;
  /** Payment transaction hash */
  txHash: string;
  /** Request timestamp */
  timestamp: number;
}

export interface AggregatedUsage {
  /** API ID */
  apiId: string;
  /** Publisher wallet */
  publisher: string;
  /** Total amount to settle */
  totalAmount: string;
  /** Number of calls */
  callCount: number;
  /** Individual record IDs */
  recordIds: string[];
}

export interface SettlementResult {
  /** Settlement transaction hash */
  txHash: string;
  /** Number of APIs settled */
  apisSettled: number;
  /** Total amount settled */
  totalAmount: string;
  /** Timestamp */
  settledAt: number;
}

// ============================================
// HEALTH MONITORING TYPES
// ============================================

export interface APIHealthCheck {
  /** API ID */
  apiId: string;
  /** Endpoint being checked */
  endpoint: string;
  /** Health status */
  status: "healthy" | "degraded" | "down";
  /** Response time in ms */
  responseTimeMs: number;
  /** HTTP status code */
  statusCode: number;
  /** Error message if any */
  error?: string;
  /** Timestamp */
  checkedAt: number;
}

export interface HealthReport {
  /** Total APIs checked */
  totalChecked: number;
  /** Healthy APIs */
  healthy: number;
  /** Degraded APIs */
  degraded: number;
  /** Down APIs */
  down: number;
  /** Individual check results */
  checks: APIHealthCheck[];
  /** Timestamp */
  reportedAt: number;
}

// ============================================
// x402 TYPES
// ============================================

export interface X402PaymentPayload {
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

export interface X402PaymentRequirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
}

export interface X402VerifyResponse {
  success: boolean;
  txHash?: string;
  txID?: string;
  errorReason?: string;
  error?: string;
}

// ============================================
// CONTRACT TYPES
// ============================================

export interface OpenGrantPaymentsABI {
  recordPayment: {
    inputs: [
      { name: "apiId"; type: "bytes32" },
      { name: "consumer"; type: "address" },
      { name: "amount"; type: "uint256" },
      { name: "x402TxHash"; type: "bytes32" }
    ];
    outputs: [];
  };
  batchDistribute: {
    inputs: [
      { name: "apiIds"; type: "bytes32[]" },
      { name: "amounts"; type: "uint256[]" }
    ];
    outputs: [];
  };
}
