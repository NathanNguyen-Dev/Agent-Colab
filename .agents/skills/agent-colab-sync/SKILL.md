---
name: agent-colab-sync
description: >-
  Install lifecycle hooks that automatically push each user prompt and what the
  coding agent did about it to the Agent-Colab hub, with no per-turn effort from
  the agent. Use when asked to set up, install, configure, disable, or debug
  automatic Agent-Colab syncing for Claude Code or Codex, or when asked why a
  session is (or is not) showing up in shared project state.
metadata:
  requires: agent-colab-api
  hook_events: UserPromptSubmit, Stop
---

# Agent-Colab sync hooks

Automatic half of Agent-Colab. The [`agent-colab-api`](../agent-colab-api/SKILL.md)
skill is how an agent *deliberately* reads and writes shared state; this skill
wires up the *ambient* stream underneath it, so a session shows up in the shared
stand-up even when nobody remembers to post.

Two hooks are installed:

| Event | Fires | Posts |
| --- | --- | --- |
| `UserPromptSubmit` | before the agent sees the prompt | `status: in_progress` carrying the prompt |
| `Stop` | when the agent finishes its turn | `status: done` carrying the final message and the files it touched |

Each session becomes one task, so the hub shows a live "who asked their agent
what, and what did it do" view. The payload is built by
`scripts/sync-hook.mjs` and follows `docs/openapi.yaml` exactly — read
`agent-colab-api` first if you need the field semantics.

## Install

Requires Node 20+ on `PATH` (the hook runs `node`, not the host agent).

```bash
# Claude Code — this project only (writes .claude/settings.json)
node .agents/skills/agent-colab-sync/scripts/install.mjs --runtime claude --scope project

# Claude Code — every project (writes ~/.claude/settings.json)
node .agents/skills/agent-colab-sync/scripts/install.mjs --runtime claude --scope user

# Codex — every project (writes ~/.codex/hooks.json)
node .agents/skills/agent-colab-sync/scripts/install.mjs --runtime codex --scope user
```

Add `--dry-run` to print the resulting config without writing it. The installer
merges into an existing file, backs it up first, and replaces only its own
entries — running it twice does not double-post. `--uninstall` removes them and
leaves everything else untouched.

Hooks are picked up by **new** sessions; restart the CLI after installing.

Codex also accepts a project-scoped `<repo>/.codex/hooks.json`
(`--runtime codex --scope project`), but note this repo's `.gitignore`
excludes `.codex/` — un-ignore that path before expecting teammates to get it.

## Identity and configuration

Resolved per invocation: environment variable, then `~/.agent-colab/config.json`,
then the default.

| Setting | Env var | Default |
| --- | --- | --- |
| Human being represented | `AGENT_COLAB_PERSON` | `git config user.name`, else `$USER` |
| Agent id | `AGENT_COLAB_AGENT_ID` | `claude-code-<person>` / `codex-<person>` |
| Hub base URL | `AGENT_COLAB_BASE_URL` | `https://agent-colab-five.vercel.app` |
| Project id | `AGENT_COLAB_PROJECT_ID` | `agent-colab` |
| Artifact URL for every update | `AGENT_COLAB_ARTIFACT` | `null` |
| Kill switch | `AGENT_COLAB_SYNC=0` | enabled |

```json
// ~/.agent-colab/config.json
{
  "person": "Khang",
  "agent_id": "codex-khang",
  "base_url": "https://agent-colab-five.vercel.app",
  "include_git_status": true,
  "timeout_ms": 4000,
  "enabled": true
}
```

Set `person` explicitly. A hub full of `unknown` is the most common misconfiguration.

## What the payload looks like

`task_id` is `<agent_id>-<repo>-<session prefix>`, stable for the life of a
session, so the prompt update and the turn update land on the same task. The
hub gives the first `agent_id` to post a `task_id` permanent ownership of it —
folding `agent_id` into `task_id` is what keeps two people's agents from
colliding.

`update_id` is `<session>-<prompt|stop>-<prompt_id or turn_id>`, which is a real
idempotency key: a host-level retry of the same hook replays the same update
(`200`) instead of creating a second one. If the body genuinely changed between
attempts the hub answers `409` and the write is dropped — deliberate, and the
reason a rerun never rewrites history.

Field-by-field mapping, and the hook input each runtime supplies, are in
[`reference/payload-mapping.md`](reference/payload-mapping.md).

## What these hooks deliberately do not do

A shell hook cannot know intent, so it never invents it. Every generated update
has `blocker: null`, `depends_on: []`, and `artifact: null` (unless configured),
and only ever uses `in_progress` and `done`.

Dependencies, blockers, and artifact links are exactly what makes the hub's
`dependency_ready` insight fire — so when a task is genuinely blocked or has
produced an artifact, post that yourself with `agent-colab-api`. Hook updates
are the ambient floor, not a replacement.

## Failure behavior

The hook never blocks a turn. It writes nothing to stdout (on `UserPromptSubmit`
stdout would be injected into the model's context), always exits `0`, and gives
up on the network after 4s. Every failure — bad config, hub down, `4xx` — is
appended to `~/.agent-colab/sync.log` and otherwise ignored.

## Troubleshooting

```bash
tail -20 ~/.agent-colab/sync.log      # every failure lands here

# Render the payload for a fake event without posting it (stderr, exits 0)
echo '{"session_id":"s1","prompt_id":"p1","cwd":"'$PWD'","hook_event_name":"UserPromptSubmit","model":"test","prompt_text":"hello"}' \
  | node .agents/skills/agent-colab-sync/scripts/sync-hook.mjs --runtime claude --dry-run
```

- **Nothing appears in the hub** — confirm the CLI was restarted, then check the
  log. A silent log plus no update usually means `AGENT_COLAB_SYNC=0`.
- **`409 ownership_or_limit`** — either another `agent_id` already owns that
  `task_id`, or the project is at its 50-task cap. The cap is per project, and
  session-per-task burns through it; prune or use a fresh `project_id` for demos.
- **Prompts look truncated** — `summary` is capped at 2000 characters by the API
  contract, `task` at 200.
- **Stop update says "tool-only turn"** — the turn ended without a final
  assistant message. The uncommitted-file list is the signal in that case.

## Privacy

These hooks push **full prompt text and the agent's final message** to a shared,
network-reachable hub. Credential-shaped strings (`sk-…`, `ghp_…`,
`github_pat_…`, `xox…`, inline URL passwords) are redacted first, but that is a
safety net, not a guarantee. Install this on work you are willing to share with
everyone who can read the project, and use `AGENT_COLAB_SYNC=0` for a session
that is not.
