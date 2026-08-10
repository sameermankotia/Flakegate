from __future__ import annotations

import json
from typing import Any

from flakegate.runner import RunResult


def to_dict(run: RunResult) -> dict[str, Any]:
    return {
        "passed": run.passed,
        "cases": [
            {
                "id": r.case_id,
                "repeat": len(r.raw_responses) + len(r.errors),
                "successful_calls": len(r.raw_responses),
                "failed_calls": len(r.errors),
                "consistency_score": round(r.score.consistency_score, 4),
                "threshold": r.threshold,
                "passed": r.score.passed,
                "distinct_answers": r.score.distinct_answers,
                "majority_answer": r.score.majority_answer,
                "distribution": r.score.distribution,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
            }
            for r in run.case_results
        ],
    }


def to_json(run: RunResult) -> str:
    return json.dumps(to_dict(run), indent=2)


def to_markdown(run: RunResult) -> str:
    status = "PASSED" if run.passed else "FAILED"
    lines = [
        f"## Flakegate report — {status}",
        "",
        "| Case | k | Distinct answers | Consistency | Threshold | Result |",
        "|---|---|---|---|---|---|",
    ]
    for r in run.case_results:
        k = len(r.raw_responses) + len(r.errors)
        mark = "PASS" if r.score.passed else "FAIL"
        lines.append(
            f"| `{r.case_id}` | {k} | {r.score.distinct_answers} | "
            f"{r.score.consistency_score:.0%} | {r.threshold:.0%} | {mark} |"
        )
        if r.errors:
            lines.append(f"|  |  |  |  |  | {len(r.errors)} call(s) errored |")
    return "\n".join(lines) + "\n"


def render(run: RunResult, fmt: str) -> str:
    if fmt == "json":
        return to_json(run)
    if fmt == "md":
        return to_markdown(run)
    raise ValueError(f"unknown report format: {fmt}")
