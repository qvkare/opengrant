import chalk from "chalk";
import inquirer from "inquirer";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { createKey, listKeys, revokeKey } from "./commands/keys.js";
import { balance } from "./commands/balance.js";
import { fund } from "./commands/fund.js";
import { donate, claimFunds } from "./commands/donate.js";
import { stats } from "./commands/stats.js";
import { init } from "./commands/init.js";
import { configGet, configSet, configList } from "./commands/config-cmd.js";
import { verifyGithub, createApi, activateApi, listApis, addEndpoint } from "./commands/publish.js";
import {
  isAuthenticated,
  getWalletAddress,
  getApiUrl,
  getWebUrl,
} from "./config.js";

const ASCII_BANNER = `
 ▗▄▖ ▗▄▄▖ ▗▄▄▄▖▗▖  ▗▖ ▗▄▄▖▗▄▄▖  ▗▄▖ ▗▖  ▗▖▗▄▄▄▖
 ▐▌ ▐▌▐▌ ▐▌▐▌   ▐▛▚▖▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▛▚▖▐▌  █
 ▐▌ ▐▌▐▛▀▘ ▐▛▀▀▘▐▌ ▝▜▌▐▌▝▜▌▐▛▀▚▖▐▛▀▜▌▐▌ ▝▜▌  █
 ▝▚▄▞▘▐▌   ▐▙▄▄▖▐▌  ▐▌▝▚▄▞▘▐▌ ▐▌▐▌ ▐▌▐▌  ▐▌  █
`;

type MainAction =
  | "account"
  | "donor"
  | "maintainer"
  | "consumer"
  | "publisher"
  | "project"
  | "settings"
  | "help"
  | "exit";

type OnboardingAction =
  | "login_browser"
  | "login_headless"
  | "donor"
  | "maintainer"
  | "consumer"
  | "publisher"
  | "skip";

function formatAddress(address?: string): string {
  if (!address) return "(unknown)";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function renderHeader(): void {
  const loggedIn = isAuthenticated();
  const wallet = getWalletAddress();

  console.clear();
  console.log(chalk.cyanBright(ASCII_BANNER));
  console.log(chalk.bold("OpenGrant Interactive CLI"));
  console.log(
    chalk.dim(
      `Status: ${loggedIn ? "Logged in" : "Not logged in"}${
        loggedIn ? ` (${formatAddress(wallet)})` : ""
      }`
    )
  );
  console.log(chalk.dim(`API: ${getApiUrl()}`));
  console.log(chalk.dim(`Web: ${getWebUrl()}`));
  console.log();
}

async function pause(message = "Press Enter to return to the menu"): Promise<void> {
  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message,
    },
  ]);
}

async function askOptionalSecret(message: string): Promise<string | undefined> {
  const { value } = await inquirer.prompt([
    {
      type: "password",
      name: "value",
      message: `${message} (leave blank to use env/default flow):`,
      mask: "*",
    },
  ]);

  return value?.trim() ? value.trim() : undefined;
}

async function askRequiredSecret(message: string): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: "password",
      name: "value",
      message,
      mask: "*",
      validate: (input: string) => !!input.trim() || "This value is required",
    },
  ]);

  return value.trim();
}

async function accountMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Account",
        choices: [
          { name: "Browser login", value: "login_browser" },
          { name: "Headless login (private key)", value: "login_headless" },
          { name: "Who am I?", value: "whoami" },
          { name: "Logout", value: "logout" },
          { name: "Back", value: "back" },
        ],
        default: "login_browser",
      },
    ]);

    if (action === "back") return;

    if (action === "login_browser") {
      await login({ headless: false });
    } else if (action === "login_headless") {
      await login({ headless: true });
    } else if (action === "whoami") {
      if (!isAuthenticated()) {
        console.log(chalk.yellow("Not logged in"));
      } else {
        console.log(chalk.cyan(getWalletAddress() || ""));
      }
    } else if (action === "logout") {
      await logout();
    }

    await pause();
  }
}

async function firstRunOnboarding(): Promise<MainAction | null> {
  if (isAuthenticated()) return null;

  renderHeader();
  console.log(chalk.bold("Get Started"));
  console.log(
    chalk.dim(
      "Choose your path. We can start with browser login and then take you to the right workflow."
    )
  );
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What do you want to do first?",
      choices: [
        { name: "Browser login (Recommended)", value: "login_browser" },
        { name: "Headless login (private key)", value: "login_headless" },
        { name: "Donate to an open source repo", value: "donor" },
        { name: "Claim funds for my repository", value: "maintainer" },
        { name: "Use paid APIs (API keys / stats)", value: "consumer" },
        { name: "Publish an API", value: "publisher" },
        { name: "Skip to main menu", value: "skip" },
      ],
      default: "login_browser",
      pageSize: 10,
    },
  ] as any);

  const selected = action as OnboardingAction;

  if (selected === "login_browser") {
    await login({ headless: false });
    await pause();
    return null;
  }

  if (selected === "login_headless") {
    await login({ headless: true });
    await pause();
    return null;
  }

  if (selected === "skip") {
    return null;
  }

  if (selected === "donor") return "donor";
  if (selected === "maintainer") return "maintainer";
  if (selected === "consumer") return "consumer";
  return "publisher";
}

