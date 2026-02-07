import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

const CONFIG_FILENAME = ".opengrantrc.json";

interface OpenGrantConfig {
  apiKey?: string;
  defaultApi?: string;
  environment: "production" | "staging";
}

async function findConfigFile(): Promise<string | null> {
  let dir = process.cwd();

  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      dir = path.dirname(dir);
    }
  }

  return null;
}

async function readConfig(configPath: string): Promise<OpenGrantConfig> {
  const content = await fs.readFile(configPath, "utf-8");
  return JSON.parse(content);
}

async function writeConfig(configPath: string, config: OpenGrantConfig): Promise<void> {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}

export async function configGet(key: string): Promise<void> {
  const configPath = await findConfigFile();

  if (!configPath) {
    console.log(chalk.red(`No ${CONFIG_FILENAME} found. Run \`opengrant init\` first.`));
    return;
  }

  try {
    const config = await readConfig(configPath);
    const value = config[key as keyof OpenGrantConfig];

    if (value === undefined) {
      console.log(chalk.dim(`Key "${key}" is not set`));
    } else {
      console.log(value);
    }
  } catch (error) {
    console.error(chalk.red("Failed to read config"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}

export async function configSet(key: string, value: string): Promise<void> {
  const configPath = await findConfigFile();

  if (!configPath) {
    console.log(chalk.red(`No ${CONFIG_FILENAME} found. Run \`opengrant init\` first.`));
    return;
  }

  const validKeys = ["apiKey", "api-key", "defaultApi", "default-api", "environment"];

  // Normalize key names
  const normalizedKey = key.replace(/-/g, "");
  const configKey = normalizedKey === "apikey"
    ? "apiKey"
    : normalizedKey === "defaultapi"
      ? "defaultApi"
      : key;

  if (!validKeys.includes(key) && !validKeys.includes(configKey)) {
    console.log(chalk.red(`Invalid key "${key}". Valid keys: api-key, default-api, environment`));
    return;
  }

  try {
    const config = await readConfig(configPath);

    if (configKey === "environment") {
      if (value !== "production" && value !== "staging") {
        console.log(chalk.red('Environment must be "production" or "staging"'));
        return;
      }
      config.environment = value;
    } else {
      (config as Record<string, string>)[configKey] = value;
    }

    await writeConfig(configPath, config);
    console.log(chalk.green(`Set ${configKey} = ${configKey === "apiKey" ? "***" : value}`));
  } catch (error) {
    console.error(chalk.red("Failed to update config"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}

export async function configList(): Promise<void> {
  const configPath = await findConfigFile();

  if (!configPath) {
    console.log(chalk.red(`No ${CONFIG_FILENAME} found. Run \`opengrant init\` first.`));
    return;
  }

  console.log();
  console.log(chalk.bold("OpenGrant Configuration"));
  console.log(chalk.dim(configPath));
  console.log();

  try {
    const config = await readConfig(configPath);

    console.log(chalk.dim("  api-key:      ") + (config.apiKey ? chalk.green("***" + config.apiKey.slice(-4)) : chalk.dim("(not set)")));
    console.log(chalk.dim("  default-api:  ") + (config.defaultApi || chalk.dim("(not set)")));
    console.log(chalk.dim("  environment:  ") + config.environment);
    console.log();
  } catch (error) {
    console.error(chalk.red("Failed to read config"));
    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}
