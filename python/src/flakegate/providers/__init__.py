from __future__ import annotations

from flakegate.providers.base import CallResult, Provider, ProviderError

_SUPPORTED_PROVIDERS = ("openai", "anthropic")


def get_provider(name: str, model: str, api_key_env: str) -> Provider:
    if name not in _SUPPORTED_PROVIDERS:
        raise ProviderError(f"unknown provider '{name}'. Supported: {', '.join(_SUPPORTED_PROVIDERS)}")

    from flakegate.providers.openrouter import OpenRouterProvider

    slug = f"{name}/{model}"
    return OpenRouterProvider(slug=slug, api_key_env=api_key_env)


__all__ = ["CallResult", "Provider", "ProviderError", "get_provider"]
