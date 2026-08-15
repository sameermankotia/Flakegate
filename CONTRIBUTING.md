# Contributing to Flakegate

Flakegate ships as two parity implementations — a Python package (`python/`)
and a Node/TypeScript package (`node/`) — both built against the same shared
contract in `spec/`. That's the one rule that shapes everything else here:
**a change to behavior almost always means a change in both languages.**

## Repo layout

```
Flakegate/
├── spec/            # config.schema.json + report.schema.json — the source of truth
├── python/           # PyPI package "flakegate"
├── node/             # npm package "flakegate"
├── action/            # GitHub Action wrapping both CLIs
└── examples/
```

## Dev setup

### Python

```bash
cd python
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
```

### Node

```bash
cd node
npm install
npm run build       # tsc + copies spec/config.schema.json into dist/
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

Run both before opening a PR, even if you only touched one language — see
below.

## The parity rule

If your change touches:

- **`spec/config.schema.json` or `spec/report.schema.json`** — copy the
  updated file into both `python/src/flakegate/config.schema.json` and
  `node/src/config.schema.json` (they're bundled copies, not symlinks — see
  `config.py` / `config.ts` for how each language loads them at runtime).
- **Scoring, normalization, or the config/report field names** — mirror the
  change in both `python/src/flakegate/scoring.py` /
  `node/src/scoring.ts` and their respective test files. JSON report keys are
  intentionally snake_case in *both* languages (not camelCase in Node) so a
  report from either CLI can be consumed identically — see the note at the
  top of `node/src/report.ts` if you're touching that file.
- **CLI flags or subcommands** — keep the surface identical
  (`flakegate init|run|report` with the same flag names) in
  `python/src/flakegate/cli.py` and `node/src/cli.ts`.

A PR that changes one language's behavior without the other is the kind of
drift this project is explicitly trying to avoid — expect a review comment
asking for the mirrored change rather than a merge.

## What a PR should include

- Tests for the behavior you changed, in whichever language(s) you touched.
  Both suites run against mocked/fake providers — no live API key or network
  call should be required to run `pytest` or `npm test`.
- If you touched `spec/`, confirm both bundled schema copies are back in
  sync (`diff spec/config.schema.json python/src/flakegate/config.schema.json`
  and the Node equivalent should be empty).
- A short note in the PR description on why, not just what — especially for
  anything affecting the config format, since that's a compatibility surface
  for anyone with an existing `flakegate.yaml`.

## Scope

Before proposing a new feature, check the [open `roadmap`-labeled
issues](https://github.com/sameermankotia/Flakegate/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)
— it may already be tracked with context on why it's not in v1 yet. The
README's "Scope (v1)" section lists what's deliberately out of bounds for
now (embedding/LLM-judge scoring, streaming, tool-call consistency, response
caching, historical trends) and why.

## Questions

Open an issue — there's no separate discussion forum for this project yet.
