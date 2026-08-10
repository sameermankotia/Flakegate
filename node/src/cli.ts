#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { type Case, type FlakegateConfig, ConfigError, loadConfig } from "./config.js";
import { estimateCost } from "./cost.js";
import { ProviderError } from "./providers/index.js";
import { render, toMarkdown } from "./report.js";
import { type CaseResult, type RunResult, runConfig } from "./runner.js";
import type { ScoreResult } from "./scoring.js";

const STARTER_CONFIG = `version: 1
provider: openai
model: gpt-4o-mini
api_key_env: OPENROUTER_API_KEY
concurrency: 5

cases:
  - id: my-first-case
    prompt: "Replace this with a real prompt from your application."
    params:
      temperature: 0.7
      max_tokens: 300
    repeat: 10
    threshold: 0.8
    normalize:
      mode: exact
      case_insensitive: true
      collapse_whitespace: true
`;

function withThresholdOverride(config: FlakegateConfig, failUnder: number): FlakegateConfig {
  const cases: Case[] = config.cases.map((c) => ({ ...c, threshold: failUnder }));
  return { ...config, cases };
}

const program = new Command();
program.name("flakegate").description("Flakegate — a reliability gate for LLM calls in CI.");

program
  .command("init")
  .description("Scaffold a starter flakegate.yaml in the current directory.")
  .option("--path <path>", "Where to write the starter config.", "flakegate.yaml")
  .action((opts: { path: string }) => {
    if (existsSync(opts.path)) {
      console.error(`Error: ${opts.path} already exists — refusing to overwrite it.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(opts.path, STARTER_CONFIG);
    console.log(`Wrote ${opts.path}. Set your provider's API key env var, then run: flakegate run`);
  });

program
  .command("run")
  .description("Run every case in the config, score consistency, and gate on the result.")
  .option("--config <path>", "Path to flakegate.yaml.", "flakegate.yaml")
  .option("--report <format>", "Report format: json or md.", "md")
  .option("--out <path>", "Write the report to this file instead of stdout.")
  .option("--fail-under <threshold>", "Override every case's threshold with this value.", Number.parseFloat)
  .option("--dry-run", "Estimate token cost without making any API calls.", false)
  .action(
    async (opts: {
      config: string;
      report: string;
      out?: string;
      failUnder?: number;
      dryRun: boolean;
    }) => {
      let config: FlakegateConfig;
      try {
        config = loadConfig(opts.config);
      } catch (err) {
        if (err instanceof ConfigError) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      if (opts.failUnder !== undefined && !Number.isNaN(opts.failUnder)) {
        config = withThresholdOverride(config, opts.failUnder);
      }

      if (opts.dryRun) {
        const estimate = estimateCost(config);
        console.log(`Estimated calls: ${estimate.totalCalls}`);
        console.log(
          `Estimated cost:  $${estimate.totalEstimatedCostUsd.toFixed(4)}` +
            (estimate.pricingIsKnown ? "" : "  (model pricing unknown — using a generic estimate)"),
        );
        for (const c of estimate.cases) {
          console.log(`  ${c.caseId}: ${c.calls} calls, ~$${c.estimatedCostUsd.toFixed(4)}`);
        }
        return;
      }

      if (opts.report !== "json" && opts.report !== "md") {
        console.error(`Error: --report must be 'json' or 'md'`);
        process.exitCode = 1;
        return;
      }

      let result: RunResult;
      try {
        result = await runConfig(config);
      } catch (err) {
        if (err instanceof ProviderError) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      const output = render(result, opts.report);
      if (opts.out) {
        writeFileSync(opts.out, output);
        console.log(`Report written to ${opts.out}`);
      } else {
        console.log(output);
      }

      process.exitCode = result.passed ? 0 : 1;
    },
  );

program
  .command("report")
  .description("Re-render a previously saved JSON run as a Markdown report.")
  .argument("<runJson>", "Path to a JSON report produced by 'flakegate run --report json'.")
  .action((runJsonPath: string) => {
    const data = JSON.parse(readFileSync(runJsonPath, "utf-8"));
    const caseResults: CaseResult[] = data.cases.map(
      (c: {
        id: string;
        threshold: number;
        consistency_score: number;
        passed: boolean;
        distinct_answers: number;
        majority_answer: string;
        distribution: Record<string, number>;
        successful_calls: number;
        failed_calls: number;
      }) => {
        const score: ScoreResult = {
          consistencyScore: c.consistency_score,
          passed: c.passed,
          distinctAnswers: c.distinct_answers,
          majorityAnswer: c.majority_answer,
          distribution: c.distribution,
        };
        return {
          caseId: c.id,
          threshold: c.threshold,
          score,
          rawResponses: new Array(c.successful_calls).fill(""),
          errors: new Array(c.failed_calls).fill(""),
          promptTokens: 0,
          completionTokens: 0,
        };
      },
    );
    const runResult: RunResult = { passed: data.passed, caseResults };
    console.log(toMarkdown(runResult));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
});
