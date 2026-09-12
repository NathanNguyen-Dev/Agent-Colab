# Hook input → `POST /update` payload

Reference for `scripts/sync-hook.mjs`. The target schema is
`docs/openapi.yaml` / `lib/contracts.ts`; the summary is in the
`agent-colab-api` skill.

## Hook input the script reads

Claude Code and Codex use the same hook wire format, and the small differences
are absorbed by reading both spellings.

| Field | Claude Code | Codex | Used for |
| --- | --- | --- | --- |
| `hook_event_name` | yes | yes | selects the branch |
| `session_id` | yes | yes | `task_id`, session state file |
| `cwd` | yes | yes | repo name, `git status` |
| `model` | yes | yes | summary/`next` attribution |
| prompt text | `prompt_text` | `prompt` | `task`, `summary` |
| turn identity | `prompt_id` | `turn_id` | `update_id` |
| `last_assistant_message` | yes | yes (nullable) | `Stop` summary |
| `transcript_path` | yes | nullable | unused — see below |

The script never parses the transcript. Both runtimes hand it
`last_assistant_message` directly, and a JSONL parser over two different,
undocumented transcript formats would fail silently and invisibly. When that
field is null, the uncommitted-file list carries the turn instead.

## Field mapping

| Payload field | `UserPromptSubmit` | `Stop` |
| --- | --- | --- |
| `update_id` | `<session>-prompt-<turn key>` | `<session>-stop-<turn key>` |
| `project_id` | config (`agent-colab`) | same |
| `task_id` | `<agent_id>-<repo>-<session prefix>` | same — both updates share one task |
| `agent_id` | config | same |
| `person` | config | same |
| `task` | first non-empty line of the prompt, ≤200 chars | the title remembered from this session's last prompt |
| `status` | `in_progress` | `done` |
| `summary` | `Prompt to <runtime>/<model> in <repo>:` + full prompt | final assistant message + uncommitted files |
| `blocker` | `null` | `null` |
| `depends_on` | `[]` | `[]` |
| `artifact` | `AGENT_COLAB_ARTIFACT` or `null` | same |
| `next` | `<runtime>/<model> is working on this prompt.` | `Awaiting the next prompt from <person>.` |

All strings are clamped to the API's limits (`summary` 2000, everything short
200) and are guaranteed non-empty — `summary` and `next` have a `min(1)` in
`lib/contracts.ts`, so an empty prompt is skipped rather than rejected.

## Session state

`~/.agent-colab/state/<session>.json` carries `{ turn, task, prompt, cwd }`
between the two events, which is how a `Stop` update knows which prompt it is
answering. Files older than 7 days are pruned on the next `UserPromptSubmit`.

A `Stop` with no state file — hooks installed mid-session — still posts, falling
back to `Session <prefix> in <repo>` as the title.

## Order of resolution for config

1. Environment variable (`AGENT_COLAB_*`)
2. `~/.agent-colab/config.json`, or `$AGENT_COLAB_CONFIG`
3. Built-in default

`person` falls back to `git config user.name`, then `$USER`, then `unknown`.
`agent_id` is derived from the runtime and person (`claude-code-khang`), which
keeps two humans on the same CLI from fighting over one task.
