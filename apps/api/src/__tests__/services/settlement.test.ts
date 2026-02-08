import { describe, it, expect, vi, beforeEach } from "vitest";

// Query result queue - each await on the DB chain shifts from this queue
let queryQueue: any[] = [];

function pushQueryResult(result: any) {
  queryQueue.push(result);
}

function pushQueryError(error: Error) {
  queryQueue.push({ __isError: true, error });
}

// Mock database with thenable chainable pattern
vi.mock("../../db/index.js", () => {
  const createDbMock = () => {
    const mockDb: any = {};
    const chainMethods = [
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
      "offset",
      "innerJoin",
      "insert",
      "update",
      "values",
      "set",
      "returning",
      "groupBy",
    ];
    for (const method of chainMethods) {
      mockDb[method] = vi.fn(() => mockDb);
    }
    // Make the mock thenable - when awaited, shift from queue
    mockDb.then = function (resolve: any, reject: any) {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        return reject ? reject(result.error) : Promise.reject(result.error);
      }
      return resolve(result ?? []);
    };
    return mockDb;
  };

  return {
    db: createDbMock(),
  };
});

// Mock @opengrant/database table references
vi.mock("@opengrant/database", () => ({
  usageRecords: {
    id: "id",
    apiId: "api_id",
    priceCharged: "price_charged",
    requestTimestamp: "request_timestamp",
    paymentStatus: "payment_status",
    settlementBatchId: "settlement_batch_id",
    settledAt: "settled_at",
  },
  payments: {
    id: "id",
    publisherId: "publisher_id",
    apiId: "api_id",
    grossAmount: "gross_amount",
    platformFee: "platform_fee",
    netAmount: "net_amount",
    periodStart: "period_start",
    periodEnd: "period_end",
    usageCount: "usage_count",
    settlementTxHash: "settlement_tx_hash",
    settledAt: "settled_at",
  },
  withdrawals: {
    id: "id",
    status: "status",
    amount: "amount",
    destinationAddress: "destination_address",
    txHash: "tx_hash",
    processedAt: "processed_at",
  },
  apis: {
    id: "id",
    publisherId: "publisher_id",
  },
  publishers: {
    id: "id",
    walletAddress: "wallet_address",
  },
}));

// Mock blockchain service
vi.mock("../../services/blockchain.service.js", () => ({
  createPlatformWallet: vi.fn(),
  waitForTransaction: vi.fn(),
  parseUSDC: vi.fn((value: string) => BigInt(value) * BigInt(1000000)),
  formatUSDC: vi.fn((value: bigint) => (Number(value) / 1000000).toFixed(6)),
}));

// Mock payment service
vi.mock("../../services/payment.service.js", () => ({
  recordPayment: vi.fn(),
  calculatePlatformFee: vi.fn((amount: bigint) => (amount * BigInt(1000)) / BigInt(10000)),
  calculateNetAmount: vi.fn((amount: bigint) => {
    const fee = (amount * BigInt(1000)) / BigInt(10000);
    return amount - fee;
  }),
}));

// Import after mocks
import { db } from "../../db/index.js";
import {
  settleApiPayments,
  settlePublisherPayments,
  processWithdrawal,
  runPeriodicSettlement,
  type SettlementResult,
  type WithdrawalResult,
} from "../../services/settlement.service.js";

// Get mocked functions to control them in tests
import {
  createPlatformWallet as mockCreatePlatformWallet,
  waitForTransaction as mockWaitForTransaction,
  parseUSDC as mockParseUSDC,
  formatUSDC as mockFormatUSDC,
} from "../../services/blockchain.service.js";

import {
  recordPayment as mockRecordPayment,
  calculatePlatformFee as mockCalculatePlatformFee,
  calculateNetAmount as mockCalculateNetAmount,
} from "../../services/payment.service.js";

const mockTransferUSDC = vi.fn();

