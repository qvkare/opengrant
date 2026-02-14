/**
 * Usage Aggregation Workflow
 *
 * Fetches pending settlement records from the OpenGrant API and triggers
 * batch settlement. Runs on a 5-minute cron schedule.
 *
 * Flow:
 * 1. HTTP GET /internal/pending-settlements
 * 2. If pending records exist, HTTP POST /internal/trigger-settlement
 * 3. Log settlement results
 */

import {
  Runner,
  cre,
  consensusIdenticalAggregation,
  ok,
  json,
  type Runtime,
  type HTTPSendRequester,
  type CronPayload,
} from "@chainlink/cre-sdk";
import { toBase64 } from "../../lib/base64.js";

interface Config {
  schedule: string;
  apiUrl: string;
}

interface PendingSettlement {
  id: string;
  apiId: string;
  endpointId: string;
  consumerId: string;
  amount: string;
  txHash?: string;
  timestamp: string;
}

interface SettlementResult {
  success: boolean;
  processed: number;
  successful: number;
  failed: number;
  totalSettled: string;
}

const fetchPending = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/pending-settlements",
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
    })
    .result();

  if (!ok(resp)) {
    throw new Error(
      `Failed to fetch pending settlements: ${resp.statusCode}`
    );
  }

  return json(resp) as { records: PendingSettlement[] };
};

const triggerSettlement = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/trigger-settlement",
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: toBase64(JSON.stringify({ source: "cre-workflow" })),
    })
    .result();

  if (!ok(resp)) {
    throw new Error(`Failed to trigger settlement: ${resp.statusCode}`);
  }

  return json(resp) as SettlementResult;
};

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const apiKey = runtime
    .getSecret({ id: "OPENGRANT_API_KEY" })
    .result().value;

  const httpClient = new cre.capabilities.HTTPClient();

  // Step 1: Fetch pending settlements
  const pending = httpClient
    .sendRequest(runtime, fetchPending, consensusIdenticalAggregation())(
      runtime.config.apiUrl,
      apiKey
    )
    .result();

  if (!pending.records || pending.records.length === 0) {
    runtime.log("No pending settlements found");
    return JSON.stringify({ settled: 0, totalAmount: "0" });
  }

  runtime.log(
    `Found ${pending.records.length} pending settlement(s), triggering settlement`
  );

  // Step 2: Trigger settlement
  const result = httpClient
    .sendRequest(
      runtime,
      triggerSettlement,
      consensusIdenticalAggregation()
    )(runtime.config.apiUrl, apiKey)
    .result();

  runtime.log(
    `Settlement complete: ${result.processed} processed, total ${result.totalSettled}`
  );

  return JSON.stringify(result);
};

const initWorkflow = (config: Config) => {
  const cronCap = new cre.capabilities.CronCapability();
  return [
    cre.handler(
      cronCap.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({});
  await runner.run(initWorkflow);
}
