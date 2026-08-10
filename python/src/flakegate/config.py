from __future__ import annotations

import json
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

import jsonschema
import yaml


class ConfigError(ValueError):
    """Raised when a flakegate.yaml file is missing, malformed, or fails schema validation."""


@dataclass(frozen=True)
class Normalize:
    mode: str = "exact"
    case_insensitive: bool = True
    collapse_whitespace: bool = True
    strip_punctuation: bool = False


@dataclass(frozen=True)
class Case:
    id: str
    repeat: int
    threshold: float
    prompt: str | None = None
    messages: list[dict[str, str]] | None = None
    params: dict[str, Any] = field(default_factory=dict)
    normalize: Normalize = field(default_factory=Normalize)
    extract: str | None = None


@dataclass(frozen=True)
class FlakegateConfig:
    provider: str
    model: str
    cases: list[Case]
    api_key_env: str = "OPENROUTER_API_KEY"
    concurrency: int = 5


def _schema() -> dict[str, Any]:
    schema_text = resources.files("flakegate").joinpath("config.schema.json").read_text()
    return json.loads(schema_text)


def _parse_case(raw: dict[str, Any]) -> Case:
    if "prompt" not in raw and "messages" not in raw:
        raise ConfigError(f"case '{raw.get('id', '?')}' must define either 'prompt' or 'messages'")
    if "prompt" in raw and "messages" in raw:
        raise ConfigError(f"case '{raw.get('id', '?')}' cannot define both 'prompt' and 'messages'")

    norm_raw = raw.get("normalize", {})
    normalize = Normalize(
        mode=norm_raw.get("mode", "exact"),
        case_insensitive=norm_raw.get("case_insensitive", True),
        collapse_whitespace=norm_raw.get("collapse_whitespace", True),
        strip_punctuation=norm_raw.get("strip_punctuation", False),
    )
    if normalize.mode != "exact":
        raise ConfigError(
            f"case '{raw['id']}': normalize.mode='{normalize.mode}' is reserved for a future "
            "release. v1 only implements 'exact'."
        )

    return Case(
        id=raw["id"],
        repeat=raw["repeat"],
        threshold=raw["threshold"],
        prompt=raw.get("prompt"),
        messages=raw.get("messages"),
        params=raw.get("params", {}),
        normalize=normalize,
        extract=raw.get("extract"),
    )


def parse_config(raw: dict[str, Any]) -> FlakegateConfig:
    try:
        jsonschema.validate(instance=raw, schema=_schema())
    except jsonschema.ValidationError as exc:
        raise ConfigError(f"invalid flakegate config: {exc.message}") from exc

    cases = [_parse_case(c) for c in raw["cases"]]
    seen_ids = set()
    for case in cases:
        if case.id in seen_ids:
            raise ConfigError(f"duplicate case id: '{case.id}'")
        seen_ids.add(case.id)

    return FlakegateConfig(
        provider=raw["provider"],
        model=raw["model"],
        cases=cases,
        api_key_env=raw.get("api_key_env", "OPENROUTER_API_KEY"),
        concurrency=raw.get("concurrency", 5),
    )


def load_config(path: str | Path) -> FlakegateConfig:
    path = Path(path)
    if not path.exists():
        raise ConfigError(f"config file not found: {path}")
    try:
        raw = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        raise ConfigError(f"could not parse YAML in {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ConfigError(f"{path} must contain a YAML mapping at the top level")
    return parse_config(raw)
