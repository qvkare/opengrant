import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_CHAIN_ID,
  HTTP_STATUS,
  USDC_DECIMALS,
  X402_VERSION,
  getChainConfig,
  getUSDCAddress,
  getEscrowAddress,
} from "./constants.js";
import {
  OpenGrantError,
  PaymentRequiredError,
  InsufficientBalanceError,
  PaymentFailedError,
  UnauthorizedError,
  APINotFoundError,
  RateLimitError,
  NetworkError,
  TimeoutError,
} from "./errors.js";
import { PaymentSigner } from "./signer.js";
import type {
  OpenGrantConfig,
  CallOptions,
  PaymentDetails,
  APIResponse,
  UsageStats,
  WalletBalance,
  APIInfo,
  DonationConfig,
  DonationResult,
  RepoFundInfo,
  Donation,
} from "./types.js";

// USDC ABI (minimal for balanceOf + approve + allowance)
const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Escrow ABI (minimal for donate)
const ESCROW_ABI = [
  {
    name: "donate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "redistributeOnTimeout", type: "bool" },
    ],
    outputs: [],
  },
] as const;

/**
 * OpenGrant SDK Client
 *
 * @example
 * ```typescript
 * import { OpenGrant } from '@opengrant/sdk';
 *
 * // Base (default)
 * const client = new OpenGrant({
 *   apiKey: 'og_live_xxx',
 *   privateKey: '0x...',
 * });
 *
 * // Arbitrum
 * const arbClient = new OpenGrant({
 *   apiKey: 'og_live_xxx',
 *   privateKey: '0x...',
 *   chainId: 42161,
 * });
 *
 * const response = await client.call('tailwind', 'POST', '/v1/generate', {
 *   body: { input: 'button primary' }
 * });
 * ```
 */
export class OpenGrant {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly autoRetry: boolean;
  private readonly maxRetries: number;
  private readonly debug: boolean;
  private readonly chainId: number;
  private readonly tipPercentage: number;
  private readonly signer?: PaymentSigner;
  private readonly publicClient;
  private readonly usdcAddress: `0x${string}`;
  private readonly viemChain: { id: number; name: string };

  constructor(config: OpenGrantConfig) {
    if (!config.apiKey) {
      throw new OpenGrantError({
        message: "apiKey is required and must be a non-empty string",
        code: "INVALID_CONFIG",
        status: 0,
      });
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.autoRetry = config.autoRetry ?? true;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.debug = config.debug ?? false;
    this.chainId = config.chainId ?? DEFAULT_CHAIN_ID;
    this.tipPercentage = Math.min(Math.max(config.tipPercentage ?? 0, 0), 100);

    // Resolve chain-specific config
    const chainConfig = getChainConfig(this.chainId);
    this.usdcAddress = chainConfig.usdc;
    this.viemChain = { id: chainConfig.chainId, name: chainConfig.name };
    const rpcUrl = config.rpcUrl ?? chainConfig.rpcUrl;

    // Initialize signer if wallet credentials provided
    if (config.privateKey) {
      this.signer = new PaymentSigner(config.privateKey, this.chainId);
    } else if (config.walletClient) {
      this.signer = new PaymentSigner(config.walletClient, this.chainId);
    }

    // Initialize public client for reading blockchain state
    this.publicClient = createPublicClient({
      chain: { id: chainConfig.chainId, name: chainConfig.name } as any,
      transport: http(rpcUrl),
    });
  }

  /**
   * Log debug messages
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log("[OpenGrant]", ...args);
    }
  }

  /**
   * Make a request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(timeout);
      }
      throw new NetworkError(
        error instanceof Error ? error.message : "Network error"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse 402 Payment Required response
   */
  private parsePaymentDetails(headers: Headers): PaymentDetails {
    const x402Header = headers.get("X-402-Payment");
    if (!x402Header) {
      throw new PaymentRequiredError("Missing X-402-Payment header");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(x402Header);
    } catch {
      throw new PaymentRequiredError("Invalid X-402-Payment header");
    }

    // Runtime validation of payment details
    const details = parsed as Record<string, unknown>;
    if (
      typeof details !== "object" ||
      details === null ||
      typeof details.amount !== "string" ||
      typeof details.recipient !== "string" ||
      typeof details.facilitator !== "string" ||
      typeof details.nonce !== "string"
    ) {
      throw new PaymentRequiredError(
        "Invalid X-402-Payment header: missing required fields (amount, recipient, facilitator, nonce)"
      );
    }

    // Validate recipient is a valid Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(details.recipient as string)) {
      throw new PaymentRequiredError("Invalid recipient address in payment details");
    }

    // Validate facilitator is an HTTPS URL
    try {
      const facilitatorUrl = new URL(details.facilitator as string);
      if (facilitatorUrl.protocol !== "https:") {
        throw new PaymentRequiredError("Facilitator URL must use HTTPS");
      }
    } catch (e) {
      if (e instanceof PaymentRequiredError) throw e;
      throw new PaymentRequiredError("Invalid facilitator URL in payment details");
    }

    return parsed as PaymentDetails;
  }

