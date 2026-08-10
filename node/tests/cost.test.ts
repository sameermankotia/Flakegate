import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { estimateCost } from "../src/cost.js";

const CONFIG = {
  version: 1,
  provider: "openai",
  model: "gpt-4o-mini",
  cases: [
    {
      id: "a",
      prompt: "a".repeat(400),
      params: { max_tokens: 100 },
      repeat: 10,
      threshold: 0.8,
    },
  ],
};

describe("estimateCost", () => {
  it("estimates cost for a known model", () => {
    const config = parseConfig(CONFIG);
    const estimate = estimateCost(config);
    expect(estimate.pricingIsKnown).toBe(true);
    expect(estimate.totalCalls).toBe(10);
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.cases[0].caseId).toBe("a");
  });

  it("still estimates for an unknown model", () => {
    const config = parseConfig({ ...CONFIG, model: "some-future-model" });
    const estimate = estimateCost(config);
    expect(estimate.pricingIsKnown).toBe(false);
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
  });
});
