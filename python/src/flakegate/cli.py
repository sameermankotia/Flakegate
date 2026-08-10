from __future__ import annotations

import sys
from pathlib import Path

import click

from flakegate.config import ConfigError, load_config
from flakegate.cost import estimate_cost
from flakegate.providers import ProviderError
from flakegate.report import render, to_dict
from flakegate.runner import run_config

STARTER_CONFIG = """\
version: 1
provider: openai
model: gpt-4o-mini
api_key_env: OPENROUTER_API_KEY
concurrency: 5

cases:
  - id: my-first-case
    prompt: "Replace this with a real prompt from your application."
    params:
      temperature: 0.7
      max_tokens: 300
    repeat: 10
    threshold: 0.8
    normalize:
      mode: exact
      case_insensitive: true
      collapse_whitespace: true
"""


@click.group()
@click.version_option(package_name="flakegate")
def main() -> None:
    """Flakegate — a reliability gate for LLM calls in CI."""


@main.command()
@click.option("--path", default="flakegate.yaml", show_default=True, help="Where to write the starter config.")
def init(path: str) -> None:
    """Scaffold a starter flakegate.yaml in the current directory."""
    target = Path(path)
    if target.exists():
        raise click.ClickException(f"{target} already exists — refusing to overwrite it.")
    target.write_text(STARTER_CONFIG)
    click.echo(f"Wrote {target}. Set your provider's API key env var, then run: flakegate run")


@main.command()
@click.option("--config", "config_path", default="flakegate.yaml", show_default=True, help="Path to flakegate.yaml.")
@click.option("--report", "report_format", type=click.Choice(["json", "md"]), default="md", show_default=True)
@click.option("--out", "out_path", default=None, help="Write the report to this file instead of stdout.")
@click.option("--fail-under", "fail_under", type=float, default=None, help="Override every case's threshold with this value.")
@click.option("--dry-run", is_flag=True, help="Estimate token cost without making any API calls.")
def run(config_path: str, report_format: str, out_path: str | None, fail_under: float | None, dry_run: bool) -> None:
    """Run every case in the config, score consistency, and gate on the result."""
    try:
        config = load_config(config_path)
    except ConfigError as exc:
        raise click.ClickException(str(exc)) from exc

    if fail_under is not None:
        config = _with_threshold_override(config, fail_under)

    if dry_run:
        estimate = estimate_cost(config)
        click.echo(f"Estimated calls: {estimate.total_calls}")
        click.echo(f"Estimated cost:  ${estimate.total_estimated_cost_usd:.4f}"
                   + ("" if estimate.pricing_is_known else "  (model pricing unknown — using a generic estimate)"))
        for case in estimate.cases:
            click.echo(f"  {case.case_id}: {case.calls} calls, ~${case.estimated_cost_usd:.4f}")
        return

    try:
        result = run_config(config)
    except ProviderError as exc:
        raise click.ClickException(str(exc)) from exc

    output = render(result, report_format)
    if out_path:
        Path(out_path).write_text(output)
        click.echo(f"Report written to {out_path}")
    else:
        click.echo(output)

    sys.exit(0 if result.passed else 1)


@main.command()
@click.argument("run_json", type=click.Path(exists=True))
def report(run_json: str) -> None:
    """Re-render a previously saved JSON run as a Markdown report."""
    import json

    from flakegate.report import to_markdown
    from flakegate.runner import CaseResult, RunResult
    from flakegate.scoring import ScoreResult

    data = json.loads(Path(run_json).read_text())
    case_results = [
        CaseResult(
            case_id=c["id"],
            threshold=c["threshold"],
            score=ScoreResult(
                consistency_score=c["consistency_score"],
                passed=c["passed"],
                distinct_answers=c["distinct_answers"],
                majority_answer=c["majority_answer"],
                distribution=c["distribution"],
            ),
            raw_responses=[""] * c["successful_calls"],
            errors=[""] * c["failed_calls"],
        )
        for c in data["cases"]
    ]
    run_result = RunResult(passed=data["passed"], case_results=case_results)
    click.echo(to_markdown(run_result))


def _with_threshold_override(config, fail_under: float):
    from dataclasses import replace

    new_cases = [replace(case, threshold=fail_under) for case in config.cases]
    return replace(config, cases=new_cases)


if __name__ == "__main__":
    main()
