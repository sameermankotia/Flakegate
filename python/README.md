# flakegate

A reliability gate for LLM calls in CI. Run a prompt `k` times, score output
consistency, and fail the build if it drops below a threshold.

See the [project README](https://github.com/sameermankotia/Flakegate) for full docs.

Calls are routed through [OpenRouter](https://openrouter.ai)'s unified API, so one
`OPENROUTER_API_KEY` covers both OpenAI and Anthropic models — no separate SDKs or
provider accounts required.

```bash
pip install flakegate
export OPENROUTER_API_KEY=sk-or-...
flakegate init
flakegate run
```
