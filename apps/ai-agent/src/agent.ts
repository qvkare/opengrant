/**
 * AI Agent Core
 *
 * Uses Claude to plan API calls, then executes them via OpenGrant SDK
 * with automatic x402 micropayments.
 */

import Anthropic from "@anthropic-ai/sdk";
import { OpenGrant } from "@opengrant/sdk";
import type { AgentPlan, AgentStep, StepResult } from "./types.js";
import { delay } from "./utils.js";

interface AgentConfig {
  opengrant: OpenGrant;
  anthropic: Anthropic;
  model?: string;
}

export class AIAgent {
  private opengrant: OpenGrant;
  private anthropic: Anthropic;
  private model: string;

  constructor(config: AgentConfig) {
    this.opengrant = config.opengrant;
    this.anthropic = config.anthropic;
    this.model = config.model ?? "claude-haiku-4-5-20251001";
  }

  /**
   * Ask Claude to create an execution plan based on available APIs
   */
  async planAPIUsage(
    task: string,
    availableApis: Array<{ slug: string; name: string; description?: string; endpoints?: string[] }>,
    balanceUSDC: string
  ): Promise<AgentPlan> {
    const apisText = availableApis
      .map(
        (a) =>
          `- ${a.slug} (${a.name}): ${a.description || "No description"}` +
          (a.endpoints ? `\n  Endpoints: ${a.endpoints.join(", ")}` : "")
      )
      .join("\n");

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `You are an AI agent that plans API calls to accomplish tasks. You have a USDC balance of ${balanceUSDC} for payments.

Available APIs:
${apisText}

Task: ${task}

Create an execution plan as a JSON object with:
- "steps": array of { "apiSlug", "method" (GET or POST), "path", "body" (optional), "params" (optional), "reasoning" }
- "estimatedCost": total estimated USDC cost as string
- "reasoning": why this plan achieves the task

Return ONLY valid JSON, no markdown or explanation.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No response from Claude for planning");
    }

    // Strip markdown code fences if present (e.g. ```json ... ```)
    const raw = textBlock.text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const plan = JSON.parse(raw) as Omit<AgentPlan, "task">;
    return { task, ...plan };
  }

  /**
   * Execute a plan step-by-step using OpenGrant SDK (x402 payments automatic)
   */
  async executePlan(plan: AgentPlan): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (const step of plan.steps) {
      const startMs = Date.now();

      try {
        const response = await this.opengrant.call(
          step.apiSlug,
          step.method,
          step.path,
          {
            body: step.body,
            params: step.params as Record<string, string>,
          }
        );

        results.push({
          step,
          success: true,
          data: response.data,
          costUSDC: response.payment?.amount ?? "0",
          durationMs: Date.now() - startMs,
        });
      } catch (error: unknown) {
        const err = error as Error & { code?: string };

        // Handle specific error types
        if (err.code === "INSUFFICIENT_BALANCE") {
          console.error("[Agent] Insufficient balance — stopping execution");
          results.push({
            step,
            success: false,
            error: "Insufficient USDC balance for payment",
            costUSDC: "0",
            durationMs: Date.now() - startMs,
          });
          break;
        }

        if (err.code === "RATE_LIMITED") {
          console.warn("[Agent] Rate limited — waiting 5s before retry");
          await delay(5000);
          // Simple retry once
          try {
            const retryResponse = await this.opengrant.call(
              step.apiSlug,
              step.method,
              step.path,
              { body: step.body, params: step.params as Record<string, string> }
            );
            results.push({
              step,
              success: true,
              data: retryResponse.data,
              costUSDC: retryResponse.payment?.amount ?? "0",
              durationMs: Date.now() - startMs,
            });
            continue;
          } catch {
            // Fall through to generic error
          }
        }

        results.push({
          step,
          success: false,
          error: err.message || "Unknown error",
          costUSDC: "0",
          durationMs: Date.now() - startMs,
        });
      }
    }

    return results;
  }

  /**
   * Ask Claude to synthesize results into a final report
   */
  async synthesizeResults(task: string, results: StepResult[]): Promise<string> {
    const resultsText = results
      .map(
        (r, i) =>
          `Step ${i + 1} (${r.step.method} ${r.step.apiSlug}${r.step.path}): ` +
          (r.success
            ? `Success — ${JSON.stringify(r.data)}`
            : `Failed — ${r.error}`)
      )
      .join("\n");

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 512,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `You are an AI agent reporting results. Summarize concisely (2-3 sentences).

Task: ${task}

Results:
${resultsText}

Provide a brief synthesis of what was accomplished and key findings.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "No synthesis available.";
  }
}
