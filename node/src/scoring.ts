import type { Normalize } from "./config.js";

const PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g;
const WHITESPACE_RE = /\s+/g;

export function normalizeText(text: string, normalize: Normalize): string {
  let result = text.trim();
  if (normalize.caseInsensitive) {
    result = result.toLowerCase();
  }
  if (normalize.stripPunctuation) {
    result = result.replace(PUNCTUATION_RE, "");
  }
  if (normalize.collapseWhitespace) {
    result = result.replace(WHITESPACE_RE, " ").trim();
  }
  return result;
}

export function extractAnswer(text: string, pattern: string | null): string {
  if (!pattern) {
    return text;
  }
  const match = new RegExp(pattern, "s").exec(text);
  if (!match) {
    return text;
  }
  return match.length > 1 ? match[1] : match[0];
}

export interface ScoreResult {
  consistencyScore: number;
  passed: boolean;
  distinctAnswers: number;
  majorityAnswer: string;
  distribution: Record<string, number>;
}

export function scoreResponses(
  rawResponses: string[],
  normalize: Normalize,
  threshold: number,
  extractPattern: string | null = null,
): ScoreResult {
  if (rawResponses.length === 0) {
    throw new Error("cannot score an empty list of responses");
  }

  const normalized = rawResponses.map((r) => normalizeText(extractAnswer(r, extractPattern), normalize));
  const counts = new Map<string, number>();
  for (const n of normalized) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  let majorityAnswer = normalized[0];
  let majorityCount = 0;
  for (const [answer, count] of counts) {
    if (count > majorityCount) {
      majorityAnswer = answer;
      majorityCount = count;
    }
  }

  const consistencyScore = majorityCount / normalized.length;
  return {
    consistencyScore,
    passed: consistencyScore >= threshold,
    distinctAnswers: counts.size,
    majorityAnswer,
    distribution: Object.fromEntries(counts),
  };
}
