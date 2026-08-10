import itertools

import pytest

from flakegate.config import Case, Normalize
from flakegate.providers.base import CallResult, Provider, ProviderError
from flakegate.runner import run_case


class FakeProvider(Provider):
    """A Provider stand-in that never touches the network or env vars."""

    def __init__(self, responses=None, fail_times=0):
        self.model = "fake-model"
        self.api_key = "fake-key"
        self._responses = itertools.cycle(responses or ["ok"])
        self._fail_times = fail_times
        self._call_count = 0

    def complete(self, prompt, messages, params):
        self._call_count += 1
        if self._call_count <= self._fail_times:
            raise ProviderError("simulated transient failure")
        return CallResult(text=next(self._responses), prompt_tokens=10, completion_tokens=5)


def make_case(**overrides):
    defaults = dict(id="case-1", prompt="hi", repeat=6, threshold=0.8, normalize=Normalize())
    defaults.update(overrides)
    return Case(**defaults)


def test_run_case_all_consistent_passes():
    provider = FakeProvider(responses=["Yes"])
    case = make_case()
    result = run_case(provider, case, concurrency=3)
    assert result.score.passed
    assert result.score.consistency_score == 1.0
    assert len(result.raw_responses) == 6


def test_run_case_inconsistent_fails():
    provider = FakeProvider(responses=["Yes", "No", "Maybe"])
    case = make_case(threshold=0.9)
    result = run_case(provider, case, concurrency=3)
    assert not result.score.passed


def test_run_case_retries_transient_failures(monkeypatch):
    import flakegate.runner as runner_module

    monkeypatch.setattr(runner_module, "RETRY_BACKOFF_SECONDS", 0)
    provider = FakeProvider(responses=["Yes"], fail_times=2)
    case = make_case(repeat=3)
    result = run_case(provider, case, concurrency=1)
    assert len(result.raw_responses) == 3
    assert result.score.consistency_score == 1.0


def test_run_case_all_calls_fail_raises(monkeypatch):
    import flakegate.runner as runner_module

    monkeypatch.setattr(runner_module, "RETRY_BACKOFF_SECONDS", 0)

    class AlwaysFailProvider(Provider):
        def __init__(self):
            self.model = "fake"
            self.api_key = "fake"

        def complete(self, prompt, messages, params):
            raise ProviderError("nope")

    case = make_case(repeat=2)
    with pytest.raises(ProviderError, match="all 2 calls failed"):
        run_case(AlwaysFailProvider(), case, concurrency=2)
