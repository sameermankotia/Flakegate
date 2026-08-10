from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class ProviderError(RuntimeError):
    """Raised when a provider call fails or its API key is missing."""


@dataclass(frozen=True)
class CallResult:
    text: str
    prompt_tokens: int
    completion_tokens: int


class Provider(ABC):
    """A thin, synchronous wrapper around a single model call.

    Implementations must be safe to call repeatedly with identical arguments —
    that repetition is the entire point of Flakegate.
    """

    def __init__(self, model: str, api_key_env: str):
        self.model = model
        self.api_key = os.environ.get(api_key_env)
        if not self.api_key:
            raise ProviderError(
                f"environment variable '{api_key_env}' is not set. "
                "Flakegate never reads API keys from the config file."
            )

    @abstractmethod
    def complete(
        self,
        prompt: str | None,
        messages: list[dict[str, str]] | None,
        params: dict[str, Any],
    ) -> CallResult:
        """Issue a single completion call and return the text + token usage."""

    @staticmethod
    def _to_messages(prompt: str | None, messages: list[dict[str, str]] | None) -> list[dict[str, str]]:
        if messages is not None:
            return messages
        return [{"role": "user", "content": prompt or ""}]
