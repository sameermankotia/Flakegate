import { describe, expect, it } from "vitest";
import type { Normalize } from "../src/config.js";
import { extractAnswer, normalizeText, scoreResponses } from "../src/scoring.js";

const defaultNormalize: Normalize = {
  mode: "exact",
  caseInsensitive: true,
  collapseWhitespace: true,
  stripPunctuation: false,
};

describe("normalizeText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeText("  Hello   World  ", defaultNormalize)).toBe("hello world");
  });

  it("strips punctuation when requested", () => {
    const normalize: Normalize = { ...defaultNormalize, caseInsensitive: false, stripPunctuation: true };
    expect(normalizeText("Yes!", normalize)).toBe("Yes");
  });
});

describe("scoreResponses", () => {
  it("scores full agreement as 1.0 and passing", () => {
    const result = scoreResponses(Array(10).fill("Yes"), defaultNormalize, 0.8);
    expect(result.consistencyScore).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.distinctAnswers).toBe(1);
  });

  it("fails when below threshold", () => {
    const responses = [...Array(5).fill("Yes"), ...Array(5).fill("No")];
    const result = scoreResponses(responses, defaultNormalize, 0.8);
    expect(result.consistencyScore).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.distinctAnswers).toBe(2);
  });

  it("passes when majority meets threshold exactly", () => {
    const responses = [...Array(8).fill("Yes"), ...Array(2).fill("No")];
    const result = scoreResponses(responses, defaultNormalize, 0.8);
    expect(result.consistencyScore).toBe(0.8);
    expect(result.passed).toBe(true);
    expect(result.majorityAnswer).toBe("yes");
  });
});

describe("extractAnswer", () => {
  it("extracts a capture group", () => {
    const text = "Some reasoning...\nFinal answer: SHIPPING";
    expect(extractAnswer(text, "Final answer:\\s*(\\w+)")).toBe("SHIPPING");
  });

  it("returns original text when pattern does not match", () => {
    expect(extractAnswer("no marker here", "Final answer:\\s*(\\w+)")).toBe("no marker here");
  });

  it("is a no-op when pattern is null", () => {
    expect(extractAnswer("raw text", null)).toBe("raw text");
  });
});
