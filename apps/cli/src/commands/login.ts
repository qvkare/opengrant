import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { config, setCredentials, getWebUrl, getApiUrl, isAuthenticated, getWalletAddress } from "../config.js";
import { randomBytes } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface LoginOptions {
  headless?: boolean;
}

/**
 * Generate a random session ID for browser auth
 */
function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Open URL in default browser (cross-platform)
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  if (platform === "win32") {
    command = `start "" "${url}"`;
  } else if (platform === "darwin") {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  try {
    await execAsync(command);
  } catch {
    // Silently fail if browser can't be opened
  }
}

/**
 * Poll for auth completion from browser
 */
async function pollForAuth(sessionId: string): Promise<{ token: string; walletAddress: string } | null> {
  const apiUrl = getApiUrl();
  const maxAttempts = 60; // 2 minutes at 2-second intervals

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${apiUrl}/auth/cli/poll?session=${sessionId}`);

      if (response.ok) {
        const data = await response.json() as { authenticated?: boolean; token?: string; walletAddress?: string };
        if (data.authenticated) {
          return {
            token: data.token!,
            walletAddress: data.walletAddress!,
          };
        }
      }
    } catch {
      // Ignore errors, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return null;
}

/**
 * Browser-based login flow
 */
async function browserLogin(): Promise<void> {
  const spinner = ora("Preparing authentication...").start();

  try {
    const sessionId = generateSessionId();
    const webUrl = getWebUrl();
    const authUrl = `${webUrl}/auth/cli?session=${sessionId}`;

    spinner.text = "Opening browser...";
    await openBrowser(authUrl);

    spinner.text = "Waiting for authentication in browser...";
    console.log(chalk.dim(`\nIf browser doesn't open, visit: ${authUrl}`));

    const result = await pollForAuth(sessionId);

    if (result) {
      setCredentials(result.token, result.walletAddress);
      spinner.succeed(chalk.green(`Logged in as ${chalk.bold(formatAddress(result.walletAddress))}`));
      console.log(chalk.dim(`  Token saved to ${config.path}`));
    } else {
      spinner.fail(chalk.red("Authentication timed out"));
      console.log(chalk.dim("  Try again or use --headless mode"));
    }
  } catch (error) {
    spinner.fail(chalk.red("Authentication failed"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}

/**
 * Headless login flow (private key)
 */
async function headlessLogin(): Promise<void> {
  console.log(chalk.yellow("⚠️  Headless mode - your private key will be used locally"));
  console.log(chalk.dim("  The key is never sent to our servers.\n"));

  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "privateKey",
      message: "Enter your private key:",
      mask: "*",
      validate: (input: string) => {
        if (!input.startsWith("0x") || input.length !== 66) {
          return "Invalid private key format. Should start with 0x and be 66 characters.";
        }
        return true;
      },
    },
  ]);

  const spinner = ora("Verifying wallet...").start();

  try {
    const account = privateKeyToAccount(answers.privateKey as `0x${string}`);

    // Confirm address
    spinner.stop();
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Confirm wallet address ${chalk.cyan(account.address)}?`,
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("Login cancelled"));
      return;
    }

    spinner.start("Authenticating...");

    // Create message to sign
    const message = `OpenGrant CLI Login\nTimestamp: ${Date.now()}`;

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    const signature = await walletClient.signMessage({ account, message });

    // Verify with API
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/auth/cli/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        signature,
        address: account.address,
      }),
    });

    if (!response.ok) {
      throw new Error("Authentication failed");
    }

    const data = await response.json() as { token: string };
    setCredentials(data.token, account.address);

    spinner.succeed(chalk.green(`Logged in as ${chalk.bold(formatAddress(account.address))}`));
    console.log(chalk.dim(`  Token saved to ${config.path}`));
  } catch (error) {
    spinner.fail(chalk.red("Authentication failed"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function login(options: LoginOptions): Promise<void> {
  // Check if already logged in
  if (isAuthenticated()) {
    const address = getWalletAddress();
    console.log(chalk.yellow(`Already logged in as ${chalk.bold(formatAddress(address || ""))}`));

    const { relogin } = await inquirer.prompt([
      {
        type: "confirm",
        name: "relogin",
        message: "Do you want to log in with a different account?",
        default: false,
      },
    ]);

    if (!relogin) {
      return;
    }
  }

  if (options.headless) {
    await headlessLogin();
  } else {
    await browserLogin();
  }
}
