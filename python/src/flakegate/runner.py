from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from flakegate.config import Case, FlakegateConfig
from flakegate.providers import Provider, ProviderError, get_provider
from flakegate.scoring import ScoreResult, score_responses

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 1.0


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    threshold: float
    score: ScoreResult
    raw_responses: list[str]
    errors: list[str] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass(frozen=True)
class RunResult:
    passed: bool
    case_results: list[CaseResult]


def _call_with_retry(provider: Provider, case: Case) -> tuple[str | None, str | None, int, int]:
    last_error: str | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = provider.complete(case.prompt, case.messages, dict(case.params))
            return result.text, None, result.prompt_tokens, result.completion_tokens
        except ProviderError as exc:
            last_error = str(exc)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    return None, last_error, 0, 0


def run_case(provider: Provider, case: Case, concurrency: int) -> CaseResult:
    responses: list[str] = []
    errors: list[str] = []
    total_prompt_tokens = 0
    total_completion_tokens = 0

    with ThreadPoolExecutor(max_workers=min(concurrency, case.repeat)) as executor:
        futures = [executor.submit(_call_with_retry, provider, case) for _ in range(case.repeat)]
        for future in as_completed(futures):
            text, error, prompt_tokens, completion_tokens = future.result()
            if error is not None:
                errors.append(error)
            else:
                responses.append(text)
                total_prompt_tokens += prompt_tokens
                total_completion_tokens += completion_tokens

    if not responses:
        raise ProviderError(
            f"case '{case.id}': all {case.repeat} calls failed. First error: {errors[0] if errors else 'unknown'}"
        )

    score = score_responses(responses, case.normalize, case.threshold, case.extract)
    return CaseResult(
        case_id=case.id,
        threshold=case.threshold,
        score=score,
        raw_responses=responses,
        errors=errors,
        prompt_tokens=total_prompt_tokens,
        completion_tokens=total_completion_tokens,
    )


def run_config(config: FlakegateConfig) -> RunResult:
    provider = get_provider(config.provider, config.model, config.api_key_env)
    case_results = [run_case(provider, case, config.concurrency) for case in config.cases]
    passed = all(result.score.passed for result in case_results)
    return RunResult(passed=passed, case_results=case_results)
