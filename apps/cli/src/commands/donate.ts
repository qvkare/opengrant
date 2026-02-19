import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import { isAuthenticated, getToken, getApiUrl } from "../config.js";

interface DonateOptions {
  privateKey?: string;
  redistribute?: boolean;
}

async function readProjectConfig(): Promise<{ tipPercentage?: number }> {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    try {
      const content = await fs.readFile(path.join(dir, ".opengrantrc.json"), "utf-8");
      return JSON.parse(content);
    } catch {
      dir = path.dirname(dir);
    }
  }
  return {};
}

function getPrivateKey(options: DonateOptions): `0x${string}` | null {
  const key = options.privateKey || process.env.OPENGRANT_PRIVATE_KEY;
  if (!key) return null;
  if (!key.startsWith("0x") || key.length !== 66) {
    console.log(chalk.red("Invalid private key format. Should start with 0x and be 66 characters."));
    return null;
  }
  return key as `0x${string}`;
}

export async function donate(repo: string, amount: string, options: DonateOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  // Parse repo
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    console.log(chalk.red("Invalid repo format. Use owner/name (e.g. facebook/react)"));
    return;
  }
  const [repoOwner, repoName] = parts;

  // Parse amount
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 1) {
    console.log(chalk.red("Invalid amount. Minimum donation is 1 USDC."));
    return;
  }

  // Get private key
  const privateKey = getPrivateKey(options);
  if (!privateKey) {
    console.log(chalk.red("Private key required for on-chain transactions."));
    console.log(chalk.dim("  Set OPENGRANT_PRIVATE_KEY env var or use --private-key flag"));
    return;
  }

  const token = getToken()!;
  const apiUrl = getApiUrl();

  console.log();
  console.log(chalk.bold(`Donate to ${chalk.cyan(repo)}`));
  console.log(chalk.dim(`Amount: ${parsedAmount.toFixed(2)} USDC`));
  console.log(chalk.dim(`Chain: Base Sepolia (testnet)`));
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Donate $${parsedAmount.toFixed(2)} USDC to ${repo}?`,
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Cancelled"));
    return;
  }

  const spinner = ora("Initializing SDK...").start();

  try {
    // Dynamic import to avoid loading viem etc. unnecessarily
    const { OpenGrant } = await import("@opengrant/sdk");
    const projectConfig = await readProjectConfig();

    const client = new OpenGrant({
      apiKey: token,
      baseUrl: apiUrl,
      privateKey,
      chainId: 84532, // Base Sepolia
      debug: false,
      tipPercentage: projectConfig.tipPercentage,
      onTip: (result) => {
        if (result.success) {
          console.log(chalk.dim(`  Auto-tip: ${result.amount} USDC to ${result.repo}`));
        } else {
          console.log(chalk.dim(`  Auto-tip failed: ${result.error}`));
        }
      },
    });

    spinner.text = "Checking balance and allowance...";

    const result = await client.donate({
      repoOwner,
      repoName,
      amount: parsedAmount.toFixed(2),
      redistributeOnTimeout: options.redistribute ?? false,
    });

    spinner.succeed(chalk.green(`Donated $${parsedAmount.toFixed(2)} USDC to ${repo}`));
    console.log(chalk.dim(`  Tx: ${result.txHash}`));
    console.log(chalk.dim(`  View: https://sepolia.basescan.org/tx/${result.txHash}`));
  } catch (error: any) {
    spinner.fail(chalk.red("Donation failed"));
    console.log(chalk.dim(`  ${error.message || error}`));
  }
}

