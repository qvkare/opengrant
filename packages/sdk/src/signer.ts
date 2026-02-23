import {
  createWalletClient,
  http,
  type WalletClient,
  type Account,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_CHAIN_ID,
  getChainConfig,
  getUSDCDomain,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./constants.js";
import type { PaymentDetails, PaymentAuthorization } from "./types.js";

/**
 * Payment signer for EIP-3009 TransferWithAuthorization.
 * Supports any chain with native USDC (EIP-3009).
 */
export class PaymentSigner {
  private walletClient: WalletClient;
  private account: Account;
  private chainId: number;

  constructor(
    walletClientOrPrivateKey: WalletClient | `0x${string}`,
    chainId: number = DEFAULT_CHAIN_ID
  ) {
    this.chainId = chainId;

    if (typeof walletClientOrPrivateKey === "string") {
      // Private key provided — create wallet client for the specified chain
      this.account = privateKeyToAccount(walletClientOrPrivateKey);
      const chainConfig = getChainConfig(chainId);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: { id: chainConfig.chainId, name: chainConfig.name } as Chain,
        transport: http(chainConfig.rpcUrl),
      });
    } else {
      // Wallet client provided
      this.walletClient = walletClientOrPrivateKey;
      if (!walletClientOrPrivateKey.account) {
        throw new Error("Wallet client must have an account");
      }
      this.account = walletClientOrPrivateKey.account;
    }
  }

  /**
   * Get the signer's address
   */
  get address(): string {
    return this.account.address;
  }

  /**
   * Get the underlying wallet client for direct contract interactions
   */
  getWalletClient(): WalletClient {
    return this.walletClient;
  }

  /**
   * Sign a payment authorization using EIP-3009 TransferWithAuthorization.
   * Uses the chain-specific USDC EIP-712 domain.
   */
  async signPayment(payment: PaymentDetails): Promise<PaymentAuthorization> {
    const from = this.account.address;
    const to = payment.recipient as `0x${string}`;
    const value = BigInt(payment.amount);
    const validAfter = 0; // Valid immediately
    const validBefore = payment.validUntil;
    const nonce = payment.nonce as `0x${string}`;

    // Use chain-specific USDC domain for EIP-712 signing
    const domain = getUSDCDomain(this.chainId);

    // Sign the EIP-712 typed data
    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from,
        to,
        value,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce,
      },
    });

    return {
      signature,
      from,
      to,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce: payment.nonce,
    };
  }

  /**
   * Sign a message (for authentication)
   */
  async signMessage(message: string): Promise<string> {
    return this.walletClient.signMessage({ account: this.account, message });
  }
}

/**
 * Create a payment signer from a private key
 * @param privateKey Wallet private key
 * @param chainId Target chain (default: Base Sepolia 84532)
 */
export function createSigner(
  privateKey: `0x${string}`,
  chainId?: number
): PaymentSigner {
  return new PaymentSigner(privateKey, chainId);
}

/**
 * Create a payment signer from a wallet client
 */
export function createSignerFromWallet(
  walletClient: WalletClient,
  chainId?: number
): PaymentSigner {
  return new PaymentSigner(walletClient, chainId);
}
