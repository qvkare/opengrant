/**
 * AI Agent types
 */

export interface AgentStep {
  /** API slug to call */
  apiSlug: string;
  /** HTTP method */
  method: "GET" | "POST";
  /** Endpoint path */
  path: string;
  /** Request body (for POST) */
  body?: Record<string, unknown>;
  /** Query params (for GET) */
  params?: Record<string, string>;
  /** Why this step is needed */
  reasoning: string;
}

export interface AgentPlan {
  /** Task description from user */
  task: string;
  /** Steps the agent will execute */
  steps: AgentStep[];
  /** Estimated total cost in USDC */
  estimatedCost: string;
  /** Claude's reasoning for this plan */
  reasoning: string;
}

export interface StepResult {
  step: AgentStep;
  success: boolean;
  data?: unknown;
  error?: string;
  costUSDC: string;
  durationMs: number;
}

export interface FinalReport {
  task: string;
  plan: AgentPlan;
  results: StepResult[];
  synthesis: string;
  totalCostUSDC: string;
  totalDurationMs: number;
  balanceBefore: string;
  balanceAfter: string;
}
