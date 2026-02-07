import chalk from "chalk";
import ora from "ora";
import { isAuthenticated, getToken, getApiUrl, getWalletAddress } from "../config.js";

export async function balance(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const spinner = ora("Fetching balance...").start();

  try {
    const apiUrl = getApiUrl();
    const token = getToken();

    const response = await fetch(`${apiUrl}/v1/consumers/me/balance`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch balance");
    }

    const data = await response.json();

    spinner.stop();

    const walletAddress = getWalletAddress();
    console.log();
    console.log(chalk.bold("Account Balance"));
    console.log(chalk.dim(`Wallet: ${walletAddress}`));
    console.log();

    // Platform credit balance
    console.log(
      chalk.dim("Platform Credits:  ") +
        chalk.bold(chalk.green(`$${parseFloat(data.creditBalance || "0").toFixed(2)}`)) +
        chalk.dim(" USDC")
    );

    // On-chain wallet balance
    console.log(
      chalk.dim("Wallet Balance:    ") +
        chalk.bold(`$${parseFloat(data.walletBalance || "0").toFixed(2)}`) +
        chalk.dim(" USDC")
    );

    console.log();

    // This month's usage
    if (data.monthlyUsage !== undefined) {
      console.log(chalk.dim("This Month's Usage:"));
      console.log(
        chalk.dim("  API Calls:       ") + chalk.bold(data.monthlyUsage.calls || 0)
      );
      console.log(
        chalk.dim("  Total Spent:     ") +
          chalk.bold(`$${parseFloat(data.monthlyUsage.spent || "0").toFixed(2)}`)
      );
    }

    console.log();
    console.log(chalk.dim("Fund your account: opengrant fund <amount>"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to fetch balance"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}
