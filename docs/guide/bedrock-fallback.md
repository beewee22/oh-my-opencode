# Bedrock Fallback for Claude Quota Exhaustion (Local Only)

This guide explains how to set up a safe, local-only fallback from `anthropic/*` Claude models to `amazon-bedrock/*` Claude models when Anthropic quota/credit is exhausted.

## Goals

- Prefer Anthropic (Claude subscription) for normal usage.
- When Anthropic returns a quota/billing exhaustion error, retry once on Bedrock.
- Never guess Bedrock model IDs. Fallback only happens when a matching Bedrock alias exists.

## Important Notes

- This works only in your local environment (your OpenCode config + this plugin).
- If you hardcode a model override in `~/.config/opencode/oh-my-opencode.json`, the provider fallback chain is skipped.
  See `docs/configurations.md` for details.

## 1) Configure Bedrock aliases in OpenCode config

Bedrock model IDs usually differ from Anthropic model IDs (e.g. `anthropic.claude-opus-4-6-v1`).
To enable a consistent name like `amazon-bedrock/claude-opus-4-6`, add aliases to:

- `~/.config/opencode/opencode.json`

Example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "amazon-bedrock": {
      "options": {
        "region": "ap-northeast-2"
      },
      "models": {
        "claude-opus-4-6": {
          "id": "anthropic.claude-opus-4-6-v1"
        },
        "claude-sonnet-4-5": {
          "id": "anthropic.claude-sonnet-4-5-20250929-v1:0"
        },
        "claude-haiku-4-5": {
          "id": "anthropic.claude-haiku-4-5-20251001-v1:0"
        }
      }
    }
  }
}
```

## 2) Verify aliases are visible

```bash
opencode debug config | sed -n '/"amazon-bedrock"/,+30p'
opencode models amazon-bedrock | grep -E 'amazon-bedrock/claude-(opus|sonnet|haiku)'
```

You should see entries like:

- `amazon-bedrock/claude-opus-4-6`
- `amazon-bedrock/claude-sonnet-4-5`
- `amazon-bedrock/claude-haiku-4-5`

## 3) How fallback works

When a prompt is sent with an explicit Anthropic Claude model (e.g. `anthropic/claude-opus-4-6`):

- If Anthropic responds with a quota/billing exhaustion error (e.g. 429 + `insufficient_quota`), the plugin:
  - checks whether `amazon-bedrock/<same modelID>` exists in the local model list
  - retries once using `providerID=amazon-bedrock` and the aliased model ID

If the alias does not exist, the plugin does not retry and returns the original error.

## 4) Monitoring usage (optional)

To monitor spend/usage by model:

```bash
opencode stats --models
```

If you want to scope to a project, use `--project` (see `opencode stats --help`).

## Rollback

- Remove the `amazon-bedrock.models` aliases from `~/.config/opencode/opencode.json`.
- The plugin will stop retrying automatically (it refuses to guess model IDs).
