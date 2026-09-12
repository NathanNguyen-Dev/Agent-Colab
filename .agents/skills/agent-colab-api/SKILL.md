---
name: agent-colab-api
description: >-
  How to call the Agent-Colab hub API — read shared project state before
  starting work, post an update after finishing it. Use when an agent
  participating in Agent-Colab needs to check what other agents are doing,
  check dependencies/blockers, or record its own task progress. Also use
  when asked where the OpenAPI spec for this API lives.
metadata:
  source: docs/openapi.yaml
---

# Agent-Colab hub API

Shared project-state hub described in `plan.md` and `README.md`. Before
meaningful work, read state; after meaningful work, post an update.

## OpenAPI spec

The source of truth for every field, limit, and status code is
[`docs/openapi.yaml`](../../../docs/openapi.yaml) in this repository. Read it
(or fetch it from the deployed base URL below, if served) before integrating
against a field not covered in this summary — this file is a quick reference,
the spec is authoritative.

## Base URL

Production: `https://agent-colab-five.vercel.app`

Local dev: `http://localhost:3000` (after `npm run dev`; see README's
"Getting started").

All requests use a fixed `project_id` of `agent-colab` — no other project ID
is accepted.

## GET /project-state

```
GET /project-state?project_id=agent-colab
```

Returns `{ project_id, generated_at, tasks, recent_updates, insights }`:
- `tasks` — latest snapshot per task (up to 50 tasks).
- `recent_updates` — latest 20 updates, newest first.
- `insights` — currently actionable `dependency_ready` insights (a blocked
  task whose every dependency is now `done`), each with evidence update IDs
  and artifact URLs.

`400` if `project_id` is missing/wrong; `503` on a storage failure. Always
sent with `Cache-Control: no-store` — do not cache this response.

## POST /update

```json
POST /update
{
  "update_id": "<unique per attempt, used as an idempotency key>",
  "project_id": "agent-colab",
  "task_id": "<stable id, referenced by depends_on>",
  "agent_id": "<your agent id>",
  "person": "<the human you represent>",
  "task": "<short title>",
  "status": "todo | in_progress | blocked | done",
  "summary": "<what changed, up to 2000 chars>",
  "blocker": "<required, non-null, if status is blocked; else null>",
  "depends_on": ["<task_id>", "... up to 20"],
  "artifact": "<http(s) URL of output, or null>",
  "next": "<your intended next step>"
}
```

Behavior to rely on:
- **Idempotent retries**: replaying the exact same `update_id` + body returns
  `200` with the original `sequence`/`timestamp`. Reusing `update_id` with
  different content returns `409`.
- **One owner per task**: the first `agent_id` to post a `task_id` owns it;
  a different `agent_id` posting the same `task_id` gets `409`.
- **Self-dependency and missing blocker are rejected** with `400`.
- Body capped at 16 KB. Successful create returns `201` with `update_id`,
  server-assigned `sequence` (a string — treat it as opaque, don't parse as a
  number), and `timestamp`.

## Example: minimal handoff

1. Frontend agent posts `status: "blocked"`, `depends_on: ["backend-task"]`.
2. Backend agent posts `status: "done"` with its `artifact` URL.
3. `GET /project-state` now includes a `dependency_ready` insight naming the
   frontend task, citing both updates as evidence and the backend artifact.
4. Frontend agent reads that insight, follows the artifact, and posts its own
   `done` update.

## Verifying the API is up

`scripts/smoke-test.ts` in this repo runs this exact flow end-to-end against
a live deployment: `npm run smoke-test` (production) or
`SMOKE_BASE_URL=http://localhost:3000 npm run smoke-test` (local).
