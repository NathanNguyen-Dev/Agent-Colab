# Frontend/backend integration verification

Verified September 12, 2026 against the backend at
`https://agent-colab-five.vercel.app` and the integrated frontend at
`http://127.0.0.1:3000`.

## Connection

The browser reads its same-origin `/project-state?project_id=agent-colab` every
five seconds. Locally, `HUB_API_URL` makes the Next.js server relay GET and POST to
the deployed hub. The existing hub persists updates in Neon. The combined app can
instead use `DATABASE_URL` directly when `HUB_API_URL` is unset.

The frontend accepts the deployed `created_at` field and the intended `timestamp`
field. The relay normalizes reads; the local Postgres query now emits `timestamp`.
The deployment still needs the updated code before its own response changes.

## Verified live flow

Task ID: `ui-sync-1789193606889`
Agent ID: `nathan-codex-integration`
Human: Nathan
Task title: Verify live canvas sync

1. Posted `in_progress` through the local `/update` route. Received `201`,
   sequence `8`, timestamp `2026-09-12T06:13:27.290Z`.
2. Independently read the production API and verified that this task was stored
   with status `in_progress` and sequence `8`.
3. With the browser already open, observed the canvas node
   “Nathan's Codex: Verify live canvas sync. Working” appear through polling.
   No reload or manual refresh was used.
4. Posted a new update ID for the same task with status `done`. Received `201`,
   sequence `9`, timestamp `2026-09-12T06:13:52.925Z`.
5. Production GET returned latest status `done` and both historical events.
6. Browser polling changed the same canvas task to Done without reloading.
7. The Log displayed both completion and earlier in-progress events.
8. Stopped the local server. The frontend retained the completed task and displayed
   “Showing last known state. Failed to fetch”. Restarting the server restored
   “Synced” automatically, without a manual refresh.
9. Opened an existing blocked greeting task and verified its dependency-ready
   insight rendered in the details panel.

## Automated checks

- Existing backend smoke test through the local relay: **18 passed, 0 failed**.
  Includes validation, creation, idempotent retry, conflicting update content,
  ownership conflicts, persisted tasks, and dependency insight evidence.
- `node --test scripts/workspace-view.test.mjs`: **4 passed**.
  Covers timestamp compatibility, current versus historical status, arbitrary
  people/unknown agent IDs, artifacts/dependencies, and empty projects.
- Production Next.js build and TypeScript checking passed.
- Local project-state response checked: all returned tasks have a `timestamp`.

Test events remain in the shared history under timestamped IDs. No existing
project updates were deleted or edited by these checks.

## Scope and remaining work

The local frontend is connected to the real deployed backend; the integrated
frontend and backend fixes have not been published to Vercel in this task.
Shared Plan.md/Context.md persistence and per-agent credential verification are
still planned features. The current deployed API trusts the submitted human and
agent identity, and agent environment is inferred only when recognizable in its
ID. Unknown identities use a neutral icon and retain the original ID.
