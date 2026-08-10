import type { CaseResult, RunResult } from "./runner.js";

/**
 * JSON report keys are snake_case (matching the Python CLI's output and the
 * config file's own convention) so tooling can consume a report from either
 * language's CLI identically.
 */
export interface CaseReport {
  id: string;
  repeat: number;
  successful_calls: number;
  failed_calls: number;
  consistency_score: number;
  threshold: number;
  passed: boolean;
  distinct_answers: number;
  majority_answer: string;
  distribution: Record<string, number>;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface RunReport {
  passed: boolean;
  cases: CaseReport[];
}

function toCaseReport(r: CaseResult): CaseReport {
  return {
    id: r.caseId,
    repeat: r.rawResponses.length + r.errors.length,
    successful_calls: r.rawResponses.length,
    failed_calls: r.errors.length,
    consistency_score: Math.round(r.score.consistencyScore * 10000) / 10000,
    threshold: r.threshold,
    passed: r.score.passed,
    distinct_answers: r.score.distinctAnswers,
    majority_answer: r.score.majorityAnswer,
    distribution: r.score.distribution,
    prompt_tokens: r.promptTokens,
    completion_tokens: r.completionTokens,
  };
}

export function toReport(run: RunResult): RunReport {
  return { passed: run.passed, cases: run.caseResults.map(toCaseReport) };
}

export function toJson(run: RunResult): string {
  return JSON.stringify(toReport(run), null, 2);
}

export function toMarkdown(run: RunResult): string {
  const status = run.passed ? "PASSED" : "FAILED";
  const lines = [
    `## Flakegate report — ${status}`,
    "",
    "| Case | k | Distinct answers | Consistency | Threshold | Result |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of run.caseResults) {
    const k = r.rawResponses.length + r.errors.length;
    const mark = r.score.passed ? "PASS" : "FAIL";
    lines.push(
      `| \`${r.caseId}\` | ${k} | ${r.score.distinctAnswers} | ` +
        `${(r.score.consistencyScore * 100).toFixed(0)}% | ${(r.threshold * 100).toFixed(0)}% | ${mark} |`,
    );
    if (r.errors.length > 0) {
      lines.push(`|  |  |  |  |  | ${r.errors.length} call(s) errored |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function render(run: RunResult, fmt: "json" | "md"): string {
  if (fmt === "json") return toJson(run);
  if (fmt === "md") return toMarkdown(run);
  throw new Error(`unknown report format: ${fmt}`);
}
