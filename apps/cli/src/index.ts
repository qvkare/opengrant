#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { createKey, listKeys, revokeKey } from "./commands/keys.js";
import { balance } from "./commands/balance.js";
import { fund } from "./commands/fund.js";
import { stats } from "./commands/stats.js";
import { init } from "./commands/init.js";
import { configGet, configSet, configList } from "./commands/config-cmd.js";

const program = new Command();

program
  .name("opengrant")
  .description("OpenGrant CLI - Monetize your APIs with x402 micropayments")
  .version("0.1.0");

// ========================
// Authentication Commands
// ========================

program
  .command("login")
  .description("Log in to your OpenGrant account")
  .option("--headless", "Use terminal-only authentication (private key)")
  .action(login);

program
  .command("logout")
  .description("Log out of your OpenGrant account")
  .action(logout);

// ========================
// API Key Commands
// ========================

const keysCommand = program
  .command("keys")
  .description("Manage API keys");

keysCommand
  .command("create")
  .description("Create a new API key")
  .option("-n, --name <name>", "Name for the API key")
  .action(createKey);

keysCommand
  .command("list")
  .description("List all API keys")
  .action(listKeys);

keysCommand
  .command("revoke <keyId>")
  .description("Revoke an API key")
  .action(revokeKey);

// ========================
// Wallet Commands
// ========================

program
  .command("balance")
  .description("Check your USDC balance")
  .action(balance);

program
  .command("fund <amount>")
  .description("Fund your wallet with USDC")
  .option("--headless", "Use direct transfer instead of browser-based onramp")
  .action(fund);

// ========================
// Usage & Stats Commands
// ========================

program
  .command("stats")
  .description("View usage statistics")
  .option("-a, --api <slug>", "Filter by specific API")
  .option("-p, --period <period>", "Time period (7d, 30d, 90d)", "30d")
  .action(stats);

// ========================
// Project Commands
// ========================

program
  .command("init")
  .description("Initialize OpenGrant in current project")
  .option("-f, --force", "Overwrite existing config")
  .action(init);

// ========================
// Config Commands
// ========================

const configCommand = program
  .command("config")
  .description("Manage project configuration");

configCommand
  .command("get <key>")
  .description("Get a config value")
  .action(configGet);

configCommand
  .command("set <key> <value>")
  .description("Set a config value")
  .action(configSet);

configCommand
  .command("list")
  .description("List all config values")
  .action(configList);

// ========================
// Help & Info
// ========================

program
  .command("whoami")
  .description("Show current logged in user")
  .action(async () => {
    const { isAuthenticated, getWalletAddress } = await import("./config.js");

    if (!isAuthenticated()) {
      console.log(chalk.dim("Not logged in"));
      console.log(chalk.dim("  Run `opengrant login` to authenticate"));
      return;
    }

    const address = getWalletAddress();
    console.log(chalk.cyan(address));
  });

// Add some examples to help
program.addHelpText(
  "after",
  `
${chalk.bold("Examples:")}
  ${chalk.dim("# Log in with browser popup")}
  $ opengrant login

  ${chalk.dim("# Log in with private key (headless)")}
  $ opengrant login --headless

  ${chalk.dim("# Create an API key")}
  $ opengrant keys create --name "my-app"

  ${chalk.dim("# Fund your wallet with $50")}
  $ opengrant fund 50

  ${chalk.dim("# View usage stats")}
  $ opengrant stats

  ${chalk.dim("# View stats for a specific API")}
  $ opengrant stats --api tailwind

${chalk.bold("Documentation:")}
  ${chalk.cyan("https://docs.opengrant.dev/cli")}
`
);

program.parse();
