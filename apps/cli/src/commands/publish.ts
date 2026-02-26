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

interface AddEndpointOptions {
  path: string;
  method?: string;
  price: string;
  description?: string;
}

interface ApiInfo {
  id: string;
  slug: string;
  name: string;
  status: string;
  baseUrl?: string;
  endpoints?: { id: string; path: string; method: string; pricePerCall: number }[];
}

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status: number; data: any }> {
  if (!isAuthenticated()) {
    throw new Error("Not logged in. Run `opengrant login` first.");
  }

  const apiUrl = getApiUrl();
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any).error || `Failed: ${response.statusText}`);
  }

  return { ok: true, status: response.status, data };
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

    // Resolve slug → API info via publisher endpoint (includes draft APIs)
    const lookupResp = await fetch(`${apiUrl}/v1/publisher/apis`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!lookupResp.ok) {
      throw new Error(`Failed to list your APIs: ${lookupResp.statusText}`);
    }

    const allApis = await lookupResp.json() as { id: string; slug: string; name?: string; status?: string }[];
    const api = allApis.find((a) => a.slug === slug);

    if (!api) {
      throw new Error(`API "${slug}" not found. Make sure you own this API.`);
    }

    if (api.status === "active") {
      spinner.info(chalk.yellow(`API "${api.name || slug}" is already active`));
      return;
    }

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

    const result = await publishResp.json() as { success?: boolean; status?: string; publishedAt?: string };
    spinner.succeed(chalk.green(`API "${api.name || slug}" is now active`));
    console.log(chalk.dim(`  Status: ${result.status}`));
    if (result.publishedAt) {
      console.log(chalk.dim(`  Published at: ${result.publishedAt}`));
    }
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

export async function listApis(): Promise<ApiInfo[]> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return [];
  }

  const spinner = ora("Fetching your APIs...").start();

  try {
    const { data } = await apiRequest("GET", "/v1/publisher/apis");
    const apis = data as ApiInfo[];

    if (apis.length === 0) {
      spinner.info(chalk.yellow("No APIs found. Create one with `opengrant publish create-api`"));
      return [];
    }

    spinner.succeed(chalk.green(`Found ${apis.length} API(s)`));
    console.log();

    const slugWidth = Math.max(6, ...apis.map((a) => a.slug.length));
    const nameWidth = Math.max(6, ...apis.map((a) => (a.name || "").length));

    console.log(
      chalk.bold(
        `  ${"SLUG".padEnd(slugWidth)}  ${"NAME".padEnd(nameWidth)}  ${"STATUS".padEnd(10)}  ${"ENDPOINTS".padEnd(10)}  BASE URL`
      )
    );

    for (const api of apis) {
      const statusColor = api.status === "active" ? chalk.green : chalk.yellow;
      const endpointCount = api.endpoints?.length ?? 0;
      console.log(
        `  ${api.slug.padEnd(slugWidth)}  ${(api.name || "").padEnd(nameWidth)}  ${statusColor(
          (api.status || "draft").padEnd(10)
        )}  ${String(endpointCount).padEnd(10)}  ${chalk.dim(api.baseUrl || "-")}`
      );
    }

    return apis;
  } catch (error) {
    spinner.fail(chalk.red("Failed to list APIs"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
    return [];
  }
}

export async function addEndpoint(slug: string, options: AddEndpointOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  if (!options.path || !options.price) {
    console.log(chalk.red("Missing required options: --path, --price"));
    return;
  }

  const priceUsd = parseFloat(options.price);
  if (isNaN(priceUsd) || priceUsd < 0) {
    console.log(chalk.red("Invalid price. Enter a non-negative USD value (e.g. 0.001)"));
    return;
  }
  const pricePerCall = Math.round(priceUsd * 1_000_000);

  const spinner = ora("Adding endpoint...").start();

  try {
    // Resolve slug → API id
    const { data: apis } = await apiRequest("GET", "/v1/publisher/apis");
    const api = (apis as ApiInfo[]).find((a) => a.slug === slug);

    if (!api) {
      throw new Error(`API "${slug}" not found. Make sure you own this API.`);
    }

    const body: Record<string, unknown> = {
      path: options.path,
      method: (options.method || "GET").toUpperCase(),
      pricePerCall,
    };
    if (options.description) body.description = options.description;

    const { data } = await apiRequest("POST", `/v1/apis/${api.id}/endpoints`, body);

    spinner.succeed(chalk.green(`Endpoint added to "${api.name || slug}"`));
    console.log(chalk.dim(`  Path: ${body.method} ${options.path}`));
    console.log(chalk.dim(`  Price: $${priceUsd.toFixed(6)} per call (${pricePerCall} subunits)`));
    if (options.description) {
      console.log(chalk.dim(`  Description: ${options.description}`));
    }
  } catch (error) {
    spinner.fail(chalk.red("Failed to add endpoint"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}
