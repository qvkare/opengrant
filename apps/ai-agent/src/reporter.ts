/**
 * Terminal reporter — pretty-prints the agent's final report
 */

import chalk from "chalk";
import type { FinalReport, StepResult } from "./types.js";
import { formatUSDC, truncate, getTxUrl } from "./utils.js";

const CHAIN_ID = parseInt(process.env.CHAIN_ID || "84532");

function printDivider(char = "─", width = 60) {
  console.log(chalk.dim(char.repeat(width)));
}

function printStepResult(result: StepResult, index: number) {
  const icon = result.success ? chalk.green("✓") : chalk.red("✗");
  const method = chalk.cyan(result.step.method);
  const path = chalk.white(result.step.path);

  console.log(`  ${icon} Step ${index + 1}: ${method} ${result.step.apiSlug}${path}`);
  console.log(chalk.dim(`    Reason: ${truncate(result.step.reasoning, 70)}`));

  if (result.success) {
    console.log(chalk.dim(`    Cost: ${formatUSDC(result.costUSDC)} | Duration: ${result.durationMs}ms`));
    if (result.txHash) {
      console.log(chalk.dim(`    Tx: ${chalk.underline(getTxUrl(result.txHash, CHAIN_ID))}`));
    }
    if (result.data) {
      const preview = truncate(JSON.stringify(result.data), 80);
      console.log(chalk.dim(`    Data: ${preview}`));
    }
  } else {
    console.log(chalk.red(`    Error: ${result.error}`));
  }
}

export function printReport(report: FinalReport) {
  console.log();
  printDivider("═");
  console.log(chalk.bold.white("  AI Agent Report"));
  printDivider("═");

  // Task
  console.log();
  console.log(chalk.bold("Task:"), report.task);
  console.log(chalk.dim(`Plan reasoning: ${truncate(report.plan.reasoning, 70)}`));

  // Steps
  console.log();
  console.log(chalk.bold("Execution:"));
  report.results.forEach((r, i) => printStepResult(r, i));

  // Costs
  console.log();
  printDivider();
  console.log(chalk.bold("Summary:"));
  console.log(`  Steps executed: ${report.results.length}`);
  console.log(`  Successful: ${chalk.green(String(report.results.filter((r) => r.success).length))}`);
  console.log(`  Failed: ${chalk.red(String(report.results.filter((r) => !r.success).length))}`);
  console.log(`  Total cost: ${chalk.yellow(formatUSDC(report.totalCostUSDC))}`);
  console.log(`  Total duration: ${report.totalDurationMs}ms`);
  console.log(`  Balance before: ${formatUSDC(report.balanceBefore)}`);
  console.log(`  Balance after: ${formatUSDC(report.balanceAfter)}`);

  // Transactions
  const txHashes = report.results.filter((r) => r.txHash).map((r) => r.txHash!);
  if (txHashes.length > 0) {
    console.log();
    printDivider();
    console.log(chalk.bold("Transactions:"));
    txHashes.forEach((hash, i) => {
      console.log(`  ${i + 1}. ${chalk.underline(getTxUrl(hash, CHAIN_ID))}`);
    });
  }

  // Synthesis
  if (report.synthesis) {
    console.log();
    printDivider();
    console.log(chalk.bold("AI Synthesis:"));
    console.log(chalk.white(`  ${report.synthesis}`));
  }

  console.log();
  printDivider("═");
}
