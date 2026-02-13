import chalk from "chalk";
import ora from "ora";
import { isAuthenticated, getToken, getApiUrl } from "../config.js";

interface VerifyGithubOptions {
  token?: string;
}

interface CreateApiOptions {
  name: string;
  slug: string;
  url: string;
  githubRepo?: string;
  githubToken?: string;
  description?: string;
}

async function promptGithubToken(option?: string): Promise<string> {
  if (option) return option;

  // Read from env as fallback
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) return envToken;

  console.log(chalk.red("GitHub personal access token required."));
  console.log(chalk.dim("  Pass --token <PAT> or set GITHUB_TOKEN env variable"));
  process.exit(1);
}

export async function verifyGithub(options: VerifyGithubOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const githubToken = await promptGithubToken(options.token);
  const spinner = ora("Verifying GitHub identity...").start();

  try {
    const apiUrl = getApiUrl();
    const token = getToken();

    const response = await fetch(`${apiUrl}/v1/publisher/verify-github`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Token": githubToken,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Failed: ${response.statusText}`);
    }

    const data = await response.json();
    spinner.succeed(chalk.green(`GitHub verified as @${data.githubUsername}`));
    console.log(chalk.dim(`  GitHub ID: ${data.githubId}`));
    console.log(chalk.dim(`  You can now link GitHub repos to your APIs`));
  } catch (error) {
    spinner.fail(chalk.red("GitHub verification failed"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}

export async function createApi(options: CreateApiOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  if (!options.name || !options.slug || !options.url) {
    console.log(chalk.red("Missing required options: --name, --slug, --url"));
    return;
  }

  const spinner = ora("Creating API...").start();

  try {
    const apiUrl = getApiUrl();
    const token = getToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (options.githubRepo) {
      const githubToken = await promptGithubToken(options.githubToken);
      headers["X-GitHub-Token"] = githubToken;
    }

    const body: Record<string, any> = {
      name: options.name,
      slug: options.slug,
      baseUrl: options.url,
    };
    if (options.description) body.description = options.description;
    if (options.githubRepo) body.githubRepo = options.githubRepo;

    const response = await fetch(`${apiUrl}/v1/publisher/apis`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed: ${response.statusText}`);
    }

    const api = await response.json();
    spinner.succeed(chalk.green(`API created: ${api.name}`));
    console.log(chalk.dim(`  Slug: ${api.slug}`));
    console.log(chalk.dim(`  Status: ${api.status}`));
    if (options.githubRepo) {
      console.log(chalk.dim(`  GitHub Repo: ${options.githubRepo}`));
    }
    console.log();
    console.log(chalk.dim("  Publish with: ") + chalk.cyan(`opengrant publish activate ${api.slug}`));
  } catch (error) {
    spinner.fail(chalk.red("Failed to create API"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}
