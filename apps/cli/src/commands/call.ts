import chalk from "chalk";
import ora from "ora";
import { isAuthenticated, getApiUrl } from "../config.js";

export async function callApi(
  apiSlug: string,
  method: string,
  path: string,
  options: {
    body?: string;
    params?: string[];
    privateKey?: string;
    apiKey?: string;
    chainId?: string;
    maxPrice?: string;
  }
): Promise<void> {
  if (!isAuthenticated() && !options.apiKey) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first or pass --api-key."));
    return;
  }

  const apiKey = options.apiKey || process.env.OPENGRANT_API_KEY;
  const privateKey = options.privateKey || process.env.OPENGRANT_PRIVATE_KEY;

  if (!apiKey) {
    console.log(chalk.red("API key required. Use --api-key or set OPENGRANT_API_KEY env."));
    return;
  }

  if (!privateKey) {
    console.log(chalk.red("Private key required for x402 payments. Use --private-key or set OPENGRANT_PRIVATE_KEY env."));
    return;
  }

  const httpMethod = method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(httpMethod)) {
    console.log(chalk.red(`Invalid method: ${method}. Use GET, POST, PUT, PATCH, or DELETE.`));
    return;
  }

  // Parse body
  let body: Record<string, unknown> | undefined;
  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      console.log(chalk.red("Invalid JSON body. Example: --body '{\"code\":\"const x = 1\"}'"));
      return;
    }
  }

  // Parse query params
  const params: Record<string, string> = {};
  if (options.params) {
    for (const p of options.params) {
      const [key, ...rest] = p.split("=");
      if (!key || rest.length === 0) {
        console.log(chalk.red(`Invalid param: ${p}. Use key=value format.`));
        return;
      }
      params[key] = rest.join("=");
    }
  }

  const spinner = ora("Loading SDK...").start();

  try {
    const { OpenGrant } = await import("@opengrant/sdk");

    const chainId = parseInt(options.chainId || process.env.CHAIN_ID || "84532");
    const baseUrl = getApiUrl();

    const client = new OpenGrant({
      apiKey,
      privateKey: privateKey as `0x${string}`,
      chainId,
      baseUrl,
      debug: false,
    });

    spinner.text = `Calling ${httpMethod} ${apiSlug}${path}...`;

    const startMs = Date.now();
    const response = await client.call(apiSlug, httpMethod as any, path, {
      body,
      params,
      maxPrice: options.maxPrice ? BigInt(options.maxPrice) : undefined,
    });
    const durationMs = Date.now() - startMs;

    spinner.stop();

    // Status
    console.log();
    console.log(
      chalk.bold.green("  ✓") +
      chalk.bold(` ${httpMethod} ${apiSlug}${path}`) +
      chalk.dim(` (${durationMs}ms)`)
    );

    // Payment info
    if (response.payment) {
      const amountNum = Number(response.payment.amount) / 1_000_000;
      console.log(
        chalk.dim("  Payment: ") +
        chalk.yellow(`$${amountNum.toFixed(6)} USDC`) +
        (response.payment.txHash ? chalk.dim(` tx: ${response.payment.txHash.substring(0, 18)}...`) : "")
      );
    } else {
      console.log(chalk.dim("  Payment: free"));
    }

    // Response data
    console.log();
    const jsonStr = JSON.stringify(response.data, null, 2);
    console.log(jsonStr);
    console.log();
  } catch (error: any) {
    spinner.fail(chalk.red(`Request failed: ${error.message}`));
    if (error.code) {
      console.log(chalk.dim(`  Error code: ${error.code}`));
    }
    if (error.status) {
      console.log(chalk.dim(`  HTTP status: ${error.status}`));
    }
  }
}
