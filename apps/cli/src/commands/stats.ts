import chalk from "chalk";
import ora from "ora";
import { isAuthenticated, getToken, getApiUrl } from "../config.js";

interface StatsOptions {
  api?: string;
  period?: string;
}

interface UsageStats {
  totalCalls: number;
  totalSpent: string;
  apiBreakdown: Array<{
    apiId: string;
    apiName: string;
    calls: number;
    spent: string;
  }>;
  dailyUsage: Array<{
    date: string;
    calls: number;
    spent: string;
  }>;
  period: {
    start: string;
    end: string;
  };
}

interface APIStats {
  apiId: string;
  apiName: string;
  publisher: string;
  totalCalls: number;
  totalSpent: string;
  endpoints: Array<{
    path: string;
    method: string;
    calls: number;
    spent: string;
    avgResponseTime: number;
  }>;
  dailyUsage: Array<{
    date: string;
    calls: number;
    spent: string;
  }>;
}

function formatUSDC(amount: string): string {
  const value = parseFloat(amount) / 1_000_000;
  return `$${value.toFixed(2)}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderBar(value: number, max: number, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(empty));
}

async function fetchStats(apiSlug?: string, period?: string): Promise<UsageStats | APIStats> {
  const apiUrl = getApiUrl();
  const token = getToken();

  const params = new URLSearchParams();
  if (period) params.set("period", period);

  const endpoint = apiSlug
    ? `${apiUrl}/v1/consumer/stats/api/${apiSlug}?${params}`
    : `${apiUrl}/v1/consumer/stats?${params}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }

  return response.json();
}

function renderOverallStats(stats: UsageStats): void {
  console.log();
  console.log(chalk.bold("Usage Summary"));
  console.log(chalk.dim(`${formatDate(stats.period.start)} - ${formatDate(stats.period.end)}`));
  console.log();

  // Main metrics
  console.log(chalk.dim("  Total API Calls:  ") + chalk.bold(formatNumber(stats.totalCalls)));
  console.log(chalk.dim("  Total Spent:      ") + chalk.bold.green(formatUSDC(stats.totalSpent)));
  console.log();

  // API breakdown
  if (stats.apiBreakdown.length > 0) {
    console.log(chalk.bold("API Breakdown"));
    console.log();

    const maxCalls = Math.max(...stats.apiBreakdown.map((a) => a.calls));

    for (const api of stats.apiBreakdown) {
      const bar = renderBar(api.calls, maxCalls, 15);
      console.log(
        `  ${chalk.cyan(api.apiName.padEnd(20))} ${bar} ${formatNumber(api.calls).padStart(8)} calls  ${chalk.green(formatUSDC(api.spent).padStart(10))}`
      );
    }
    console.log();
  }

  // Daily usage chart
  if (stats.dailyUsage.length > 0) {
    console.log(chalk.bold("Daily Usage (Last 7 Days)"));
    console.log();

    const maxDaily = Math.max(...stats.dailyUsage.map((d) => d.calls));

    for (const day of stats.dailyUsage.slice(-7)) {
      const bar = renderBar(day.calls, maxDaily, 20);
      console.log(
        `  ${formatDate(day.date).padEnd(8)} ${bar} ${formatNumber(day.calls).padStart(6)}`
      );
    }
    console.log();
  }
}

function renderAPIStats(stats: APIStats): void {
  console.log();
  console.log(chalk.bold(stats.apiName));
  console.log(chalk.dim(`by ${stats.publisher}`));
  console.log();

  // Main metrics
  console.log(chalk.dim("  Total Calls:  ") + chalk.bold(formatNumber(stats.totalCalls)));
  console.log(chalk.dim("  Total Spent:  ") + chalk.bold.green(formatUSDC(stats.totalSpent)));
  console.log();

  // Endpoint breakdown
  if (stats.endpoints.length > 0) {
    console.log(chalk.bold("Endpoint Usage"));
    console.log();

    const maxCalls = Math.max(...stats.endpoints.map((e) => e.calls));

    for (const endpoint of stats.endpoints) {
      const method = endpoint.method.toUpperCase().padEnd(6);
      const methodColor =
        endpoint.method === "GET"
          ? chalk.green
          : endpoint.method === "POST"
            ? chalk.yellow
            : endpoint.method === "DELETE"
              ? chalk.red
              : chalk.blue;

      const bar = renderBar(endpoint.calls, maxCalls, 12);
      console.log(
        `  ${methodColor(method)} ${chalk.dim(endpoint.path.padEnd(30))} ${bar} ${formatNumber(endpoint.calls).padStart(6)}  ${chalk.dim(endpoint.avgResponseTime + "ms")}`
      );
    }
    console.log();
  }

  // Daily trend
  if (stats.dailyUsage.length > 0) {
    console.log(chalk.bold("Daily Trend"));
    console.log();

    const maxDaily = Math.max(...stats.dailyUsage.map((d) => d.calls));

    for (const day of stats.dailyUsage.slice(-7)) {
      const bar = renderBar(day.calls, maxDaily, 20);
      console.log(
        `  ${formatDate(day.date).padEnd(8)} ${bar} ${formatNumber(day.calls).padStart(6)}`
      );
    }
    console.log();
  }
}

export async function stats(options: StatsOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red("Not logged in. Run `opengrant login` first."));
    return;
  }

  const spinner = ora("Fetching usage statistics...").start();

  try {
    const data = await fetchStats(options.api, options.period);

    spinner.stop();

    if (options.api) {
      renderAPIStats(data as APIStats);
    } else {
      renderOverallStats(data as UsageStats);
    }

    console.log(chalk.dim("  View detailed analytics at https://opengrant.dev/consumer/analytics"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to fetch statistics"));

    if (error instanceof Error) {
      console.error(chalk.dim(`  ${error.message}`));
    }
  }
}
