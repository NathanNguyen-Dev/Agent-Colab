# Agent in the loop

A shared workspace for humans and their personal AI agents. Agents report work
through a shared API; humans see the team on an animated canvas, inspect tasks,
and follow progress in a log.

## What works now

- The canvas reads real tasks from `GET /project-state?project_id=agent-colab`,
  refreshes every five seconds, and adds people/task nodes as updates arrive.
- Human grouping, statuses, dependencies, artifacts, and relative update times
  come from reported state. No sample teammates are inserted into an empty project.
- Log **All** shows the latest 20 historical updates, **Now** shows current open
  tasks, and **Done** shows completion events. A completed task can therefore have
  both its start and completion in history without remaining active on the canvas.
- Task details show dependency-ready insights and artifact links.
- Connection failures preserve the last successful snapshot and show a stale-data
  notice. Requests time out and retry; manual refresh is available.
- The backend from `main` implements validation, idempotent writes, task ownership,
  Neon persistence, and deterministic dependency insights.
- **Share Context** still contains browser-local Plan.md and Context.md drafts.
  Document synchronization and agent document access are not implemented.

### Identity: current implementation versus plan

The deployed API currently accepts `person` and `agent_id` in the POST body.
It does **not** yet implement the per-agent bearer tokens proposed in [plan.md](plan.md).
Names are reported identities, not verified credentials. Known names in agent IDs
select matching brand artwork; unknown IDs keep their label and a neutral icon.
The frontend does not invent a provider for `frontend-agent` or `backend-agent`.

The repo remains `Agent-Colab`; the internal project ID remains `agent-colab`.

## Run the integrated frontend

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open [the local workspace](http://localhost:3000). With the example configuration,
Next.js forwards its two API routes server-side to the deployed hub at
[agent-colab-five.vercel.app](https://agent-colab-five.vercel.app).
**Writes in this mode persist in the deployed project's database.** There is no
browser CORS setup or database credential involved in this mode.

To run both frontend and backend directly against Neon instead, remove
`HUB_API_URL`, configure `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` for migration
when available), apply `npm run db:migrate` if necessary, and run the app.
Never point `HUB_API_URL` at the app's own origin. On the combined Vercel deployment,
use its existing Neon variables and leave `HUB_API_URL` unset.

## Agent update contract

Read state before meaningful work and post progress afterward. See the complete
[OpenAPI specification](docs/openapi.yaml) and
[API skill](.agents/skills/agent-colab-api/SKILL.md).

```json
{
  "project_id": "agent-colab",
  "update_id": "unique-update-id",
  "task_id": "stable-task-id",
  "agent_id": "nathan-codex",
  "person": "Nathan",
  "task": "Connect the workspace",
  "status": "in_progress",
  "summary": "Connecting the canvas to shared project state.",
  "blocker": null,
  "depends_on": [],
  "artifact": null,
  "next": "Verify that the canvas refreshes after a new update."
}
```

POST to `/update` with `Content-Type: application/json`. A new event returns `201`;
identical retries return `200`; conflicting reuse or task ownership returns `409`.
Use a new update ID and the same task ID for each meaningful state transition.
Accepted statuses: `todo`, `in_progress`, `blocked`, `done`.

The server returns `timestamp` and a string `sequence`. The frontend and proxy
also accept the deployed hub's older `created_at` response. The direct database
read has been corrected to return `timestamp` in this checkout.

## Verification

```sh
npm run typecheck
npm run build
node --test scripts/workspace-view.test.mjs
SMOKE_BASE_URL=http://localhost:3000 npm run smoke-test
```

The smoke test creates timestamped tasks and checks validation, persistence,
idempotency, ownership, and dependency insights. It writes to whichever hub the
local app is configured to use. See [integration verification](docs/frontend-integration.md)
for the browser-observed end-to-end results.

## Deployment

Deploy the combined application to the existing Vercel project with Neon configured.
The backend README reported that automatic GitHub deployment was not connected for
the Vercel account. A push alone should not be assumed to deploy this frontend;
verify project Git settings or use an authenticated `vercel deploy --prod`.

## Main files

- `app/page.tsx` — canvas, log, details, and live connection state.
- `app/use-project-state.ts` — polling, timeout, retry, and stale-state handling.
- `lib/workspace-view.ts` — API normalization and frontend view mapping.
- `app/shared-context.tsx` — local document drafts.
- `app/update/route.ts`, `app/project-state/route.ts` — hub API.
- `lib/hub-proxy.ts` — optional server-side relay for local integration.
- `lib/store.ts`, `lib/db.ts`, `db/001_init.sql` — Neon storage.
- `public/agent-logos/SOURCES.md` — logo sources and attribution.

Keep local credentials in ignored `.env.local`; commit only placeholder examples.

### Keeping current work current

The canvas shows one node per human + agent identity, with only open tasks.
Select an agent to inspect its other open tasks. Completed updates stay in the
Log and API state for handoffs. Agents reuse a stable task ID and post progress,
then explicitly post `done`; starting new work does not close older work.

New task IDs duplicating an open title (case/whitespace normalized) return 409
with `code: duplicate_task` and `existing_task`. Different owners must coordinate;
existing tasks also retain their original human and agent owner. This check is
atomic in the Neon transaction after deployment. The local relay preflight is
best effort; direct calls to an older deployed hub do not gain this protection.
Existing historical duplicates are preserved, not silently marked complete.

### Automatic sync and reset

The agent-colab-sync skill installs prompt hooks that read shared context and report starts. Turn-end events do not close tasks; agents explicitly report completion through the API skill. Failed start events are retried from local storage. DELETE /project-state is an admin-only irreversible demo reset requiring x-admin-token and confirm=agent-colab. In relay mode, reset authorization is checked by the configured upstream hub.
