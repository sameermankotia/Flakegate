from flakegate.config import parse_config
from flakegate.cost import estimate_cost

CONFIG = {
    "version": 1,
    "provider": "openai",
    "model": "gpt-4o-mini",
    "cases": [
        {
            "id": "a",
            "prompt": "a" * 400,
            "params": {"max_tokens": 100},
            "repeat": 10,
            "threshold": 0.8,
        }
    ],
}


def test_estimate_cost_known_model():
    config = parse_config(CONFIG)
    estimate = estimate_cost(config)
    assert estimate.pricing_is_known
    assert estimate.total_calls == 10
    assert estimate.total_estimated_cost_usd > 0
    assert estimate.cases[0].case_id == "a"


def test_estimate_cost_unknown_model_still_estimates():
    config = parse_config({**CONFIG, "model": "some-future-model"})
    estimate = estimate_cost(config)
    assert not estimate.pricing_is_known
    assert estimate.total_estimated_cost_usd > 0
