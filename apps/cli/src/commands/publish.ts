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
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Failed: ${response.statusText}`);
    }

    const data = await response.json() as { githubUsername: string; githubId: string };
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

export async function activateApi(slug: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const spinner = ora("Activating API...").start();

  try {
    const apiUrl = getApiUrl();
    const token = getToken();

    // First resolve slug → API info
    const lookupResp = await fetch(`${apiUrl}/v1/apis/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!lookupResp.ok) {
      throw new Error(lookupResp.status === 404 ? `API "${slug}" not found` : `Failed to look up API: ${lookupResp.statusText}`);
    }

    const api = await lookupResp.json() as { id: string; name?: string };

    // Publish the API
    const publishResp = await fetch(`${apiUrl}/v1/publisher/apis/${api.id}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!publishResp.ok) {
      const body = await publishResp.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Failed: ${publishResp.statusText}`);
    }

    const result = await publishResp.json() as { name?: string; status?: string };
    spinner.succeed(chalk.green(`API "${result.name || slug}" is now active`));
    console.log(chalk.dim(`  Status: ${result.status}`));
  } catch (error) {
    spinner.fail(chalk.red("Failed to activate API"));
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
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `Failed: ${response.statusText}`);
    }

    const api = await response.json() as { name: string; slug: string; status: string };
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
