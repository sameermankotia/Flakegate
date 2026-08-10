from __future__ import annotations

import re
import string
from collections import Counter
from dataclasses import dataclass

from flakegate.config import Normalize

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCTUATION_TABLE = str.maketrans("", "", string.punctuation)


def normalize_text(text: str, normalize: Normalize) -> str:
    result = text.strip()
    if normalize.case_insensitive:
        result = result.lower()
    if normalize.strip_punctuation:
        result = result.translate(_PUNCTUATION_TABLE)
    if normalize.collapse_whitespace:
        result = _WHITESPACE_RE.sub(" ", result).strip()
    return result


def extract_answer(text: str, pattern: str | None) -> str:
    if not pattern:
        return text
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return text
    return match.group(1) if match.groups() else match.group(0)


@dataclass(frozen=True)
class ScoreResult:
    consistency_score: float
    passed: bool
    distinct_answers: int
    majority_answer: str
    distribution: dict[str, int]


def score_responses(
    raw_responses: list[str],
    normalize: Normalize,
    threshold: float,
    extract_pattern: str | None = None,
) -> ScoreResult:
    if not raw_responses:
        raise ValueError("cannot score an empty list of responses")

    normalized = [
        normalize_text(extract_answer(r, extract_pattern), normalize) for r in raw_responses
    ]
    counts = Counter(normalized)
    majority_answer, majority_count = counts.most_common(1)[0]
    consistency_score = majority_count / len(normalized)

    return ScoreResult(
        consistency_score=consistency_score,
        passed=consistency_score >= threshold,
        distinct_answers=len(counts),
        majority_answer=majority_answer,
        distribution=dict(counts),
    )
