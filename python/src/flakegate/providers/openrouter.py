from __future__ import annotations

from typing import Any

from flakegate.providers.base import CallResult, Provider, ProviderError

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterProvider(Provider):
    """Calls OpenAI and Anthropic models through OpenRouter's unified, OpenAI-compatible API.

    OpenRouter model slugs are '<provider>/<model>' (e.g. 'openai/gpt-4o-mini',
    'anthropic/claude-sonnet-5'); Flakegate builds that slug from the config's
    separate 'provider' and 'model' fields.
    """

    def __init__(self, slug: str, api_key_env: str = "OPENROUTER_API_KEY"):
        super().__init__(slug, api_key_env)
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ProviderError(
                "the 'openai' package is required (used as the HTTP client for OpenRouter). "
                "Install it with: pip install flakegate"
            ) from exc
        self._client = OpenAI(
            api_key=self.api_key,
            base_url=OPENROUTER_BASE_URL,
            default_headers={
                "HTTP-Referer": "https://github.com/sameermankotia/Flakegate",
                "X-Title": "Flakegate",
            },
        )

    def complete(
        self,
        prompt: str | None,
        messages: list[dict[str, str]] | None,
        params: dict[str, Any],
    ) -> CallResult:
        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=self._to_messages(prompt, messages),
                **params,
            )
        except Exception as exc:  # noqa: BLE001 - surface any SDK/API error uniformly
            raise ProviderError(f"OpenRouter call failed for model '{self.model}': {exc}") from exc

        choice = response.choices[0]
        usage = response.usage
        return CallResult(
            text=choice.message.content or "",
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
        )
