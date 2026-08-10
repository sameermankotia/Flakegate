import type { Case, FlakegateConfig } from "./config.js";

// Approximate USD price per 1M tokens, [input, output]. Best-effort estimate only —
// prices change, and OpenRouter's routed price can differ slightly from the native
// provider price; treat --dry-run output as a ballpark, not a bill.
const PRICING_PER_MILLION: Record<string, [number, number]> = {
  "gpt-4o": [2.5, 10.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4.1-mini": [0.4, 1.6],
  "claude-opus-5": [15.0, 75.0],
  "claude-sonnet-5": [3.0, 15.0],
  "claude-haiku-4-5-20251001": [0.8, 4.0],
};
const DEFAULT_PRICING: [number, number] = [1.0, 3.0];
const CHARS_PER_TOKEN = 4; // rough English-text heuristic

function estimatePromptTokens(c: Case): number {
  const text = c.messages ? c.messages.map((m) => m.content).join(" ") : (c.prompt ?? "");
  return Math.max(1, Math.floor(text.length / CHARS_PER_TOKEN));
}

function estimateCompletionTokens(c: Case): number {
  return Number(c.params.max_tokens ?? 300);
}

export interface CaseCostEstimate {
  caseId: string;
  calls: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
}

export interface CostEstimate {
  cases: CaseCostEstimate[];
  totalCalls: number;
  totalEstimatedCostUsd: number;
  pricingIsKnown: boolean;
}

export function estimateCost(config: FlakegateConfig): CostEstimate {
  const [inputPrice, outputPrice] = PRICING_PER_MILLION[config.model] ?? DEFAULT_PRICING;
  const pricingIsKnown = config.model in PRICING_PER_MILLION;

  const cases = config.cases.map((c) => {
    const promptTokens = estimatePromptTokens(c) * c.repeat;
    const completionTokens = estimateCompletionTokens(c) * c.repeat;
    const cost = (promptTokens / 1_000_000) * inputPrice + (completionTokens / 1_000_000) * outputPrice;
    return {
      caseId: c.id,
      calls: c.repeat,
      estimatedPromptTokens: promptTokens,
      estimatedCompletionTokens: completionTokens,
      estimatedCostUsd: Math.round(cost * 10000) / 10000,
    };
  });

  return {
    cases,
    totalCalls: cases.reduce((sum, c) => sum + c.calls, 0),
    totalEstimatedCostUsd: Math.round(cases.reduce((sum, c) => sum + c.estimatedCostUsd, 0) * 10000) / 10000,
    pricingIsKnown,
  };
}