async function donorMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Donor",
        choices: [
          { name: "Donate to a repository", value: "donate" },
          { name: "Fund wallet", value: "fund" },
          { name: "Check balance", value: "balance" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    if (action === "donate") {
      const answers = await inquirer.prompt<{
        repo: string;
        amount: string;
        redistribute: boolean;
      }>([
        {
          type: "input",
          name: "repo",
          message: "Repository (owner/name):",
          validate: (input: string) =>
            /^[^/\s]+\/[^/\s]+$/.test(input.trim()) ||
            "Use owner/name (example: facebook/react)",
        },
        {
          type: "input",
          name: "amount",
          message: "Amount (USDC):",
          default: "10",
          validate: (input: string) =>
            (!isNaN(parseFloat(input)) && parseFloat(input) > 0) ||
            "Enter a positive number",
        },
        {
          type: "confirm",
          name: "redistribute",
          message: "Allow redistribution if unclaimed after 1 year?",
          default: false,
        },
      ]);

      const privateKey = await askOptionalSecret("Private key");
      await donate(answers.repo.trim(), answers.amount.trim(), {
        privateKey,
        redistribute: answers.redistribute,
      });
    } else if (action === "fund") {
      const answers = await inquirer.prompt<{ amount: string; headless: boolean }>([
        {
          type: "input",
          name: "amount",
          message: "Fund amount (USDC):",
          default: "50",
          validate: (input: string) =>
            (!isNaN(parseFloat(input)) && parseFloat(input) > 0) ||
            "Enter a positive number",
        },
        {
          type: "confirm",
          name: "headless",
          message: "Use headless mode (manual transfer)?",
          default: false,
        },
      ]);
      await fund(answers.amount.trim(), { headless: answers.headless });
    } else if (action === "balance") {
      await balance();
    }

    await pause();
  }
}

async function maintainerMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Maintainer (Claim Funds)",
        choices: [
          { name: "Claim escrow funds for owned repositories", value: "claim" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    const privateKey = await askOptionalSecret("Private key");
    const githubToken = await askOptionalSecret("GitHub PAT (repo scope)");
    await claimFunds({ privateKey, githubToken });
    await pause();
  }
}

async function consumerMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "API Consumer",
        choices: [
          { name: "Create API key", value: "keys_create" },
          { name: "List API keys", value: "keys_list" },
          { name: "Revoke API key", value: "keys_revoke" },
          { name: "Usage stats", value: "stats" },
          { name: "Check balance", value: "balance" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    if (action === "keys_create") {
      const { name } = await inquirer.prompt<{ name: string }>([
        {
          type: "input",
          name: "name",
          message: "API key name (optional):",
          default: "my-api-key",
        },
      ]);
      await createKey({ name: name.trim() || undefined });
    } else if (action === "keys_list") {
      await listKeys();
    } else if (action === "keys_revoke") {
      await revokeKey();
    } else if (action === "stats") {
      const answers = await inquirer.prompt<{ api: string; period: string }>([
        {
          type: "input",
          name: "api",
          message: "API slug filter (optional):",
          default: "",
        },
        {
          type: "list",
          name: "period",
          message: "Period:",
          choices: ["7d", "30d", "90d"],
          default: "30d",
        },
      ]);
      await stats({
        api: answers.api.trim() || undefined,
        period: answers.period,
      });
    } else if (action === "balance") {
      await balance();
    }

    await pause();
  }
}

async function promptEndpointDetails(): Promise<{
  path: string;
  method: string;
  price: string;
  description?: string;
}> {
  const answers = await inquirer.prompt<{
    path: string;
    method: string;
    price: string;
    description: string;
  }>([
    {
      type: "input",
      name: "path",
      message: "Endpoint path (e.g. /analyze):",
      validate: (input: string) =>
        input.trim().startsWith("/") || "Path must start with /",
    },
    {
      type: "list",
      name: "method",
      message: "HTTP method:",
      choices: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      default: "GET",
    },
    {
      type: "input",
      name: "price",
      message: "Price per call in USD (e.g. 0.001):",
      default: "0.001",
      validate: (input: string) => {
        const n = parseFloat(input);
        return (!isNaN(n) && n >= 0) || "Enter a non-negative number";
      },
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional):",
      default: "",
    },
  ]);

  return {
    path: answers.path.trim(),
    method: answers.method,
    price: answers.price.trim(),
    description: answers.description.trim() || undefined,
  };
}

