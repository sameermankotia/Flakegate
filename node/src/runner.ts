import type { Case, FlakegateConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import type { Provider } from "./providers/index.js";
import { ProviderError } from "./providers/index.js";
import { type ScoreResult, scoreResponses } from "./scoring.js";

export const MAX_RETRIES = 3;
export let RETRY_BACKOFF_MS = 1000;

/** Test-only hook to speed up retry-backoff tests. Not part of the public API. */
export function _setRetryBackoffMsForTests(ms: number): void {
  RETRY_BACKOFF_MS = ms;
}

export interface CaseResult {
  caseId: string;
  threshold: number;
  score: ScoreResult;
  rawResponses: string[];
  errors: string[];
  promptTokens: number;
  completionTokens: number;
}

export interface RunResult {
  passed: boolean;
  caseResults: CaseResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(
  provider: Provider,
  singleCase: Case,
): Promise<{ text?: string; error?: string; promptTokens: number; completionTokens: number }> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await provider.complete(singleCase.prompt, singleCase.messages, { ...singleCase.params });
      return { text: result.text, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
    } catch (err) {
      lastError = err instanceof ProviderError ? err.message : (err as Error).message;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }
  return { error: lastError, promptTokens: 0, completionTokens: 0 };
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runCase(provider: Provider, singleCase: Case, concurrency: number): Promise<CaseResult> {
  const tasks = Array.from({ length: singleCase.repeat }, () => () => callWithRetry(provider, singleCase));
  const outcomes = await runPool(tasks, concurrency);

  const responses: string[] = [];
  const errors: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  for (const outcome of outcomes) {
    if (outcome.error !== undefined) {
      errors.push(outcome.error);
    } else if (outcome.text !== undefined) {
      responses.push(outcome.text);
      promptTokens += outcome.promptTokens;
      completionTokens += outcome.completionTokens;
    }
  }

  if (responses.length === 0) {
    throw new ProviderError(
      `case '${singleCase.id}': all ${singleCase.repeat} calls failed. First error: ${errors[0] ?? "unknown"}`,
    );
  }

  const score = scoreResponses(responses, singleCase.normalize, singleCase.threshold, singleCase.extract);
  return {
    caseId: singleCase.id,
    threshold: singleCase.threshold,
    score,
    rawResponses: responses,
    errors,
    promptTokens,
    completionTokens,
  };
}

export async function runConfig(config: FlakegateConfig): Promise<RunResult> {
  const provider = getProvider(config.provider, config.model, config.apiKeyEnv);
  const caseResults: CaseResult[] = [];
  for (const singleCase of config.cases) {
    caseResults.push(await runCase(provider, singleCase, config.concurrency));
  }
  const passed = caseResults.every((r) => r.score.passed);
  return { passed, caseResults };
}