  /**
   * Handle payment for 402 response
   */
  private async handlePayment(
    paymentDetails: PaymentDetails,
    maxPrice?: bigint
  ): Promise<string> {
    if (!this.signer) {
      throw new PaymentRequiredError(
        "Payment required but no wallet configured. Provide privateKey or walletClient."
      );
    }

    const amount = BigInt(paymentDetails.amount);

    // Check max price
    if (maxPrice && amount > maxPrice) {
      throw new PaymentRequiredError(
        `Price ${amount} exceeds max price ${maxPrice}`,
        { amount: amount.toString(), maxPrice: maxPrice.toString() }
      );
    }

    // Check balance on the configured chain
    const balance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [this.signer.address as `0x${string}`],
    });

    if (balance < amount) {
      throw new InsufficientBalanceError(amount, balance);
    }

    this.log(`Signing payment for ${formatUnits(amount, USDC_DECIMALS)} USDC`);

    // Sign the payment
    const authorization = await this.signer.signPayment(paymentDetails);

    // Submit to facilitator
    const facilitatorResponse = await this.fetchWithTimeout(
      paymentDetails.facilitator,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authorization),
      },
      this.timeout
    );

    if (!facilitatorResponse.ok) {
      const error = await facilitatorResponse.text();
      throw new PaymentFailedError(`Facilitator error: ${error}`);
    }

    const result = await facilitatorResponse.json() as { paymentToken?: string };
    if (!result.paymentToken) {
      throw new PaymentFailedError(
        "Facilitator response missing paymentToken field"
      );
    }
    return result.paymentToken;
  }

  /**
   * Make an API call
   *
   * @param apiSlug - The API slug (e.g., 'tailwind')
   * @param method - HTTP method
   * @param path - Endpoint path (e.g., '/v1/generate')
   * @param options - Call options
   */
  async call<T = unknown>(
    apiSlug: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: string,
    options: CallOptions = {}
  ): Promise<APIResponse<T>> {
    const url = new URL(`/proxy/${apiSlug}${path}`, this.baseUrl);

    // Add query parameters
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    const headers: Record<string, string> = {
      ...options.headers,
      // SDK-controlled headers must not be overridden by user options
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-402-Version": X402_VERSION,
    };

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body && ["POST", "PUT", "PATCH"].includes(method)) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const timeout = options.timeout || this.timeout;

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= (this.autoRetry ? this.maxRetries : 0)) {
      try {
        this.log(`${method} ${url.toString()} (attempt ${attempt + 1})`);

        let response = await this.fetchWithTimeout(
          url.toString(),
          requestOptions,
          timeout
        );

        // Handle 402 Payment Required
        if (response.status === HTTP_STATUS.PAYMENT_REQUIRED) {
          const paymentDetails = this.parsePaymentDetails(response.headers);
          const paymentToken = await this.handlePayment(
            paymentDetails,
            options.maxPrice
          );

          // Retry request with payment token
          headers["X-402-Payment-Token"] = paymentToken;
          requestOptions.headers = headers;

          response = await this.fetchWithTimeout(
            url.toString(),
            requestOptions,
            timeout
          );
        }

        // Handle other error statuses
        if (!response.ok) {
          switch (response.status) {
            case HTTP_STATUS.UNAUTHORIZED:
              throw new UnauthorizedError();
            case HTTP_STATUS.NOT_FOUND:
              throw new APINotFoundError(apiSlug);
            case HTTP_STATUS.TOO_MANY_REQUESTS:
              const retryAfter = response.headers.get("Retry-After");
              throw new RateLimitError(
                retryAfter ? parseInt(retryAfter) : undefined
              );
            default:
              const errorBody = await response.text();
              throw new OpenGrantError({
                message: errorBody || response.statusText,
                code: "API_ERROR",
                status: response.status,
              });
          }
        }

        // Parse response
        const data = await response.json();

        // Extract response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // Extract payment info if present
        const paymentAmount = response.headers.get("X-402-Payment-Amount");
        const paymentTx = response.headers.get("X-402-Payment-Tx");

        const result: APIResponse<T> = {
          data: data as T,
          status: response.status,
          headers: responseHeaders,
          payment: paymentAmount
            ? {
                amount: paymentAmount,
                txHash: paymentTx || undefined,
              }
            : undefined,
        };

        // Fire-and-forget: tip linked OSS project if tipPercentage > 0 and a payment was made
        if (this.tipPercentage > 0 && paymentAmount && this.signer) {
          this.tipLinkedRepo(apiSlug, paymentAmount).catch((err) => {
            this.log("Tip failed:", err.message);
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (
          error instanceof UnauthorizedError ||
          error instanceof APINotFoundError ||
          error instanceof InsufficientBalanceError ||
          error instanceof PaymentRequiredError
        ) {
          throw error;
        }

        attempt++;

        if (attempt <= (this.autoRetry ? this.maxRetries : 0)) {
          // Use server-provided retry-after for rate limits, otherwise exponential backoff
          if (error instanceof RateLimitError && error.retryAfter) {
            this.log(`Rate limited, waiting ${error.retryAfter}s`);
            await new Promise((r) => setTimeout(r, error.retryAfter! * 1000));
          } else {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
            this.log(`Retrying in ${backoff}ms...`);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }
    }

    throw lastError || new NetworkError("Request failed after retries");
  }

  /**
   * Convenience method for GET requests
   */
  async get<T = unknown>(
    apiSlug: string,
    path: string,
    options?: Omit<CallOptions, "body">
  ): Promise<APIResponse<T>> {
    return this.call<T>(apiSlug, "GET", path, options);
  }

  /**
   * Convenience method for POST requests
   */
  async post<T = unknown>(
    apiSlug: string,
    path: string,
    body?: Record<string, unknown>,
    options?: Omit<CallOptions, "body">
  ): Promise<APIResponse<T>> {
    return this.call<T>(apiSlug, "POST", path, { ...options, body });
  }

  /**
   * Get wallet balance on the configured chain
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.signer) {
      throw new OpenGrantError({
        message: "No wallet configured",
        code: "NO_WALLET",
        status: 0,
      });
    }

    const [usdc, eth] = await Promise.all([
      this.publicClient.readContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [this.signer.address as `0x${string}`],
      }),
      this.publicClient.getBalance({
        address: this.signer.address as `0x${string}`,
      }),
    ]);

    return {
      usdc: usdc.toString(),
      eth: eth.toString(),
      usdcFormatted: formatUnits(usdc, USDC_DECIMALS),
    };
  }

  /**
   * Get usage statistics
   */
  async getUsage(period: "7d" | "30d" | "90d" = "30d"): Promise<UsageStats> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/consumer/stats?period=${period}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
      this.timeout
    );

    if (!response.ok) {
      throw new OpenGrantError({
        message: "Failed to fetch usage stats",
        code: "USAGE_ERROR",
        status: response.status,
      });
    }

    return response.json() as Promise<UsageStats>;
  }

  /**
   * Get API info
   */
  async getAPIInfo(apiSlug: string): Promise<APIInfo> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/apis/${apiSlug}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
      this.timeout
    );

    if (response.status === 404) {
      throw new APINotFoundError(apiSlug);
    }

    if (!response.ok) {
      throw new OpenGrantError({
        message: "Failed to fetch API info",
        code: "API_ERROR",
        status: response.status,
      });
    }

    return response.json() as Promise<APIInfo>;
  }

  /**
   * Get signer address
   */
  get address(): string | undefined {
    return this.signer?.address;
  }

  /**
   * Tip the linked OSS project after a paid API call (fire-and-forget).
   * Looks up the API's linked GitHub repo and donates a percentage of the payment.
   */
  private async tipLinkedRepo(
    apiSlug: string,
    paymentAmountWei: string
  ): Promise<void> {
    const escrowAddress = getEscrowAddress(this.chainId);
    if (!escrowAddress || !this.signer) return;

    // Fetch API info to check for linked repo
    const apiInfo = await this.getAPIInfo(apiSlug);
    if (!apiInfo.githubRepo?.repoHash) return;

    // Calculate tip amount (percentage of payment in USDC wei)
    const paymentBigInt = BigInt(paymentAmountWei);
    const tipAmount = (paymentBigInt * BigInt(Math.round(this.tipPercentage * 100))) / 10000n;
    if (tipAmount <= 0n) return;

    this.log(
      `Tipping ${formatUnits(tipAmount, USDC_DECIMALS)} USDC to ${apiInfo.githubRepo.owner}/${apiInfo.githubRepo.name}`
    );

    // Ensure allowance
    const allowance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [this.signer.address as `0x${string}`, escrowAddress],
    });

    const walletClient = this.signer.getWalletClient();

    if (allowance < tipAmount) {
      // Approve a larger amount (1000 USDC) to avoid repeated approve txs for each tip
      const approveAmount = parseUnits("1000", USDC_DECIMALS);
      const approveHash = await walletClient.writeContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: "approve",
        args: [escrowAddress, approveAmount > tipAmount ? approveAmount : tipAmount],
        chain: this.viemChain as any,
        account: this.signer!.address as `0x${string}`,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Donate on-chain
    const repoHash = apiInfo.githubRepo.repoHash as `0x${string}`;
    const txHash = await walletClient.writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "donate",
      args: [repoHash, tipAmount, false],
      chain: this.viemChain as any,
      account: this.signer!.address as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Record in backend (best-effort)
    try {
      const repoInfo = await this.getRepoFundInfo(
        apiInfo.githubRepo.owner,
        apiInfo.githubRepo.name
      );
      await this.fetchWithTimeout(
        `${this.baseUrl}/v1/fund/donate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repoId: repoInfo.id,
            txHash,
            chainId: this.chainId,
            amount: formatUnits(tipAmount, USDC_DECIMALS),
            redistributeOnTimeout: false,
            source: "api_tip",
          }),
        },
        this.timeout
      );
    } catch {
      this.log("Warning: Failed to record tip in backend");
    }

    this.log(`Tip successful: ${txHash}`);
  }

  /**
   * Donate to an open source repository via the escrow contract
   *
   * @param config - Donation configuration
   * @returns Donation result with transaction hash
   */
  async donate(config: DonationConfig): Promise<DonationResult> {
    if (!this.signer) {
      throw new OpenGrantError({
        message: "Wallet required for donations. Provide privateKey or walletClient.",
        code: "NO_WALLET",
        status: 0,
      });
    }

    const escrowAddress = getEscrowAddress(this.chainId);
    if (!escrowAddress) {
      throw new OpenGrantError({
        message: `Escrow contract not deployed on chain ${this.chainId}`,
        code: "ESCROW_NOT_DEPLOYED",
        status: 0,
      });
    }

    // Fetch repo info from backend to get repoId and repoHash
    const repoInfo = await this.getRepoFundInfo(config.repoOwner, config.repoName);
    const repoHash = repoInfo.repoHash as `0x${string}`;

    const amount = parseUnits(config.amount, USDC_DECIMALS);

    // Check USDC balance
    const balance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [this.signer.address as `0x${string}`],
    });

    if (balance < amount) {
      throw new InsufficientBalanceError(amount, balance);
    }

    // Check and set USDC allowance for escrow
    const allowance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [this.signer.address as `0x${string}`, escrowAddress],
    });

    if (allowance < amount) {
      this.log(`Approving ${formatUnits(amount, USDC_DECIMALS)} USDC for escrow`);
      const walletClient = this.signer.getWalletClient();
      const approveHash = await walletClient.writeContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: "approve",
        args: [escrowAddress, amount],
        chain: this.viemChain as any,
        account: this.signer.address as `0x${string}`,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Execute on-chain donation
    this.log(`Donating ${config.amount} USDC to ${config.repoOwner}/${config.repoName}`);
    const walletClient = this.signer.getWalletClient();
    const txHash = await walletClient.writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "donate",
      args: [repoHash, amount, config.redistributeOnTimeout ?? false],
      chain: this.viemChain as any,
      account: this.signer.address as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Record in backend
    try {
      await this.fetchWithTimeout(
        `${this.baseUrl}/v1/fund/donate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repoId: repoInfo.id,
            txHash,
            chainId: this.chainId,
            amount: config.amount,
            redistributeOnTimeout: config.redistributeOnTimeout ?? false,
            source: "direct",
          }),
        },
        this.timeout
      );
    } catch {
      this.log("Warning: Failed to record donation in backend (on-chain tx succeeded)");
    }

    return {
      txHash,
      repoHash: repoInfo.repoHash,
      amount: config.amount,
      chainId: this.chainId,
    };
  }

  /**
   * Get funding info for a GitHub repository
   *
   * @param owner - GitHub owner (e.g. "facebook")
   * @param name - GitHub repo name (e.g. "react")
   */
  async getRepoFundInfo(owner: string, name: string): Promise<RepoFundInfo> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/fund/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {},
      this.timeout
    );

    if (response.status === 404) {
      throw new OpenGrantError({
        message: `Repository ${owner}/${name} not found in funding database`,
        code: "REPO_NOT_FOUND",
        status: 404,
      });
    }

    if (!response.ok) {
      throw new OpenGrantError({
        message: "Failed to fetch repo fund info",
        code: "API_ERROR",
        status: response.status,
      });
    }

    const data = (await response.json()) as any;
    return {
      id: data.id,
      owner: data.owner,
      name: data.name,
      totalFunded: data.totalFunded,
      donorCount: data.donorCount,
      claimStatus: data.claimStatus,
      repoHash: data.repoHash,
    };
  }

  /**
   * Get the current user's donation history
   *
   * @param params - Pagination parameters
   */
  async getMyDonations(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ data: Donation[]; pagination: { limit: number; offset: number; total: number } }> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    const qs = query.toString();

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/fund/my-donations${qs ? `?${qs}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
      this.timeout
    );

    if (!response.ok) {
      throw new OpenGrantError({
        message: "Failed to fetch donations",
        code: "API_ERROR",
        status: response.status,
      });
    }

    return response.json() as Promise<{
      data: Donation[];
      pagination: { limit: number; offset: number; total: number };
    }>;
  }
}