async function guidedCreateAndPublish(): Promise<void> {
  console.log(chalk.bold("\nGuided: Create & Publish API\n"));

  // Step 1: Create the API
  const apiAnswers = await inquirer.prompt<{
    name: string;
    slug: string;
    url: string;
    description: string;
    githubRepo: string;
  }>([
    { type: "input", name: "name", message: "API name:" },
    {
      type: "input",
      name: "slug",
      message: "API slug:",
      validate: (input: string) =>
        /^[a-z0-9-]+$/.test(input.trim()) ||
        "Use lowercase letters, numbers, hyphens",
    },
    {
      type: "input",
      name: "url",
      message: "API base URL:",
      validate: (input: string) =>
        /^https?:\/\//.test(input.trim()) || "Enter a valid http(s) URL",
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional):",
      default: "",
    },
    {
      type: "input",
      name: "githubRepo",
      message: "GitHub repo to link (owner/name, optional):",
      default: "",
    },
  ]);

  let githubToken: string | undefined;
  if (apiAnswers.githubRepo.trim()) {
    githubToken = await askRequiredSecret("GitHub PAT for repo linking:");
  }

  await createApi({
    name: apiAnswers.name.trim(),
    slug: apiAnswers.slug.trim(),
    url: apiAnswers.url.trim(),
    description: apiAnswers.description.trim() || undefined,
    githubRepo: apiAnswers.githubRepo.trim() || undefined,
    githubToken,
  });

  // Step 2: Add endpoints loop
  let addMore = true;
  while (addMore) {
    const { wantEndpoint } = await inquirer.prompt<{ wantEndpoint: boolean }>([
      {
        type: "confirm",
        name: "wantEndpoint",
        message: "Add an endpoint?",
        default: true,
      },
    ]);

    if (!wantEndpoint) break;

    const ep = await promptEndpointDetails();
    const priceUsd = parseFloat(ep.price);
    console.log(
      chalk.dim(
        `  Will send: ${ep.method} ${ep.path} @ $${priceUsd.toFixed(6)}/call`
      )
    );

    await addEndpoint(apiAnswers.slug.trim(), {
      path: ep.path,
      method: ep.method,
      price: ep.price,
      description: ep.description,
    });
  }

  // Step 3: Activate
  const { wantActivate } = await inquirer.prompt<{ wantActivate: boolean }>([
    {
      type: "confirm",
      name: "wantActivate",
      message: "Activate this API now?",
      default: true,
    },
  ]);

  if (wantActivate) {
    await activateApi(apiAnswers.slug.trim());
  }
}

async function addEndpointToExistingApi(): Promise<void> {
  console.log(chalk.bold("\nAdd Endpoint to Existing API\n"));

  const apis = await listApis();
  if (apis.length === 0) return;

  console.log();
  const { slug } = await inquirer.prompt<{ slug: string }>([
    {
      type: "list",
      name: "slug",
      message: "Select an API:",
      choices: apis.map((a) => ({
        name: `${a.slug} (${a.name || "unnamed"}) - ${a.status}`,
        value: a.slug,
      })),
    },
  ]);

  const ep = await promptEndpointDetails();
  const priceUsd = parseFloat(ep.price);
  console.log(
    chalk.dim(
      `  Will send: ${ep.method} ${ep.path} @ $${priceUsd.toFixed(6)}/call`
    )
  );

  await addEndpoint(slug, {
    path: ep.path,
    method: ep.method,
    price: ep.price,
    description: ep.description,
  });
}

async function publisherMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Publisher",
        choices: [
          { name: "Guided: Create & Publish API", value: "guided" },
          { name: "Add endpoint to existing API", value: "add_endpoint" },
          { name: "List my APIs", value: "list_apis" },
          { name: "Verify GitHub identity", value: "verify_github" },
          { name: "Activate (publish) API", value: "activate_api" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    if (action === "guided") {
      await guidedCreateAndPublish();
    } else if (action === "add_endpoint") {
      await addEndpointToExistingApi();
    } else if (action === "list_apis") {
      await listApis();
    } else if (action === "verify_github") {
      const token = await askRequiredSecret("GitHub PAT:");
      await verifyGithub({ token });
    } else if (action === "activate_api") {
      const { slug } = await inquirer.prompt<{ slug: string }>([
        {
          type: "input",
          name: "slug",
          message: "API slug to activate:",
          validate: (input: string) => !!input.trim() || "Slug is required",
        },
      ]);
      await activateApi(slug.trim());
    }

    await pause();
  }
}

