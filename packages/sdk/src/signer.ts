import {
  createWalletClient,
  http,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./constants.js";
import type { PaymentDetails, PaymentAuthorization } from "./types.js";

/**
 * Payment signer for EIP-3009 TransferWithAuthorization
 */
export class PaymentSigner {
  private walletClient: WalletClient;
  private account: Account;

  constructor(
    walletClientOrPrivateKey:
      | WalletClient
      | `0x${string}`
  ) {
    if (typeof walletClientOrPrivateKey === "string") {
      // Private key provided
      this.account = privateKeyToAccount(walletClientOrPrivateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: base,
        transport: http(),
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
   * Sign a payment authorization using EIP-3009 TransferWithAuthorization
   */
  async signPayment(payment: PaymentDetails): Promise<PaymentAuthorization> {
    const from = this.account.address;
    const to = payment.recipient as `0x${string}`;
    const value = BigInt(payment.amount);
    const validAfter = 0; // Valid immediately
    const validBefore = payment.validUntil;
    const nonce = payment.nonce as `0x${string}`;

    // Sign the EIP-712 typed data
    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain: USDC_DOMAIN,
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
 */
export function createSigner(privateKey: `0x${string}`): PaymentSigner {
  return new PaymentSigner(privateKey);
}

/**
 * Create a payment signer from a wallet client
 */
export function createSignerFromWallet(
  walletClient: WalletClient
): PaymentSigner {
  return new PaymentSigner(walletClient);
}
