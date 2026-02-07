import chalk from "chalk";
import { clearCredentials, isAuthenticated, getWalletAddress } from "../config.js";

export async function logout(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.yellow("Not logged in"));
    return;
  }

  const address = getWalletAddress();
  clearCredentials();

  console.log(chalk.green(`✓ Logged out from ${address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "account"}`));
}
