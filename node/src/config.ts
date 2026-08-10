import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv";
import type { ErrorObject } from "ajv";
import { parse as parseYaml } from "yaml";

const Ajv = AjvModule.default ?? AjvModule;

export class ConfigError extends Error {}

export interface Normalize {
  mode: "exact";
  caseInsensitive: boolean;
  collapseWhitespace: boolean;
  stripPunctuation: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Case {
  id: string;
  prompt?: string;
  messages?: ChatMessage[];
  params: Record<string, unknown>;
  repeat: number;
  threshold: number;
  normalize: Normalize;
  extract: string | null;
}

export interface FlakegateConfig {
  provider: "openai" | "anthropic";
  model: string;
  apiKeyEnv: string;
  concurrency: number;
  cases: Case[];
}

let cachedSchema: Record<string, unknown> | undefined;

function loadSchema(): Record<string, unknown> {
  if (!cachedSchema) {
    const schemaPath = fileURLToPath(new URL("./config.schema.json", import.meta.url));
    cachedSchema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
  }
  return cachedSchema;
}

const ajv = new Ajv({ allErrors: true, strict: false });

function validateAgainstSchema(raw: unknown): void {
  const validate = ajv.compile(loadSchema());
  if (!validate(raw)) {
    const message = (validate.errors ?? [])
      .map((e: ErrorObject) => `${e.instancePath || "<root>"} ${e.message}`)
      .join("; ");
    throw new ConfigError(`invalid flakegate config: ${message}`);
  }
}

function parseCase(raw: Record<string, unknown>): Case {
  const id = raw.id as string;
  const hasPrompt = "prompt" in raw;
  const hasMessages = "messages" in raw;

  if (!hasPrompt && !hasMessages) {
    throw new ConfigError(`case '${id ?? "?"}' must define either 'prompt' or 'messages'`);
  }
  if (hasPrompt && hasMessages) {
    throw new ConfigError(`case '${id ?? "?"}' cannot define both 'prompt' and 'messages'`);
  }

  const normRaw = (raw.normalize as Record<string, unknown>) ?? {};
  const mode = (normRaw.mode as string) ?? "exact";
  if (mode !== "exact") {
    throw new ConfigError(
      `case '${id}': normalize.mode='${mode}' is reserved for a future release. v1 only implements 'exact'.`,
    );
  }

  const normalize: Normalize = {
    mode: "exact",
    caseInsensitive: (normRaw.case_insensitive as boolean) ?? true,
    collapseWhitespace: (normRaw.collapse_whitespace as boolean) ?? true,
    stripPunctuation: (normRaw.strip_punctuation as boolean) ?? false,
  };

  return {
    id,
    prompt: raw.prompt as string | undefined,
    messages: raw.messages as ChatMessage[] | undefined,
    params: (raw.params as Record<string, unknown>) ?? {},
    repeat: raw.repeat as number,
    threshold: raw.threshold as number,
    normalize,
    extract: (raw.extract as string | null) ?? null,
  };
}

export function parseConfig(raw: unknown): FlakegateConfig {
  validateAgainstSchema(raw);
  const obj = raw as Record<string, unknown>;
  const rawCases = obj.cases as Record<string, unknown>[];

  const cases = rawCases.map(parseCase);
  const seenIds = new Set<string>();
  for (const c of cases) {
    if (seenIds.has(c.id)) {
      throw new ConfigError(`duplicate case id: '${c.id}'`);
    }
    seenIds.add(c.id);
  }

  return {
    provider: obj.provider as "openai" | "anthropic",
    model: obj.model as string,
    apiKeyEnv: (obj.api_key_env as string) ?? "OPENROUTER_API_KEY",
    concurrency: (obj.concurrency as number) ?? 5,
    cases,
  };
}

export function loadConfig(path: string): FlakegateConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    throw new ConfigError(`config file not found: ${path}`);
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new ConfigError(`could not parse YAML in ${path}: ${(err as Error).message}`);
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${path} must contain a YAML mapping at the top level`);
  }

  return parseConfig(raw);
}
