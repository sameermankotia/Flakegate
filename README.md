# Flakegate

**A reliability gate for LLM calls in CI.**

Any team shipping an LLM feature has the same unsolved problem: the same prompt
can return a materially different answer on the next run, and nobody measures
it. Flakegate runs a prompt `k` times, scores how consistent the outputs are,
and fails your CI build if consistency drops below a threshold. One command,
one number in the report.

Think "pytest for LLM consistency," not a new eval framework to learn.

```
$ flakegate run
## Flakegate report — FAILED

| Case                      | k  | Distinct answers | Consistency | Threshold | Result |
|----------------------------|----|-------------------|--------------|-----------|--------|
| refund-policy-qa           | 10 | 1                 | 100%         | 80%       | PASS   |
| order-status-classification| 8  | 3                 | 62%          | 95%       | FAIL   |

$ echo $?
1
```

## Why this exists

- **Nondeterminism is invisible until it isn't.** A prompt that's 95% stable in
  manual testing can flip its answer 1 time in 5 in production. Nothing in a
  typical CI pipeline catches that.
- **Consistency is a build-quality signal, like a flaky test.** Flakegate
  treats it the same way: run it enough times, measure agreement, gate on it.
- **It should take one command.** `flakegate run` — no new eval harness, no
  dashboard to stand up, no dataset to curate beyond the prompts you already
  have.

## How it works

1. For each case in your config, Flakegate calls the model `repeat` (`k`)
   times with identical inputs.
2. Every response is normalized (case-folding, whitespace collapsing, and
   optionally a regex to isolate a final answer from a longer
   chain-of-thought preamble) and grouped into equivalence classes.
3. `consistency_score = size(largest group) / k` — the majority-agreement
   ratio.
4. A case passes if `consistency_score >= threshold`. The run passes only if
   every case does. Exit code `0` on pass, `1` on fail — that's the actual CI
   gate.

## Install

Calls are routed through [OpenRouter](https://openrouter.ai)'s unified,
OpenAI-compatible API, so **one `OPENROUTER_API_KEY` covers both OpenAI and
Anthropic models** — no separate provider SDKs or accounts to wire up.

```bash
# Python
pip install flakegate

# Node
npm install -g flakegate
```

```bash
export OPENROUTER_API_KEY=sk-or-...
flakegate init   # scaffolds flakegate.yaml
flakegate run
```

## Config reference (`flakegate.yaml`)

```yaml
version: 1
provider: openai # openai | anthropic — picks the OpenRouter model-slug prefix
model: gpt-4o-mini # bare model name; Flakegate builds '<provider>/<model>' internally
api_key_env: OPENROUTER_API_KEY
concurrency: 5 # max parallel calls per case

cases:
  - id: refund-policy-qa
    prompt: "What is our refund policy for orders older than 30 days?"
    # or, for multi-turn:
    # messages:
    #   - { role: system, content: "You are a support agent." }
    #   - { role: user, content: "..." }
    params:
      temperature: 0.7
      max_tokens: 300
    repeat: 10 # k — how many times to call the model
    threshold: 0.8 # min majority-agreement ratio to pass
    normalize:
      mode: exact # v1 supports 'exact' only; 'embedding' and 'llm_judge' are reserved
      case_insensitive: true
      collapse_whitespace: true
      strip_punctuation: false
    extract: null # optional regex with a capture group, e.g. 'Final answer:\s*(\w+)'
```

The full schema lives at [`spec/config.schema.json`](spec/config.schema.json)
and is validated by both language implementations, so a config that passes in
one CLI passes in the other. More examples: [`examples/`](examples/).

## CLI

Identical surface in both languages:

```bash
flakegate init                     # scaffold a starter flakegate.yaml
flakegate run                      # run the gate; exit 0 pass / 1 fail
flakegate run --report json        # machine-readable report
flakegate run --out report.md      # write the report to a file
flakegate run --fail-under 0.9     # override every case's threshold
flakegate run --dry-run            # estimate token cost, zero API calls
flakegate report run.json          # re-render a saved JSON run as Markdown
```

## GitHub Actions

```yaml
name: Flakegate
on: pull_request
jobs:
  consistency-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sameermankotia/Flakegate/action@main
        with:
          config: flakegate.yaml
          runtime: python # or: node
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

The action installs the CLI, runs the gate, posts the Markdown report as a PR
comment, and fails the check when consistency drops below threshold. Full
example: [`examples/github-workflow.yml`](examples/github-workflow.yml).

## Repo layout

```
Flakegate/
├── spec/            # shared config + report JSON Schemas — the source of truth both languages implement
├── python/           # PyPI package "flakegate"
├── node/             # npm package "flakegate"
├── action/           # GitHub Action wrapping either CLI
└── examples/
```

## Scope (v1)

- Providers: OpenAI and Anthropic models, via OpenRouter.
- Scoring: exact/normalized text match. Embedding-similarity and
  LLM-as-judge modes are reserved in the config schema (`normalize.mode`) for
  a future release, so configs written today won't need to change.
- Plain text/chat completions only — no streaming or tool-call consistency
  checking yet.
- No response caching, historical trend dashboard, or badge service — a
  single-run gate and report, by design.

## Development

```bash
# Python
cd python && pip install -e ".[dev]" && pytest

# Node
cd node && npm install && npm run build && npm test
```

## License

MIT
