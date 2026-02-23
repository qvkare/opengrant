/**
 * AI Agent Demo — Orchestrator
 *
 * Demonstrates an autonomous AI agent that:
 * 1. Discovers APIs on the OpenGrant marketplace
 * 2. Uses Claude to plan which APIs to call
 * 3. Executes the plan with automatic x402 micropayments
 * 4. Synthesizes results with Claude
 *
 * Usage:
 *   pnpm --filter @opengrant/ai-agent dev "Analyze this TypeScript code for quality"
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { OpenGrant } from "@opengrant/sdk";
import ora from "ora";
import chalk from "chalk";
import { AIAgent } from "./agent.js";
import { printReport } from "./reporter.js";
import { formatUSDC } from "./utils.js";
import type { AgentPlan, FinalReport } from "./types.js";

// ─── Configuration ─────────────────────────────────────────

const OPENGRANT_API_KEY = process.env.OPENGRANT_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "84532");
const BASE_URL = process.env.OPENGRANT_API_URL || "http://localhost:3001";
const DEMO_API_SLUG = process.env.DEMO_API_SLUG || "code-scanner";

// Default task if none provided
const DEFAULT_TASK = "Analyze this TypeScript code for quality issues and get best practice suggestions";

// Sample code for analysis demo
const SAMPLE_CODE = `
import { useState } from "react";

export function UserList(props: any) {
  const [users, setUsers] = useState([]);
  // TODO: add error handling
  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    console.log("Fetched users:", data);
    setUsers(data);
  };

  if (users.length == 0) return <div>No users</div>;

  return (
    <ul>
      {users.map((u: any) => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}
`.trim();

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log();
  console.log(chalk.bold.cyan("  OpenGrant AI Agent Demo"));
  console.log(chalk.dim("  Autonomous API consumption with x402 micropayments"));
  console.log();

  // Validate environment
  if (!OPENGRANT_API_KEY) {
    console.error(chalk.red("Missing OPENGRANT_API_KEY. Copy .env.example to .env and configure."));
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error(chalk.red("Missing PRIVATE_KEY. Required for x402 payment signing."));
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error(chalk.red("Missing ANTHROPIC_API_KEY. Required for Claude AI."));
    process.exit(1);
  }

  // Get task from CLI args or use default
  const task = process.argv[2] || DEFAULT_TASK;
  console.log(chalk.bold("Task:"), task);
  console.log();

  // ─── Step 1: Initialize SDK ────────────────────────────

  const spinner = ora("Initializing OpenGrant SDK...").start();

  const opengrant = new OpenGrant({
    apiKey: OPENGRANT_API_KEY,
    privateKey: PRIVATE_KEY,
    chainId: CHAIN_ID,
    baseUrl: BASE_URL,
    debug: false,
    tipPercentage: 5, // 5% auto-tip to linked OSS projects
    onTip: (tip) => {
      if (tip.success && tip.amount && tip.repo) {
        console.log(chalk.dim(`  [Tip] ${tip.amount} USDC → ${tip.repo}`));
      }
    },
  });

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const agent = new AIAgent({ opengrant, anthropic });

  spinner.succeed("SDK initialized");

  // ─── Step 2: Check Balance ─────────────────────────────

  spinner.start("Checking USDC balance...");
  let balanceBefore: string;

  try {
    const balance = await opengrant.getBalance();
    balanceBefore = balance.usdc; // raw wei (e.g. "20000000" = 20 USDC)
    spinner.succeed(`Balance: ${formatUSDC(balanceBefore)}`);
  } catch {
    balanceBefore = "0";
    spinner.warn("Could not fetch balance (continuing anyway)");
  }

  // ─── Step 3: Discover APIs ─────────────────────────────

  spinner.start("Discovering available APIs...");

  // In a real scenario, we'd call the marketplace API to discover available APIs.
  // For the demo, we define the demo API that we control.
  const availableApis = [
    {
      slug: DEMO_API_SLUG,
      name: "Code Scanner",
      description: "Static code analysis and best practice suggestions for multiple languages",
      endpoints: [
        "POST /v1/analyze-code — Analyze code for issues (body: { code, language })",
        "GET /v1/suggestions?language=X — Get language-specific best practices",
      ],
    },
  ];

  spinner.succeed(`Found ${availableApis.length} API(s) on marketplace`);

  // ─── Step 4: AI Planning ───────────────────────────────

  spinner.start("Claude is creating an execution plan...");

  let plan: AgentPlan;
  try {
    plan = await agent.planAPIUsage(task, availableApis, balanceBefore);
    spinner.succeed(`Plan created: ${plan.steps.length} step(s), est. cost ${plan.estimatedCost}`);
  } catch (error) {
    spinner.fail("Failed to create plan");
    throw error;
  }

  console.log(chalk.dim(`  Reasoning: ${plan.reasoning}`));
  for (const [i, step] of plan.steps.entries()) {
    console.log(chalk.dim(`  Step ${i + 1}: ${step.method} ${step.apiSlug}${step.path} — ${step.reasoning}`));
  }
  console.log();

  // Inject sample code into POST body if the plan calls analyze-code
  for (const step of plan.steps) {
    if (step.method === "POST" && step.path.includes("analyze-code")) {
      step.body = { ...step.body, code: SAMPLE_CODE, language: "typescript" };
    }
  }

  // ─── Step 5: Execute Plan (x402 payments) ──────────────

  spinner.start("Executing plan with x402 micropayments...");

  const startMs = Date.now();
  const results = await agent.executePlan(plan);
  const totalDurationMs = Date.now() - startMs;

  const successCount = results.filter((r) => r.success).length;
  spinner.succeed(`Executed ${results.length} step(s): ${successCount} succeeded`);

  // ─── Step 6: Check Balance After ───────────────────────

  spinner.start("Checking final balance...");
  let balanceAfter: string;

  try {
    const balance = await opengrant.getBalance();
    balanceAfter = balance.usdc; // raw wei
    spinner.succeed(`Balance after: ${formatUSDC(balanceAfter)}`);
  } catch {
    balanceAfter = balanceBefore;
    spinner.warn("Could not fetch balance after execution");
  }

  // ─── Step 7: AI Synthesis ──────────────────────────────

  spinner.start("Claude is synthesizing results...");
  let synthesis: string;

  try {
    synthesis = await agent.synthesizeResults(task, results);
    spinner.succeed("Synthesis complete");
  } catch {
    synthesis = "Synthesis unavailable.";
    spinner.warn("Could not generate synthesis");
  }

  // ─── Step 8: Print Report ──────────────────────────────

  const totalCostWei = results
    .reduce((sum, r) => sum + BigInt(r.costUSDC || "0"), BigInt(0));
  const totalCostUSDC = totalCostWei.toString();

  const report: FinalReport = {
    task,
    plan,
    results,
    synthesis,
    totalCostUSDC,
    totalDurationMs,
    balanceBefore,
    balanceAfter,
  };

  printReport(report);
}

main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
