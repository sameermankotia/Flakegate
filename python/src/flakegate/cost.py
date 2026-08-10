from __future__ import annotations

from dataclasses import dataclass

from flakegate.config import Case, FlakegateConfig

# Approximate USD price per 1M tokens, (input, output). Best-effort estimate only —
# prices change; treat --dry-run output as a ballpark, not a bill.
_PRICING_PER_MILLION: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "claude-opus-5": (15.00, 75.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-haiku-4-5-20251001": (0.80, 4.00),
}
_DEFAULT_PRICING = (1.00, 3.00)

_CHARS_PER_TOKEN = 4  # rough English-text heuristic


def _estimate_prompt_tokens(case: Case) -> int:
    if case.messages:
        text = " ".join(m["content"] for m in case.messages)
    else:
        text = case.prompt or ""
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _estimate_completion_tokens(case: Case) -> int:
    return int(case.params.get("max_tokens", 300))


@dataclass(frozen=True)
class CaseCostEstimate:
    case_id: str
    calls: int
    estimated_prompt_tokens: int
    estimated_completion_tokens: int
    estimated_cost_usd: float


@dataclass(frozen=True)
class CostEstimate:
    cases: list[CaseCostEstimate]
    total_calls: int
    total_estimated_cost_usd: float
    pricing_is_known: bool


def estimate_cost(config: FlakegateConfig) -> CostEstimate:
    input_price, output_price = _PRICING_PER_MILLION.get(config.model, _DEFAULT_PRICING)
    pricing_is_known = config.model in _PRICING_PER_MILLION

    case_estimates = []
    for case in config.cases:
        prompt_tokens = _estimate_prompt_tokens(case) * case.repeat
        completion_tokens = _estimate_completion_tokens(case) * case.repeat
        cost = (prompt_tokens / 1_000_000) * input_price + (completion_tokens / 1_000_000) * output_price
        case_estimates.append(
            CaseCostEstimate(
                case_id=case.id,
                calls=case.repeat,
                estimated_prompt_tokens=prompt_tokens,
                estimated_completion_tokens=completion_tokens,
                estimated_cost_usd=round(cost, 4),
            )
        )

    return CostEstimate(
        cases=case_estimates,
        total_calls=sum(c.calls for c in case_estimates),
        total_estimated_cost_usd=round(sum(c.estimated_cost_usd for c in case_estimates), 4),
        pricing_is_known=pricing_is_known,
    )
