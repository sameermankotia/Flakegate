import pytest

from flakegate.config import ConfigError, load_config, parse_config

VALID = {
    "version": 1,
    "provider": "openai",
    "model": "gpt-4o-mini",
    "cases": [
        {"id": "a", "prompt": "hi", "repeat": 5, "threshold": 0.8},
    ],
}


def test_parse_valid_config():
    config = parse_config(VALID)
    assert config.provider == "openai"
    assert config.cases[0].id == "a"
    assert config.concurrency == 5  # default
    assert config.api_key_env == "OPENROUTER_API_KEY"  # default


def test_parse_config_missing_prompt_and_messages_raises():
    bad = {**VALID, "cases": [{"id": "a", "repeat": 5, "threshold": 0.8}]}
    with pytest.raises(ConfigError, match="prompt' or 'messages'"):
        parse_config(bad)


def test_parse_config_both_prompt_and_messages_raises():
    bad = {
        **VALID,
        "cases": [
            {
                "id": "a",
                "prompt": "hi",
                "messages": [{"role": "user", "content": "hi"}],
                "repeat": 5,
                "threshold": 0.8,
            }
        ],
    }
    with pytest.raises(ConfigError, match="cannot define both"):
        parse_config(bad)


def test_parse_config_duplicate_case_ids_raises():
    bad = {
        **VALID,
        "cases": [
            {"id": "a", "prompt": "hi", "repeat": 5, "threshold": 0.8},
            {"id": "a", "prompt": "bye", "repeat": 5, "threshold": 0.8},
        ],
    }
    with pytest.raises(ConfigError, match="duplicate case id"):
        parse_config(bad)


def test_parse_config_unsupported_normalize_mode_raises():
    bad = {
        **VALID,
        "cases": [
            {
                "id": "a",
                "prompt": "hi",
                "repeat": 5,
                "threshold": 0.8,
                "normalize": {"mode": "embedding"},
            }
        ],
    }
    with pytest.raises(ConfigError, match="reserved for a future release"):
        parse_config(bad)


def test_parse_config_invalid_provider_fails_schema():
    bad = {**VALID, "provider": "not-a-real-provider"}
    with pytest.raises(ConfigError):
        parse_config(bad)


def test_load_config_missing_file_raises():
    with pytest.raises(ConfigError, match="not found"):
        load_config("/nonexistent/flakegate.yaml")
