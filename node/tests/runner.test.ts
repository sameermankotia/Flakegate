import { beforeEach, describe, expect, it } from "vitest";
import type { Case, ChatMessage, Normalize } from "../src/config.js";
import { type CallResult, Provider, ProviderError } from "../src/providers/base.js";
import { _setRetryBackoffMsForTests, runCase } from "../src/runner.js";

const defaultNormalize: Normalize = {
  mode: "exact",
  caseInsensitive: true,
  collapseWhitespace: true,
  stripPunctuation: false,
};

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-1",
    prompt: "hi",
    params: {},
    repeat: 6,
    threshold: 0.8,
    normalize: defaultNormalize,
    extract: null,
    ...overrides,
  };
}

class FakeProvider extends Provider {
  private callCount = 0;
  private readonly responses: string[];
  private readonly failTimes: number;

  constructor(responses: string[] = ["ok"], failTimes = 0) {
    // Bypass the base constructor's env-var check — this fake never touches the network.
    super("fake-model", "__FAKE_UNUSED__");
    this.responses = responses;
    this.failTimes = failTimes;
  }

  async complete(
    _prompt: string | undefined,
    _messages: ChatMessage[] | undefined,
    _params: Record<string, unknown>,
  ): Promise<CallResult> {
    this.callCount += 1;
    if (this.callCount <= this.failTimes) {
      throw new ProviderError("simulated transient failure");
    }
    const text = this.responses[(this.callCount - 1) % this.responses.length];
    return { text, promptTokens: 10, completionTokens: 5 };
  }
}

beforeEach(() => {
  process.env.__FAKE_UNUSED__ = "fake-key";
  _setRetryBackoffMsForTests(0);
});

describe("runCase", () => {
  it("passes when all responses agree", async () => {
    const provider = new FakeProvider(["Yes"]);
    const result = await runCase(provider, makeCase(), 3);
    expect(result.score.passed).toBe(true);
    expect(result.score.consistencyScore).toBe(1.0);
    expect(result.rawResponses).toHaveLength(6);
  });

  it("fails when responses disagree past threshold", async () => {
    const provider = new FakeProvider(["Yes", "No", "Maybe"]);
    const result = await runCase(provider, makeCase({ threshold: 0.9 }), 3);
    expect(result.score.passed).toBe(false);
  });

  it("retries transient failures and still succeeds", async () => {
    const provider = new FakeProvider(["Yes"], 2);
    const result = await runCase(provider, makeCase({ repeat: 3 }), 1);
    expect(result.rawResponses).toHaveLength(3);
    expect(result.score.consistencyScore).toBe(1.0);
  });

  it("throws when every call fails", async () => {
    class AlwaysFailProvider extends Provider {
      constructor() {
        super("fake", "__FAKE_UNUSED__");
      }
      async complete(): Promise<CallResult> {
        throw new ProviderError("nope");
      }
    }
    await expect(runCase(new AlwaysFailProvider(), makeCase({ repeat: 2 }), 2)).rejects.toThrow(
      /all 2 calls failed/,
    );
  });
});