async function projectMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Project Setup",
        choices: [
          { name: "Initialize OpenGrant in current project (opengrant init)", value: "init" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    const { force } = await inquirer.prompt<{ force: boolean }>([
      {
        type: "confirm",
        name: "force",
        message: "Overwrite existing .opengrantrc.json if present?",
        default: false,
      },
    ]);
    await init({ force });
    await pause();
  }
}

async function settingsMenu(): Promise<void> {
  while (true) {
    renderHeader();
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Settings / Config",
        choices: [
          { name: "List project config", value: "list" },
          { name: "Get config key", value: "get" },
          { name: "Set config key", value: "set" },
          { name: "Back", value: "back" },
        ],
      },
    ]);

    if (action === "back") return;

    if (action === "list") {
      await configList();
    } else if (action === "get") {
      const { key } = await inquirer.prompt<{ key: string }>([
        {
          type: "input",
          name: "key",
          message: "Config key (api-key, default-api, environment, tip-percentage):",
          validate: (input: string) => !!input.trim() || "Key is required",
        },
      ]);
      await configGet(key.trim());
    } else if (action === "set") {
      const answers = await inquirer.prompt<{ key: string; value: string }>([
        {
          type: "input",
          name: "key",
          message: "Config key (api-key, default-api, environment, tip-percentage):",
          validate: (input: string) => !!input.trim() || "Key is required",
        },
        {
          type: "input",
          name: "value",
          message: "Config value:",
          validate: (input: string) => !!input.trim() || "Value is required",
        },
      ]);
      await configSet(answers.key.trim(), answers.value.trim());
    }

    await pause();
  }
}

function printHelpPanel(): void {
  console.log(chalk.bold("Quick Actions"));
  console.log(chalk.dim("  Login (browser):      opengrant login"));
  console.log(chalk.dim("  Login (headless):     opengrant login --headless"));
  console.log(chalk.dim("  Create API key:       opengrant keys create --name my-app"));
  console.log(chalk.dim("  Donate to repo:       opengrant donate owner/repo 10"));
  console.log(chalk.dim("  Claim funds:          opengrant claim --github-token ghp_xxx"));
  console.log(chalk.dim("  Create API:           opengrant publish create-api ..."));
  console.log(chalk.dim("  Publish API:          opengrant publish activate <slug>"));
  console.log();
  console.log(chalk.bold("Guided Paths in This Menu"));
  console.log(chalk.dim("  Donor          -> donate, fund wallet, balance"));
  console.log(chalk.dim("  Maintainer     -> claim escrow funds for owned repos"));
  console.log(chalk.dim("  API Consumer   -> keys + usage stats"));
  console.log(chalk.dim("  Publisher      -> GitHub verify + create/publish API"));
  console.log();
  console.log(chalk.dim("Documentation: https://docs.opengrant.dev/cli"));
}

async function chooseMainAction(): Promise<MainAction> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What do you want to do?",
      pageSize: 12,
      choices: [
        { name: "Account / Login", value: "account" },
        { name: "Donor - Fund and Donate", value: "donor" },
        { name: "Maintainer - Claim Repository Funds", value: "maintainer" },
        { name: "API Consumer - Keys and Usage", value: "consumer" },
        { name: "Publisher - Verify GitHub and Publish API", value: "publisher" },
        { name: "Project Setup - Initialize OpenGrant", value: "project" },
        { name: "Settings - Project Config", value: "settings" },
        { name: "Help - Commands and Examples", value: "help" },
        { name: "Exit", value: "exit" },
      ],
    },
  ] as any);

  return action as MainAction;
}

export async function showMainMenu(): Promise<void> {
  let onboardingShown = false;

  while (true) {
    if (!onboardingShown) {
      onboardingShown = true;
      const route = await firstRunOnboarding();
      if (route === "donor") {
        await donorMenu();
        continue;
      }
      if (route === "maintainer") {
        await maintainerMenu();
        continue;
      }
      if (route === "consumer") {
        await consumerMenu();
        continue;
      }
      if (route === "publisher") {
        await publisherMenu();
        continue;
      }
    }

    renderHeader();
    const action = await chooseMainAction();

    if (action === "exit") {
      console.log(chalk.dim("Goodbye."));
      return;
    }

    if (action === "account") await accountMenu();
    if (action === "donor") await donorMenu();
    if (action === "maintainer") await maintainerMenu();
    if (action === "consumer") await consumerMenu();
    if (action === "publisher") await publisherMenu();
    if (action === "project") await projectMenu();
    if (action === "settings") await settingsMenu();

    if (action === "help") {
      renderHeader();
      printHelpPanel();
      await pause();
    }
  }
}
