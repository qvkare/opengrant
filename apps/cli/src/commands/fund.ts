import chalk from "chalk";
import ora from "ora";
import open from "open";
import inquirer from "inquirer";
import { isAuthenticated, getWalletAddress, getWebUrl, getApiUrl, getToken } from "../config.js";

interface FundOptions {
  headless?: boolean;
}

export async function fund(amount: string, options: FundOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log(chalk.red("Invalid amount. Please provide a positive number."));
    console.log(chalk.dim("  Example: opengrant fund 50"));
    return;
  }

  if (parsedAmount < 1) {
    console.log(chalk.yellow("Minimum funding amount is $1.00"));
    return;
  }

  const walletAddress = getWalletAddress();

  console.log();
  console.log(chalk.bold(`Fund Account: $${parsedAmount.toFixed(2)} USDC`));
  console.log(chalk.dim(`Wallet: ${walletAddress}`));
  console.log();

  if (options.headless) {
    // Headless mode - show wallet address for direct transfer
    console.log(chalk.yellow("Headless Mode - Direct Transfer"));
    console.log();
    console.log(chalk.dim("Send USDC (Base network) to:"));
    console.log(chalk.cyan(walletAddress));
    console.log();
    console.log(chalk.dim("Network: Base (Chain ID: 8453)"));
    console.log(chalk.dim("Token: USDC (0x833589fcd6edb6e08f4c7c32d4f71b54bda02913)"));
    console.log();
    console.log(chalk.yellow("⚠️  Make sure you're sending on Base network, not Ethereum mainnet!"));

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "Have you completed the transfer?",
        default: false,
      },
    ]);

    if (confirmed) {
      const spinner = ora("Checking balance...").start();

      // Poll the balance endpoint for changes
      const token = getToken();
      const apiUrl = getApiUrl();
      let detected = false;

      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          const res = await fetch(`${apiUrl}/v1/consumer/balance`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json() as { usdc?: string };
            const usdcBalance = parseFloat(data.usdc || "0");
            if (usdcBalance > 0) {
              spinner.succeed(
                chalk.green(`Balance detected: ${usdcBalance.toFixed(2)} USDC`)
              );
              detected = true;
              break;
            }
          }
        } catch {
          // Retry on network errors
        }
        spinner.text = `Checking balance... (attempt ${attempt + 2}/6)`;
      }

      if (!detected) {
        spinner.warn(chalk.yellow("Could not detect the transfer yet."));
        console.log(chalk.dim("  It may take a few minutes to appear. Run `opengrant balance` to check later."));
      }
    }
  } else {
    // Browser mode - open Coinbase Onramp
    const webUrl = getWebUrl();
    const fundUrl = `${webUrl}/fund?amount=${parsedAmount}&wallet=${walletAddress}`;

    console.log(chalk.dim("Opening Coinbase Onramp in browser..."));
    console.log();

    const spinner = ora("Waiting for funding to complete...").start();

    try {
      await open(fundUrl);

      console.log(chalk.dim(`\nIf browser doesn't open, visit: ${fundUrl}\n`));

      // Poll for balance change (simplified - in production, use webhooks)
      const { completed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "completed",
          message: "Did you complete the funding in the browser?",
          default: true,
        },
      ]);

      if (completed) {
        spinner.succeed(chalk.green(`Successfully funded $${parsedAmount.toFixed(2)} USDC`));
        console.log(chalk.dim("  Run `opengrant balance` to see your updated balance."));
      } else {
        spinner.warn(chalk.yellow("Funding not completed"));
        console.log(chalk.dim("  You can try again anytime with `opengrant fund <amount>`"));
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to open browser"));
      console.log(chalk.dim(`  Visit ${fundUrl} to complete funding manually.`));
    }
  }
}
