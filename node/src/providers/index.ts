import type { Provider } from "./base.js";
import { ProviderError } from "./base.js";
import { OpenRouterProvider } from "./openrouter.js";

const SUPPORTED_PROVIDERS = ["openai", "anthropic"] as const;

export function getProvider(name: string, model: string, apiKeyEnv: string): Provider {
  if (!SUPPORTED_PROVIDERS.includes(name as (typeof SUPPORTED_PROVIDERS)[number])) {
    throw new ProviderError(`unknown provider '${name}'. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
  }
  const slug = `${name}/${model}`;
  return new OpenRouterProvider(slug, apiKeyEnv);
}

export type { CallResult, Provider } from "./base.js";
export { ProviderError } from "./base.js";
