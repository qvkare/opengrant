import { describe, it, expect, vi } from "vitest";
import { PaymentSigner, createSigner, createSignerFromWallet } from "../signer.js";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { PaymentDetails } from "../types.js";

// Test private key (DO NOT USE IN PRODUCTION - this is the standard Hardhat test key)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("PaymentSigner", () => {
  describe("constructor", () => {
    it("should create signer from private key", () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      expect(signer.address).toBe(TEST_ADDRESS);
    });

    it("should create signer from wallet client", () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(),
      });

      const signer = new PaymentSigner(walletClient);
      expect(signer.address).toBe(TEST_ADDRESS);
    });

    it("should throw error when wallet client has no account", () => {
      const walletClient = createWalletClient({
        chain: base,
        transport: http(),
      }) as WalletClient;

      expect(() => new PaymentSigner(walletClient)).toThrow("Wallet client must have an account");
    });
  });

  describe("address", () => {
    it("should return the correct address", () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      expect(signer.address).toBe(TEST_ADDRESS);
      expect(signer.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("signPayment", () => {
    it("should sign payment and return authorization", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);

      const paymentDetails: PaymentDetails = {
        version: "1",
        network: "base",
        amount: "1000000", // 1 USDC
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        facilitator: "https://facilitator.example.com",
        description: "Test payment",
        resource: "/v1/test",
        validUntil: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        nonce: "0x" + "00".repeat(32),
      };

      const authorization = await signer.signPayment(paymentDetails);

      expect(authorization).toHaveProperty("signature");
      expect(authorization.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(authorization.from).toBe(TEST_ADDRESS);
      expect(authorization.to).toBe(paymentDetails.recipient);
      expect(authorization.value).toBe(paymentDetails.amount);
      expect(authorization.validAfter).toBe(0);
      expect(authorization.validBefore).toBe(paymentDetails.validUntil);
      expect(authorization.nonce).toBe(paymentDetails.nonce);
    });

    it("should produce consistent signatures for same input", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      const nonce = "0x" + "ab".repeat(32);

      const paymentDetails: PaymentDetails = {
        version: "1",
        network: "base",
        amount: "500000",
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        facilitator: "https://facilitator.example.com",
        description: "Test",
        resource: "/test",
        validUntil,
        nonce,
      };

      const auth1 = await signer.signPayment(paymentDetails);
      const auth2 = await signer.signPayment(paymentDetails);

      expect(auth1.signature).toBe(auth2.signature);
    });

    it("should produce different signatures for different amounts", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      const nonce = "0x" + "ab".repeat(32);

      const baseDetails = {
        version: "1",
        network: "base",
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        facilitator: "https://facilitator.example.com",
        description: "Test",
        resource: "/test",
        validUntil,
        nonce,
      };

      const auth1 = await signer.signPayment({ ...baseDetails, amount: "1000000" });
      const auth2 = await signer.signPayment({ ...baseDetails, amount: "2000000" });

      expect(auth1.signature).not.toBe(auth2.signature);
    });
  });

  describe("signMessage", () => {
    it("should sign a message", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      const message = "Hello, OpenGrant!";

      const signature = await signer.signMessage(message);

      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signature.length).toBe(132); // 65 bytes as hex with 0x prefix
    });

    it("should produce consistent signatures for same message", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);
      const message = "Test message";

      const sig1 = await signer.signMessage(message);
      const sig2 = await signer.signMessage(message);

      expect(sig1).toBe(sig2);
    });

    it("should produce different signatures for different messages", async () => {
      const signer = new PaymentSigner(TEST_PRIVATE_KEY);

      const sig1 = await signer.signMessage("Message 1");
      const sig2 = await signer.signMessage("Message 2");

      expect(sig1).not.toBe(sig2);
    });
  });
});

describe("createSigner", () => {
  it("should create a PaymentSigner from private key", () => {
    const signer = createSigner(TEST_PRIVATE_KEY);

    expect(signer).toBeInstanceOf(PaymentSigner);
    expect(signer.address).toBe(TEST_ADDRESS);
  });
});

describe("createSignerFromWallet", () => {
  it("should create a PaymentSigner from wallet client", () => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    const signer = createSignerFromWallet(walletClient);

    expect(signer).toBeInstanceOf(PaymentSigner);
    expect(signer.address).toBe(TEST_ADDRESS);
  });
});