export async function claimFunds(options: { privateKey?: string; githubToken?: string }): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const privateKey = getPrivateKey(options);
  if (!privateKey) {
    console.log(chalk.red("Private key required for on-chain transactions."));
    console.log(chalk.dim("  Set OPENGRANT_PRIVATE_KEY env var or use --private-key flag"));
    return;
  }

  // Get GitHub token
  let githubToken = options.githubToken || process.env.GITHUB_TOKEN;
  if (!githubToken) {
    const answers = await inquirer.prompt([
      {
        type: "password",
        name: "githubToken",
        message: "Enter your GitHub personal access token (repo scope):",
        mask: "*",
        validate: (input: string) => input.startsWith("ghp_") || input.startsWith("github_pat_") || "Token should start with ghp_ or github_pat_",
      },
    ]);
    githubToken = answers.githubToken;
  }

  const token = getToken()!;
  const apiUrl = getApiUrl();

  const spinner = ora("Fetching your GitHub repos...").start();

  try {
    // Fetch user's repos from GitHub
    const ghRes = await fetch(
      "https://api.github.com/user/repos?type=owner&sort=stars&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!ghRes.ok) {
      spinner.fail(chalk.red("Invalid GitHub token"));
      return;
    }

    const ghRepos = await ghRes.json() as any[];
    const ownerRepoNames = new Set(
      ghRepos.map((r: any) => `${r.owner.login}/${r.name}`.toLowerCase())
    );

    // Fetch funded repos from backend
    spinner.text = "Checking for claimable repos...";
    const fundedRepos: any[] = [];
    let offset = 0;
    const pageSize = 100;
    while (true) {
      const res = await fetch(`${apiUrl}/v1/fund/repos?limit=${pageSize}&offset=${offset}`);
      if (!res.ok) break;
      const data = await res.json() as any;
      fundedRepos.push(...data.data);
      if (data.data.length < pageSize) break;
      offset += pageSize;
    }

    // Find claimable repos (user owns AND has funds AND not claimed)
    const claimable = fundedRepos.filter(
      (repo: any) =>
        ownerRepoNames.has(`${repo.owner}/${repo.name}`.toLowerCase()) &&
        parseFloat(repo.totalFunded || "0") > 0 &&
        repo.claimStatus !== "claimed" &&
        repo.claimStatus !== "opted_out"
    );

    if (claimable.length === 0) {
      spinner.info(chalk.yellow("No claimable repos found."));
      console.log(chalk.dim("  Either your repos have no funds or they've already been claimed."));
      return;
    }

    spinner.succeed(`Found ${claimable.length} claimable repo(s)`);
    console.log();

    // Show claimable repos
    for (const repo of claimable) {
      console.log(
        `  ${chalk.cyan(`${repo.owner}/${repo.name}`)} — ` +
        chalk.green(`$${parseFloat(repo.totalFunded).toFixed(2)} USDC`) +
        chalk.dim(` (${repo.donorCount} donor${repo.donorCount !== 1 ? "s" : ""})`)
      );
    }
    console.log();

    // Ask which to claim
    const { selectedRepos } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedRepos",
        message: "Select repos to claim:",
        choices: claimable.map((r: any) => ({
          name: `${r.owner}/${r.name} ($${parseFloat(r.totalFunded).toFixed(2)})`,
          value: r,
          checked: true,
        })),
      },
    ]);

    if (selectedRepos.length === 0) {
      console.log(chalk.yellow("No repos selected"));
      return;
    }

    // Initialize SDK
    const { OpenGrant } = await import("@opengrant/sdk");
    const projectConfig = await readProjectConfig();
    const client = new OpenGrant({
      apiKey: token,
      baseUrl: apiUrl,
      privateKey,
      chainId: 84532,
      debug: false,
      tipPercentage: projectConfig.tipPercentage,
    });

    // Claim each selected repo
    for (const repo of selectedRepos) {
      const claimSpinner = ora(`Claiming ${repo.owner}/${repo.name}...`).start();
      try {
        const result = await client.claim({
          repoOwner: repo.owner,
          repoName: repo.name,
          githubToken: githubToken!,
        });

        claimSpinner.succeed(
          chalk.green(`Claimed ${repo.owner}/${repo.name} — $${parseFloat(repo.totalFunded).toFixed(2)} USDC`)
        );
        console.log(chalk.dim(`  Tx: ${result.txHash}`));
      } catch (err: any) {
        claimSpinner.fail(chalk.red(`Failed to claim ${repo.owner}/${repo.name}: ${err.message}`));
      }
    }

    console.log();
    console.log(chalk.green("Done!"));
  } catch (error: any) {
    spinner.fail(chalk.red("Claim failed"));
    console.log(chalk.dim(`  ${error.message || error}`));
  }
}
