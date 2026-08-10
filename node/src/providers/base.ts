import type { ChatMessage } from "../config.js";

export class ProviderError extends Error {}

export interface CallResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export abstract class Provider {
  readonly model: string;
  readonly apiKey: string;

  constructor(model: string, apiKeyEnv: string) {
    this.model = model;
    const key = process.env[apiKeyEnv];
    if (!key) {
      throw new ProviderError(
        `environment variable '${apiKeyEnv}' is not set. Flakegate never reads API keys from the config file.`,
      );
    }
    this.apiKey = key;
  }

  abstract complete(
    prompt: string | undefined,
    messages: ChatMessage[] | undefined,
    params: Record<string, unknown>,
  ): Promise<CallResult>;

  protected static toMessages(
    prompt: string | undefined,
    messages: ChatMessage[] | undefined,
  ): ChatMessage[] {
    if (messages) {
      return messages;
    }
    return [{ role: "user", content: prompt ?? "" }];
  }
}
