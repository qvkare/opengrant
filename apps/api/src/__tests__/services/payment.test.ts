import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyX402Payment,
  calculatePlatformFee,
  calculateNetAmount,
  type X402PaymentPayload,
} from "../../services/payment.service.js";

// Mock blockchain service
vi.mock("../../services/blockchain.service.js", () => ({
  getTransactionReceipt: vi.fn(),
  waitForTransaction: vi.fn(),
  isAuthorizationUsed: vi.fn(),
  formatUSDC: vi.fn((amount: bigint) => amount.toString()),
}));

// Import the mocked function to control it
import { isAuthorizationUsed } from "../../services/blockchain.service.js";

describe("Payment Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyX402Payment", () => {
    const validPayload: X402PaymentPayload = {
      version: "2",
      scheme: "exact",
      network: "eip155:84532",
      payload: {
        signature: "0x1234567890abcdef",
        authorization: {
          from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          value: "1000000", // 1 USDC
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          nonce: "0x" + "00".repeat(32),
        },
      },
    };

    it("should return valid for correct payment", async () => {
      (isAuthorizationUsed as any).mockResolvedValue(false);

      const result = await verifyX402Payment(
        validPayload,
        BigInt("1000000"),
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(true);
      expect(result.amount).toBe("1000000");
      expect(result.payer).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    it("should reject when recipient mismatches", async () => {
      const result = await verifyX402Payment(
        validPayload,
        BigInt("1000000"),
        "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}` // Different address
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Payment recipient mismatch");
    });

    it("should reject when payment amount is insufficient", async () => {
      const result = await verifyX402Payment(
        validPayload,
        BigInt("2000000"), // Expecting 2 USDC but payload has 1 USDC
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Insufficient payment");
    });

    it("should reject when payment is not yet valid", async () => {
      const futurePayload: X402PaymentPayload = {
        ...validPayload,
        payload: {
          ...validPayload.payload,
          authorization: {
            ...validPayload.payload.authorization,
            validAfter: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          },
        },
      };

      const result = await verifyX402Payment(
        futurePayload,
        BigInt("1000000"),
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Payment not yet valid");
    });

    it("should reject when payment is expired", async () => {
      const expiredPayload: X402PaymentPayload = {
        ...validPayload,
        payload: {
          ...validPayload.payload,
          authorization: {
            ...validPayload.payload.authorization,
            validBefore: String(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          },
        },
      };

      const result = await verifyX402Payment(
        expiredPayload,
        BigInt("1000000"),
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Payment expired");
    });

    it("should reject when authorization has been used", async () => {
      (isAuthorizationUsed as any).mockResolvedValue(true);

      const result = await verifyX402Payment(
        validPayload,
        BigInt("1000000"),
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Payment authorization already used");
    });

    it("should accept overpayment", async () => {
      (isAuthorizationUsed as any).mockResolvedValue(false);

      const result = await verifyX402Payment(
        validPayload,
        BigInt("500000"), // Expecting 0.5 USDC but payload has 1 USDC
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      (isAuthorizationUsed as any).mockRejectedValue(new Error("Network error"));

      const result = await verifyX402Payment(
        validPayload,
        BigInt("1000000"),
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("calculatePlatformFee", () => {
    it("should calculate 10% fee correctly", () => {
      // 10% of 1,000,000 = 100,000
      const fee = calculatePlatformFee(BigInt("1000000"));
      expect(fee).toBe(BigInt("100000"));
    });

    it("should handle small amounts", () => {
      // 10% of 100 = 10
      const fee = calculatePlatformFee(BigInt("100"));
      expect(fee).toBe(BigInt("10"));
    });

    it("should round down for amounts not divisible by 10", () => {
      // 10% of 999 = 99.9 -> 99
      const fee = calculatePlatformFee(BigInt("999"));
      expect(fee).toBe(BigInt("99"));
    });

    it("should return 0 for very small amounts", () => {
      // 10% of 9 = 0.9 -> 0
      const fee = calculatePlatformFee(BigInt("9"));
      expect(fee).toBe(BigInt("0"));
    });

    it("should handle zero amount", () => {
      const fee = calculatePlatformFee(BigInt("0"));
      expect(fee).toBe(BigInt("0"));
    });

    it("should handle large amounts", () => {
      // 10% of 1,000,000,000,000 (1M USDC) = 100,000,000,000
      const fee = calculatePlatformFee(BigInt("1000000000000"));
      expect(fee).toBe(BigInt("100000000000"));
    });
  });

  describe("calculateNetAmount", () => {
    it("should calculate net amount after 10% fee", () => {
      // 1,000,000 - 10% = 900,000
      const net = calculateNetAmount(BigInt("1000000"));
      expect(net).toBe(BigInt("900000"));
    });

    it("should handle small amounts", () => {
      // 100 - 10% = 90
      const net = calculateNetAmount(BigInt("100"));
      expect(net).toBe(BigInt("90"));
    });

    it("should handle very small amounts correctly", () => {
      // 9 - 0 = 9 (fee rounds down to 0)
      const net = calculateNetAmount(BigInt("9"));
      expect(net).toBe(BigInt("9"));
    });

    it("should handle zero amount", () => {
      const net = calculateNetAmount(BigInt("0"));
      expect(net).toBe(BigInt("0"));
    });

    it("should be consistent with platform fee calculation", () => {
      const amount = BigInt("1234567");
      const fee = calculatePlatformFee(amount);
      const net = calculateNetAmount(amount);

      expect(fee + net).toBe(amount);
    });
  });
});
