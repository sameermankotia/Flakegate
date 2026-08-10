import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseConfig } from "../src/config.js";

const VALID = {
  version: 1,
  provider: "openai",
  model: "gpt-4o-mini",
  cases: [{ id: "a", prompt: "hi", repeat: 5, threshold: 0.8 }],
};

describe("parseConfig", () => {
  it("parses a valid config with defaults", () => {
    const config = parseConfig(VALID);
    expect(config.provider).toBe("openai");
    expect(config.cases[0].id).toBe("a");
    expect(config.concurrency).toBe(5);
    expect(config.apiKeyEnv).toBe("OPENROUTER_API_KEY");
  });

  it("rejects a case with neither prompt nor messages", () => {
    const bad = { ...VALID, cases: [{ id: "a", repeat: 5, threshold: 0.8 }] };
    expect(() => parseConfig(bad)).toThrow(/prompt' or 'messages'/);
  });

  it("rejects a case with both prompt and messages", () => {
    const bad = {
      ...VALID,
      cases: [
        { id: "a", prompt: "hi", messages: [{ role: "user", content: "hi" }], repeat: 5, threshold: 0.8 },
      ],
    };
    expect(() => parseConfig(bad)).toThrow(/cannot define both/);
  });

  it("rejects duplicate case ids", () => {
    const bad = {
      ...VALID,
      cases: [
        { id: "a", prompt: "hi", repeat: 5, threshold: 0.8 },
        { id: "a", prompt: "bye", repeat: 5, threshold: 0.8 },
      ],
    };
    expect(() => parseConfig(bad)).toThrow(/duplicate case id/);
  });

  it("rejects a reserved normalize.mode", () => {
    const bad = {
      ...VALID,
      cases: [{ id: "a", prompt: "hi", repeat: 5, threshold: 0.8, normalize: { mode: "embedding" } }],
    };
    expect(() => parseConfig(bad)).toThrow(/reserved for a future release/);
  });

  it("rejects an invalid provider via schema validation", () => {
    const bad = { ...VALID, provider: "not-a-real-provider" };
    expect(() => parseConfig(bad)).toThrow(ConfigError);
  });
});

describe("loadConfig", () => {
  it("throws ConfigError when the file does not exist", () => {
    expect(() => loadConfig("/nonexistent/flakegate.yaml")).toThrow(/not found/);
  });
});
