import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { isAuthenticated, getToken, getApiUrl } from "../config.js";

interface KeysOptions {
  name?: string;
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiUrl = getApiUrl();
  const token = getToken();

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string; message?: string };
    throw new Error(error.error || error.message || "Request failed");
  }

  return response.json() as Promise<T>;
}

export async function createKey(options: KeysOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  let name = options.name;

  if (!name) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Enter a name for this API key:",
        default: "my-api-key",
        validate: (input: string) => {
          if (!input || input.length < 2) {
            return "Name must be at least 2 characters";
          }
          return true;
        },
      },
    ]);
    name = answers.name;
  }

  const spinner = ora("Creating API key...").start();

  try {
    const data = await apiRequest("/v1/consumer/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    spinner.succeed(chalk.green("API key created successfully!"));
    console.log();
    console.log(chalk.bold("Your API Key:"));
    console.log(chalk.cyan(data.key));
    console.log();
    console.log(chalk.dim("Add this to your .env file:"));
    console.log(chalk.dim(`OPENGRANT_API_KEY=${data.key}`));
    console.log();
    console.log(chalk.yellow("⚠️  This is the only time you'll see this key. Save it securely!"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to create API key"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}

export async function listKeys(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const spinner = ora("Fetching API keys...").start();

  try {
    const keys = await apiRequest("/v1/consumer/keys");

    spinner.stop();

    if (!Array.isArray(keys) || keys.length === 0) {
      console.log(chalk.yellow("No API keys found. Create one with `opengrant keys create`"));
      return;
    }

    console.log(chalk.bold("\nYour API Keys:\n"));
    console.log(
      chalk.dim("ID".padEnd(10)) +
        chalk.dim("Name".padEnd(20)) +
        chalk.dim("Prefix".padEnd(15)) +
        chalk.dim("Created".padEnd(15)) +
        chalk.dim("Last Used")
    );
    console.log(chalk.dim("-".repeat(75)));

    for (const key of keys) {
      const createdAt = new Date(key.createdAt).toLocaleDateString();
      const lastUsed = key.lastUsedAt
        ? new Date(key.lastUsedAt).toLocaleDateString()
        : "Never";

      console.log(
        key.id.slice(0, 8).padEnd(10) +
          key.name.slice(0, 18).padEnd(20) +
          chalk.cyan(key.prefix.padEnd(15)) +
          createdAt.padEnd(15) +
          lastUsed
      );
    }

    console.log();
  } catch (error) {
    spinner.fail(chalk.red("Failed to fetch API keys"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}

export async function revokeKey(keyId?: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  if (!keyId) {
    // List keys and let user select
    const spinner = ora("Fetching API keys...").start();

    try {
      const keys = await apiRequest("/v1/consumer/keys");
      spinner.stop();

      if (!Array.isArray(keys) || keys.length === 0) {
        console.log(chalk.yellow("No API keys to revoke."));
        return;
      }

      const { selectedKey } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedKey",
          message: "Select a key to revoke:",
          choices: keys.map((key: any) => ({
            name: `${key.name} (${key.prefix}...)`,
            value: key.id,
          })),
        },
      ]);

      keyId = selectedKey;
    } catch (error) {
      spinner.fail(chalk.red("Failed to fetch API keys"));
      console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
      return;
    }
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: chalk.yellow("Are you sure you want to revoke this key? This cannot be undone."),
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.dim("Cancelled"));
    return;
  }

  const spinner = ora("Revoking API key...").start();

  try {
    await apiRequest(`/v1/consumer/keys/${keyId}`, {
      method: "DELETE",
    });

    spinner.succeed(chalk.green("API key revoked successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to revoke API key"));
    console.error(chalk.dim(`  ${error instanceof Error ? error.message : "Unknown error"}`));
  }
}
