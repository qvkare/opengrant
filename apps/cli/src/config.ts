import Conf from "conf";
import { chmodSync } from "fs";

export interface CliConfig {
  token?: string;
  walletAddress?: string;
  apiKey?: string;
  apiUrl: string;
  webUrl: string;
}

const defaultConfig: Partial<CliConfig> = {
  apiUrl: process.env.OPENGRANT_API_URL || "https://api.opengrant.dev",
  webUrl: process.env.OPENGRANT_WEB_URL || "https://opengrant.dev",
};

export const config = new Conf<CliConfig>({
  projectName: "opengrant",
  defaults: defaultConfig as CliConfig,
});

export function isAuthenticated(): boolean {
  return !!config.get("token");
}

export function getToken(): string | undefined {
  return config.get("token");
}

export function getWalletAddress(): string | undefined {
  return config.get("walletAddress");
}

export function setCredentials(token: string, walletAddress: string): void {
  config.set("token", token);
  config.set("walletAddress", walletAddress);
  // Restrict config file to owner-only read/write (contains credentials)
  try {
    chmodSync(config.path, 0o600);
  } catch {
    // Ignore permission errors on platforms that don't support chmod
  }
}

export function clearCredentials(): void {
  config.delete("token");
  config.delete("walletAddress");
}

export function getApiUrl(): string {
  return config.get("apiUrl");
}

export function getWebUrl(): string {
  return config.get("webUrl");
}