describe("Settlement Service", () => {
  const chainMethods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "innerJoin",
    "insert",
    "update",
    "values",
    "set",
    "returning",
    "groupBy",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryQueue = [];
    // Reset chainable methods on db
    for (const method of chainMethods) {
      (db as any)[method] = vi.fn(() => db);
    }
  });

  describe("settleApiPayments", () => {
    const mockApi = {
      id: "api-1",
      publisherId: "publisher-1",
    };

    const mockPublisher = {
      id: "publisher-1",
      walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };

    const mockVerifiedRecords = [
      {
        id: "usage-1",
        priceCharged: "1000000",
        requestTimestamp: new Date("2024-01-01T10:00:00Z"),
      },
      {
        id: "usage-2",
        priceCharged: "2000000",
        requestTimestamp: new Date("2024-01-01T11:00:00Z"),
      },
    ];

    it("should settle verified records correctly", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: Get verified usage records
      pushQueryResult(mockVerifiedRecords);
      // Query 4: Update usage records (no await needed, just execution)
      pushQueryResult([]);

      mockRecordPayment.mockResolvedValue("payment-123");

      const result = await settleApiPayments("api-1");

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe("payment-123");
      expect(result.grossAmount).toBe("3.000000");
      expect(result.netAmount).toBe("2.700000");
      expect(result.platformFee).toBe("0.300000");
      expect(result.txHash).toBeUndefined();

      // Verify recordPayment was called with correct parameters
      expect(mockRecordPayment).toHaveBeenCalledWith(
        "publisher-1",
        "api-1",
        BigInt("3000000"),
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
        2,
        undefined
      );
    });

    it("should calculate platform fee correctly (10% = 1000 BPS)", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: Get verified usage records with specific amount
      pushQueryResult([
        {
          id: "usage-1",
          priceCharged: "10000000", // 10 USDC
          requestTimestamp: new Date("2024-01-01T10:00:00Z"),
        },
      ]);
      // Query 4: Update usage records
      pushQueryResult([]);

      mockRecordPayment.mockResolvedValue("payment-456");

      const result = await settleApiPayments("api-1");

      expect(result.success).toBe(true);
      // 10 USDC gross
      expect(result.grossAmount).toBe("10.000000");
      // 1 USDC fee (10%)
      expect(result.platformFee).toBe("1.000000");
      // 9 USDC net (90%)
      expect(result.netAmount).toBe("9.000000");

      // Verify the fee calculation was called
      expect(mockCalculatePlatformFee).toHaveBeenCalledWith(BigInt("10000000"));
    });

    it("should return empty result when no verified records", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: No verified usage records
      pushQueryResult([]);

      const result = await settleApiPayments("api-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No verified payments to settle");
      expect(mockRecordPayment).not.toHaveBeenCalled();
    });

    it("should return error when API not found", async () => {
      // Query 1: API not found
      pushQueryResult([]);

      const result = await settleApiPayments("nonexistent-api");

      expect(result.success).toBe(false);
      expect(result.error).toBe("API not found");
    });

    it("should return error when publisher not found", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Publisher not found
      pushQueryResult([]);

      const result = await settleApiPayments("api-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Publisher not found");
    });

    it("should execute on-chain transfer when executeOnChain is true", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: Get verified usage records
      pushQueryResult(mockVerifiedRecords);
      // Query 4: Update usage records
      pushQueryResult([]);

      const mockWallet = {
        transferUSDC: mockTransferUSDC,
      };
      mockCreatePlatformWallet.mockReturnValue(mockWallet);
      mockTransferUSDC.mockResolvedValue("0x1234567890abcdef");
      mockWaitForTransaction.mockResolvedValue(undefined);
      mockRecordPayment.mockResolvedValue("payment-789");

      const result = await settleApiPayments("api-1", { executeOnChain: true });

      expect(result.success).toBe(true);
      expect(result.txHash).toBe("0x1234567890abcdef");
      expect(mockCreatePlatformWallet).toHaveBeenCalled();
      expect(mockTransferUSDC).toHaveBeenCalledWith(
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        BigInt("2700000") // net amount after 10% fee
      );
      expect(mockWaitForTransaction).toHaveBeenCalledWith("0x1234567890abcdef");

      // Verify recordPayment was called with txHash
      expect(mockRecordPayment).toHaveBeenCalledWith(
        "publisher-1",
        "api-1",
        BigInt("3000000"),
        expect.any(Date),
        expect.any(Date),
        2,
        "0x1234567890abcdef"
      );
    });

    it("should handle on-chain transfer failure", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: Get verified usage records
      pushQueryResult(mockVerifiedRecords);

      const mockWallet = {
        transferUSDC: mockTransferUSDC,
      };
      mockCreatePlatformWallet.mockReturnValue(mockWallet);
      mockTransferUSDC.mockRejectedValue(new Error("Insufficient gas"));

      const result = await settleApiPayments("api-1", { executeOnChain: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("On-chain transfer failed");
      expect(result.error).toContain("Insufficient gas");
      expect(mockRecordPayment).not.toHaveBeenCalled();
    });

    it("should respect minAmount threshold", async () => {
      // Query 1: Get API
      pushQueryResult([mockApi]);
      // Query 2: Get publisher
      pushQueryResult([mockPublisher]);
      // Query 3: Get verified usage records (small amount)
      pushQueryResult([
        {
          id: "usage-1",
          priceCharged: "100000", // 0.1 USDC
          requestTimestamp: new Date("2024-01-01T10:00:00Z"),
        },
      ]);

      const result = await settleApiPayments("api-1", { minAmount: BigInt(5000000) }); // 5 USDC minimum

      expect(result.success).toBe(false);
      expect(result.error).toContain("Amount below minimum threshold");
      expect(mockRecordPayment).not.toHaveBeenCalled();
    });
  });

  describe("settlePublisherPayments", () => {
    it("should settle all APIs for a publisher", async () => {
      const publisherApis = [
        { id: "api-1" },
        { id: "api-2" },
      ];

      // Query 1: Get all APIs for publisher
      pushQueryResult(publisherApis);

      // For api-1 settlement
      // Query 2: Get API
      pushQueryResult([{ id: "api-1", publisherId: "publisher-1" }]);
      // Query 3: Get publisher
      pushQueryResult([{ id: "publisher-1", walletAddress: "0x1234" }]);
      // Query 4: Get verified records
      pushQueryResult([
        {
          id: "usage-1",
          priceCharged: "1000000",
          requestTimestamp: new Date("2024-01-01T10:00:00Z"),
        },
      ]);
      // Query 5: Update usage records
      pushQueryResult([]);

      mockRecordPayment.mockResolvedValueOnce("payment-1");

      // For api-2 settlement
      // Query 6: Get API
      pushQueryResult([{ id: "api-2", publisherId: "publisher-1" }]);
      // Query 7: Get publisher
      pushQueryResult([{ id: "publisher-1", walletAddress: "0x1234" }]);
      // Query 8: Get verified records
      pushQueryResult([
        {
          id: "usage-2",
          priceCharged: "2000000",
          requestTimestamp: new Date("2024-01-01T11:00:00Z"),
        },
      ]);
      // Query 9: Update usage records
      pushQueryResult([]);

      mockRecordPayment.mockResolvedValueOnce("payment-2");

      const results = await settlePublisherPayments("publisher-1");

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].paymentId).toBe("payment-1");
      expect(results[1].success).toBe(true);
      expect(results[1].paymentId).toBe("payment-2");
    });

    it("should handle publisher with no APIs", async () => {
      // Query 1: No APIs found
      pushQueryResult([]);

      const results = await settlePublisherPayments("publisher-without-apis");

      expect(results).toHaveLength(0);
    });

    it("should skip APIs with no verified payments", async () => {
      const publisherApis = [
        { id: "api-1" },
        { id: "api-2" },
      ];

      // Query 1: Get all APIs for publisher
      pushQueryResult(publisherApis);

      // For api-1 settlement (has verified records)
      pushQueryResult([{ id: "api-1", publisherId: "publisher-1" }]);
      pushQueryResult([{ id: "publisher-1", walletAddress: "0x1234" }]);
      pushQueryResult([
        {
          id: "usage-1",
          priceCharged: "1000000",
          requestTimestamp: new Date("2024-01-01T10:00:00Z"),
        },
      ]);
      pushQueryResult([]);

      mockRecordPayment.mockResolvedValueOnce("payment-1");

      // For api-2 settlement (no verified records)
      pushQueryResult([{ id: "api-2", publisherId: "publisher-1" }]);
      pushQueryResult([{ id: "publisher-1", walletAddress: "0x1234" }]);
      pushQueryResult([]); // No verified records

      const results = await settlePublisherPayments("publisher-1");

      // Should only return result for api-1 (api-2 skipped due to no verified payments)
      expect(results).toHaveLength(1);
      expect(results[0].paymentId).toBe("payment-1");
    });
  });

  describe("processWithdrawal", () => {
    const mockWithdrawal = {
      id: "withdrawal-1",
      status: "pending",
      amount: "5.000000",
      destinationAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      txHash: null,
      processedAt: null,
    };

    it("should complete withdrawal successfully", async () => {
      // Query 1: Get withdrawal
      pushQueryResult([mockWithdrawal]);
      // Query 2: Update to processing
      pushQueryResult([]);
      // Query 3: Update to completed
      pushQueryResult([]);

      const mockWallet = {
        transferUSDC: mockTransferUSDC,
      };
      mockCreatePlatformWallet.mockReturnValue(mockWallet);
      mockTransferUSDC.mockResolvedValue("0xabcdef123456");
      mockWaitForTransaction.mockResolvedValue(undefined);
      mockParseUSDC.mockReturnValue(BigInt(5000000));

      const result = await processWithdrawal("withdrawal-1");

      expect(result.success).toBe(true);
      expect(result.withdrawalId).toBe("withdrawal-1");
      expect(result.txHash).toBe("0xabcdef123456");
      expect(mockCreatePlatformWallet).toHaveBeenCalled();
      expect(mockTransferUSDC).toHaveBeenCalledWith(
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        BigInt(5000000)
      );
      expect(mockWaitForTransaction).toHaveBeenCalledWith("0xabcdef123456");
    });

    it("should handle withdrawal not found", async () => {
      // Query 1: Withdrawal not found
      pushQueryResult([]);

      const result = await processWithdrawal("nonexistent-withdrawal");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Withdrawal not found");
      expect(mockCreatePlatformWallet).not.toHaveBeenCalled();
    });

    it("should reject already processed withdrawal", async () => {
      const completedWithdrawal = {
        ...mockWithdrawal,
        status: "completed",
      };

      // Query 1: Get withdrawal (already completed)
      pushQueryResult([completedWithdrawal]);

      const result = await processWithdrawal("withdrawal-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Withdrawal already completed");
      expect(mockCreatePlatformWallet).not.toHaveBeenCalled();
    });

    it("should handle on-chain transfer failure", async () => {
      // Query 1: Get withdrawal
      pushQueryResult([mockWithdrawal]);
      // Query 2: Update to processing
      pushQueryResult([]);
      // Query 3: Update to failed
      pushQueryResult([]);

      const mockWallet = {
        transferUSDC: mockTransferUSDC,
      };
      mockCreatePlatformWallet.mockReturnValue(mockWallet);
      mockTransferUSDC.mockRejectedValue(new Error("Insufficient balance"));
      mockParseUSDC.mockReturnValue(BigInt(5000000));

      const result = await processWithdrawal("withdrawal-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient balance");
    });
  });

  describe("runPeriodicSettlement", () => {
    it("should handle empty state (no pending payments)", async () => {
      // Query 1: No publishers with pending payments
      pushQueryResult([]);

      const result = await runPeriodicSettlement();

      expect(result.processed).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.totalSettled).toBe("0.000000");
    });

    it("should track failed settlements", async () => {
      const pendingByPublisher = [{ publisherId: "publisher-1" }];

      // Query 1: Get publishers with pending payments
      pushQueryResult(pendingByPublisher);

      // Publisher 1 APIs
      pushQueryResult([{ id: "api-1" }]);
      // Settle api-1 (will fail - API not found)
      pushQueryResult([]); // API not found

      const result = await runPeriodicSettlement();

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.totalSettled).toBe("0.000000");
    });

    it("should execute on-chain transfers when requested", async () => {
      const pendingByPublisher = [{ publisherId: "publisher-1" }];

      // Query 1: Get publishers with pending payments
      pushQueryResult(pendingByPublisher);

      // Publisher 1 APIs
      pushQueryResult([{ id: "api-1" }]);
      // Settle api-1
      pushQueryResult([{ id: "api-1", publisherId: "publisher-1" }]);
      pushQueryResult([{ id: "publisher-1", walletAddress: "0x1111" }]);
      pushQueryResult([
        {
          id: "usage-1",
          priceCharged: "5000000",
          requestTimestamp: new Date("2024-01-01T10:00:00Z"),
        },
      ]);
      pushQueryResult([]);

      const mockWallet = {
        transferUSDC: mockTransferUSDC,
      };
      mockCreatePlatformWallet.mockReturnValue(mockWallet);
      mockTransferUSDC.mockResolvedValue("0xtxhash123");
      mockWaitForTransaction.mockResolvedValue(undefined);
      mockRecordPayment.mockResolvedValueOnce("payment-1");

      const result = await runPeriodicSettlement({ executeOnChain: true });

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockCreatePlatformWallet).toHaveBeenCalled();
      expect(mockTransferUSDC).toHaveBeenCalled();
    });
  });
});
