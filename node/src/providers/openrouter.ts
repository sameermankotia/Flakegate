import OpenAI from "openai";
import type { ChatMessage } from "../config.js";
import { type CallResult, Provider, ProviderError } from "./base.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Calls OpenAI and Anthropic models through OpenRouter's unified, OpenAI-compatible API.
 * OpenRouter model slugs are '<provider>/<model>' (e.g. 'openai/gpt-4o-mini',
 * 'anthropic/claude-sonnet-5'); Flakegate builds that slug from the config's
 * separate 'provider' and 'model' fields.
 */
export class OpenRouterProvider extends Provider {
  private readonly client: OpenAI;

  constructor(slug: string, apiKeyEnv = "OPENROUTER_API_KEY") {
    super(slug, apiKeyEnv);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/sameermankotia/Flakegate",
        "X-Title": "Flakegate",
      },
    });
  }

  async complete(
    prompt: string | undefined,
    messages: ChatMessage[] | undefined,
    params: Record<string, unknown>,
  ): Promise<CallResult> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: Provider.toMessages(prompt, messages) as OpenAI.ChatCompletionMessageParam[],
        ...params,
      });
    } catch (err) {
      throw new ProviderError(`OpenRouter call failed for model '${this.model}': ${(err as Error).message}`);
    }

    const choice = response.choices[0];
    const usage = response.usage;
    return {
      text: choice.message.content ?? "",
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }
}
