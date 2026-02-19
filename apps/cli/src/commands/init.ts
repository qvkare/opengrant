import chalk from "chalk";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import { isAuthenticated } from "../config.js";

interface InitOptions {
  force?: boolean;
}

const CONFIG_FILENAME = ".opengrantrc.json";

interface OpenGrantConfig {
  apiKey?: string;
  defaultApi?: string;
  environment: "production" | "staging";
  tipPercentage?: number;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectProjectType(): Promise<string> {
  const cwd = process.cwd();

  // Check for common project files
  const checks = [
    { file: "package.json", type: "Node.js" },
    { file: "requirements.txt", type: "Python" },
    { file: "Cargo.toml", type: "Rust" },
    { file: "go.mod", type: "Go" },
    { file: "pom.xml", type: "Java (Maven)" },
    { file: "build.gradle", type: "Java (Gradle)" },
    { file: "Gemfile", type: "Ruby" },
    { file: "composer.json", type: "PHP" },
  ];

  for (const check of checks) {
    if (await fileExists(path.join(cwd, check.file))) {
      return check.type;
    }
  }

  return "Unknown";
}

async function detectGitRepo(): Promise<boolean> {
  return fileExists(path.join(process.cwd(), ".git"));
}

export async function init(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILENAME);

  console.log();
  console.log(chalk.bold("Initialize OpenGrant in current project"));
  console.log(chalk.dim(cwd));
  console.log();

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    console.log(chalk.yellow(`${CONFIG_FILENAME} already exists in this directory.`));

    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Do you want to overwrite it?",
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.dim("Initialization cancelled."));
      return;
    }
  }

  // Detect project info
  const projectType = await detectProjectType();
  const hasGit = await detectGitRepo();

  console.log(chalk.dim(`  Detected project type: ${chalk.cyan(projectType)}`));
  if (hasGit) {
    console.log(chalk.dim(`  Git repository: ${chalk.green("Yes")}`));
  }
  console.log();

  // Prompt for configuration
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "apiKey",
      message: "API Key (optional, can set later):",
      default: "",
    },
    {
      type: "input",
      name: "defaultApi",
      message: "Default API slug (optional):",
      default: "",
      validate: (input: string) => {
        if (input && !/^[a-z0-9-]+$/.test(input)) {
          return "API slug should only contain lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "environment",
      message: "Environment:",
      choices: [
        { name: "Production", value: "production" },
        { name: "Staging (for testing)", value: "staging" },
      ],
      default: "production",
    },
    {
      type: "number",
      name: "tipPercentage",
      message: "Auto-tip percentage for linked OSS projects on paid API calls (0-100):",
      default: 0,
      validate: (input: number) => {
        if (isNaN(input) || input < 0 || input > 100) {
          return "Must be a number between 0 and 100";
        }
        return true;
      },
    },
  ]);

  // Build config object
  const config: OpenGrantConfig = {
    environment: answers.environment,
  };

  if (answers.apiKey) {
    config.apiKey = answers.apiKey;
  }

  if (answers.defaultApi) {
    config.defaultApi = answers.defaultApi;
  }

  if (answers.tipPercentage > 0) {
    config.tipPercentage = answers.tipPercentage;
  }

  // Write config file
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");

    console.log();
    console.log(chalk.green(`Created ${CONFIG_FILENAME}`));
    console.log();

    // Show next steps
    console.log(chalk.bold("Next steps:"));
    console.log();

    if (!isAuthenticated()) {
      console.log(chalk.dim("  1. Log in to your account:"));
      console.log(chalk.cyan("     opengrant login"));
      console.log();
    }

    if (!answers.apiKey) {
      console.log(chalk.dim("  2. Create an API key:"));
      console.log(chalk.cyan("     opengrant keys create --name \"my-project\""));
      console.log();
      console.log(chalk.dim("  3. Add the key to your config:"));
      console.log(chalk.cyan("     opengrant config set api-key <your-key>"));
      console.log();
    }

    console.log(chalk.dim("  4. Fund your wallet:"));
    console.log(chalk.cyan("     opengrant fund 10"));
    console.log();

    console.log(chalk.dim("  5. Start using APIs:"));
    console.log(chalk.cyan("     npm install @opengrant/sdk"));
    console.log();

    // Suggest adding to .gitignore
    if (hasGit) {
      const gitignorePath = path.join(cwd, ".gitignore");
      const gitignoreExists = await fileExists(gitignorePath);

      if (gitignoreExists) {
        const gitignore = await fs.readFile(gitignorePath, "utf-8");
        if (!gitignore.includes(CONFIG_FILENAME)) {
          console.log(chalk.yellow(`Tip: Add ${CONFIG_FILENAME} to .gitignore if it contains your API key`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Failed to create config file"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}
