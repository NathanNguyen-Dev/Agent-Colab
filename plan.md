# Agent-Colab: three-hour MVP architecture and build plan

## Outcome

Ship a working Vercel deployment where two independent agents read shared project
context, publish progress, and complete one dependency handoff. Humans follow the
same activity on a read-only dashboard.

The repository is currently a scaffold. This document defines the proposed build;
it does not describe an already implemented application.

## Architecture decision

Use one Next.js application with TypeScript and the App Router. Host the dashboard
and HTTP route handlers in the same Vercel project. Use Neon Postgres through the
Vercel Marketplace for durable storage, with its serverless-compatible driver.
Use simple SQL and one migration file rather than introducing an ORM for this sprint.

Next.js supports HTTP route handlers, and Vercel runs them as Functions. Hosted
database integrations can provision connection environment variables through the
Marketplace. See [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), and
[Vercel storage integrations](https://vercel.com/docs/marketplace-storage).

```text
Agent A ── GET /project-state + POST /update ──┐
Agent B ── GET /project-state + POST /update ──┤
                                             ▼
                          Next.js on Vercel
                          ├── HTTP route handlers
                          ├── Dependency coordinator
                          └── Read-only dashboard
                                      │
                                      ▼
                               Neon Postgres
                               └── Update history
                                      │
                           Latest task state derived
                           from stored task updates
```

Implementation rules:

- Use the Node.js runtime for database routes.
- Keep persistent state in Postgres, never in a local JSON file or process memory.
- Compute compact task state and dependency insights on reads for this small demo.
- Poll the dashboard every five seconds; do not introduce WebSockets or queues.
- Return `Cache-Control: no-store` for project state and fetch it without caching.
- Keep database credentials server-side; never prefix them with `NEXT_PUBLIC_`.
- Use one configured project, `agent-colab`, and reject other project IDs.
- No accounts or authentication flow for the prototype. Use synthetic demo content.

## Ownership

| Workstream | Owner | Deliverable |
| --- | --- | --- |
| Agent instructions | You, confirmed | Reusable instructions for read-before-work and update-after-work, with examples |
| Hub and deployment | Team member to confirm | Database, API, dependency coordinator, Vercel deployment |
| Dashboard and integration | Team member to confirm | Dashboard, callable agent connections, end-to-end demo |

These are three concurrent workstreams. The instructions owner defines agent
behavior; the integration owner ensures each selected environment can actually
make HTTP calls. Support the two easiest available environments first.

## API contract: freeze in the first 15 minutes

Keep the README field names: `task` and `next`, rather than introducing competing
names such as `title` and `next_step`. Every update is a complete task snapshot.

### POST /update

```json
{
  "update_id": "57c30591-1fb1-46c8-959e-50ae05773376",
  "project_id": "agent-colab",
  "task_id": "greeting-page",
  "agent_id": "frontend-agent",
  "person": "Nathan",
  "task": "Build greeting page",
  "status": "blocked",
  "summary": "Page shell complete; waiting for the endpoint.",
  "blocker": "Waiting for greeting-api",
  "depends_on": ["greeting-api"],
  "artifact": null,
  "next": "Read the endpoint artifact and integrate it"
}
```

- Status: `todo`, `in_progress`, `blocked`, or `done`.
- Require identity, task, status, summary, dependency list, and next-step fields.
  Allow `blocker` and `artifact` to be null; require a blocker for blocked tasks.
- Accept dependency IDs before their tasks exist; unresolved IDs remain pending.
  Reject self-dependencies. Detecting larger cycles is deferred.
- Allow only HTTP(S) artifact links; do not upload files in this sprint.
- Bound request size to 16 KB, summaries to 2,000 characters, and dependencies to 20.
- Assign ordering and timestamp on the server. Agents send updates sequentially.
- Treat `(project_id, update_id)` as an idempotency key. An identical retry returns
  the saved result; reuse with different content returns `409`.
- One agent owns each task for the demo. Reject ownership changes with `409`.

Successful creation returns `201` with `update_id`, server `sequence`, and
`timestamp`. An identical retry returns `200` with those original values.
Invalid requests return `400`; storage failures return `503` with a short error.
Only acknowledge success after the database write completes.

### GET /project-state?project_id=agent-colab

Freeze this populated response shape as the shared fixture in the first 15
minutes. Sequence fields are strings; nullable fields are explicit. Both
`tasks` and `recent_updates` use the complete update snapshot shape shown below.
The recent list is newest first (this example has one recent event).

```json
{
  "project_id": "agent-colab",
  "generated_at": "2026-09-12T08:00:00Z",
  "tasks": [
    {
      "update_id": "run-001-frontend-blocked",
      "project_id": "agent-colab",
      "task_id": "run-001-greeting-page",
      "agent_id": "frontend-agent",
      "person": "Nathan",
      "task": "Build greeting page",
      "status": "blocked",
      "summary": "Page shell complete; waiting for the endpoint.",
      "blocker": "Waiting for greeting API",
      "depends_on": ["run-001-greeting-api"],
      "artifact": null,
      "next": "Read the endpoint artifact and integrate it",
      "sequence": "1",
      "timestamp": "2026-09-12T07:58:00Z"
    },
    {
      "update_id": "run-001-backend-done",
      "project_id": "agent-colab",
      "task_id": "run-001-greeting-api",
      "agent_id": "backend-agent",
      "person": "Khang",
      "task": "Build greeting API",
      "status": "done",
      "summary": "Endpoint ready; returns a JSON message string.",
      "blocker": null,
      "depends_on": [],
      "artifact": "https://example.com/greeting-api",
      "next": "Support frontend integration",
      "sequence": "2",
      "timestamp": "2026-09-12T07:59:00Z"
    }
  ],
  "recent_updates": [
    {
      "update_id": "run-001-backend-done",
      "project_id": "agent-colab",
      "task_id": "run-001-greeting-api",
      "agent_id": "backend-agent",
      "person": "Khang",
      "task": "Build greeting API",
      "status": "done",
      "summary": "Endpoint ready; returns a JSON message string.",
      "blocker": null,
      "depends_on": [],
      "artifact": "https://example.com/greeting-api",
      "next": "Support frontend integration",
      "sequence": "2",
      "timestamp": "2026-09-12T07:59:00Z"
    }
  ],
  "insights": [
    {
      "id": "dependency_ready:run-001-greeting-page:1:2",
      "type": "dependency_ready",
      "task_id": "run-001-greeting-page",
      "agent_id": "frontend-agent",
      "dependency_task_ids": ["run-001-greeting-api"],
      "evidence_update_ids": ["run-001-frontend-blocked", "run-001-backend-done"],
      "artifact_urls": ["https://example.com/greeting-api"],
      "summary": "The greeting API is ready.",
      "suggested_next": "Read its artifact and check whether integration can resume."
    }
  ]
}
```

Artifact URLs above are placeholders; replace them with reachable demo artifacts.

- `tasks`: latest complete snapshot per task, plus its sequence and timestamp.
- `recent_updates`: latest 20 compact updates, newest first.
- `insights`: currently actionable dependency insights, with task IDs and evidence.
- Use a demo limit of 50 tasks; reject new tasks beyond it instead of silently
  hiding dependencies. Keep rich transcripts out of this response.
- Return empty arrays for a new project. Return an error for a database failure,
  so the dashboard does not mistake a failure for an empty project.

## Data model

One `updates` table is sufficient:

| Column | Purpose |
| --- | --- |
| `sequence` | Database-generated increasing identifier |
| `project_id`, `update_id` | Composite unique key for retries |
| `task_id`, `agent_id`, `person` | Task and owner identity |
| `task`, `status`, `summary`, `blocker`, `next` | Current snapshot content |
| `depends_on` | Array of prerequisite task IDs |
| `artifact` | Nullable HTTP(S) URL |
| `created_at` | Server timestamp |

Index `(project_id, task_id, sequence DESC)`. Derive current state by taking the
highest sequence for each task. This avoids maintaining both an event table and
a separate current-state table in the sprint.

Use the Neon driver's `Client` over WebSockets for the interactive write
transaction, with the Node.js WebSocket adapter configured. Connect and close it
within the request, with rollback and cleanup on failure. Separate HTTP queries
cannot share an interactive transaction. See the
[Neon driver documentation](https://neon.com/docs/serverless/serverless-driver).

Acquire a project-level transaction advisory lock before ownership/task-count
checks and before inserting the event that allocates its sequence. Keep the
transaction short. Identical retries must not create an event or change ordering;
compare validated field values rather than raw JSON formatting. Read tasks and
recent events in one SQL statement or a read-only repeatable-read transaction so
the coordinator and dashboard use the same snapshot. Serialize sequence values
as strings in JSON to avoid JavaScript bigint serialization issues.

Rich prompt/output storage and a history-detail endpoint are follow-up work.
The update history and artifact URLs preserve enough context for this demo.

## Coordinator: one dependable feature

For each blocked task with explicit prerequisites, check current state. Emit a
`dependency_ready` insight only when every prerequisite exists and is `done`.
Missing or incomplete prerequisites keep the task waiting.

Each insight includes a stable ID derived from its type, affected task, and
supporting update sequences; affected agent/task IDs; evidence update IDs;
artifact links; and a suggested next action.

Example: “The greeting API is ready. Read its artifact and check whether frontend
integration can resume.”

Do not automatically change the blocked task's status: it may have other blockers.
Its owner reads the insight and posts `in_progress` when ready. Deriving insights
from current state makes them disappear when no longer actionable, including if
a prerequisite is reopened. No background worker is required.

Stretch only: AI-assisted overlap suggestions. If the core demo is complete by
minute 135, add a bounded analysis request using task summaries and evidence IDs.
Do not place an LLM call in the required read/write path. Otherwise defer it and
describe the shipped coordinator accurately as dependency rules.

## Application layout

```text
app/
  page.tsx                    # Dashboard
  update/route.ts              # POST /update
  project-state/route.ts       # GET /project-state
components/
  project-dashboard.tsx        # Polling, tasks, activity, insights
lib/
  contracts.ts                 # Shared validation and response types
  db.ts                        # Server-only database client
  project-state.ts             # Latest snapshots and recent history
  coordinator.ts               # Pure dependency checks
db/
  001_init.sql                 # Schema and indexes
docs/
  agent-instructions.md        # Owned by you
scripts/
  smoke-test.ts                # API handoff and retry checks
.env.example
```

Dashboard: one page with tasks grouped by person, status badges, blockers,
artifacts, recent activity, and actionable insights. Show loading, empty, and
failure states. Keep the last successful data visible with a stale indicator
when polling fails. Render agent text as text, not raw HTML.

## Three-hour build schedule

| Time | Hub and deployment | Agent instructions — you | Dashboard and integration |
| --- | --- | --- | --- |
| 0–15 min | Scaffold app; freeze contract with team; provision database | Review examples and agree on agent behavior | Confirm two usable agent environments; start against shared fixture |
| 15–45 min | Apply schema; build both routes; deploy to Vercel | Write read/start/progress/blocked/done instructions | Build task list and activity feed; make first real agent API call |
| 45–90 min | Add validation, retries, ownership checks, dependency insights | Test instructions against deployed API | Connect dashboard and second agent; show insight and artifact links |
| 90–135 min | Fix integration and persistence issues | Run the real handoff and refine ambiguous instructions | Complete the handoff; add loading/error states |
| 135–160 min | Run critical checks; stretch feature only if everything passes | Freeze instructions and rehearse | Polish demo readability; prepare repeatable demo tasks |
| 160–180 min | Freeze features; verify production deployment | Rehearse final agent interaction | Record successful run and prepare clearly labeled fallback data |

Gates: deployed read/write API by minute 45; two agents connected by minute 90;
successful handoff by minute 135. Missing a gate means cutting optional work,
not extending the feature list.

## Vercel deployment sequence

1. Scaffold Next.js in the repository root. Commit its lockfile and define normal
   development and build scripts. Do not configure static export: the API needs
   server execution.
2. Import the GitHub repository into Vercel, select Next.js, use repository root
   as the project root, and configure `main` as the production branch.
3. Provision Neon, apply `db/001_init.sql` once, and configure `DATABASE_URL` and
   `PROJECT_ID=agent-colab`. Map the provider connection variable to the name the
   app expects. Do not run migrations inside request handlers or every build.
4. Put placeholder values in `.env.example` and local values in ignored
   `.env.local`. Configure production and preview environments deliberately;
   use a separate preview database or branch if previews are enabled.
5. Deploy as soon as both routes work. Test the production URL from outside a
   signed-in browser: agent calls must receive JSON rather than a Vercel login
   page. Configure deployment protection appropriately for the demo endpoint.
6. Give agents the stable production base URL. Verify dashboard polling, a real
   write, and a fresh read. Redeploy and confirm the saved update remains.
7. Subsequent pushes to the configured production branch deliver the integrated
   application. Check deployment success before rehearsing against the new build.

## Acceptance tests and demo

Required checks:

- Production build and type checking pass.
- Invalid updates are rejected without writes.
- Identical retry creates only one event; conflicting retry returns `409`.
- Two agents updating separate tasks preserve both updates.
- Wrong project and task-owner changes are rejected.
- Missing or unfinished prerequisite produces no ready insight.
- All prerequisites done produces an insight with the correct evidence/artifact.
- Resumed task or reopened prerequisite removes the stale insight.
- Data survives deployment; fresh dashboard reads show committed updates.
- A storage failure appears as a failure to both agents and dashboard.

Demo:

Before each rehearsal, choose a fresh run prefix, such as `run-002`, for both
task IDs, all dependency references, and update IDs. Keep the two stable agent
identities. Never reuse completed task IDs or clear production history to restart
the demo. The task names below are shorthand for those run-prefixed IDs; the
50-task limit permits 25 two-task runs in this prototype.

1. Frontend agent reads state and posts `greeting-page` blocked on `greeting-api`.
2. Backend agent reads state, creates a real greeting endpoint, and posts `done`
   with a reachable artifact documenting the response shape.
3. Dashboard shows the dependency-ready insight.
4. Human asks the frontend agent to continue. The agent reads the hub, retrieves
   the artifact, integrates the endpoint, and posts completion with a page link.
5. Show both completed tasks and the update trail.

The human triggers continuation; no manual copying of endpoint context between
agents should be necessary. Automatic wakeups are outside this sprint.

## Explicit cuts

No accounts, multiple workspaces, dashboard editing, chat, vector search, full
transcript ingestion, file uploads, autonomous reassignment, automatic wakeups,
or universal agent connector. AI overlap detection is optional. The required
deliverable is a real shared-state handoff, visible on a deployed dashboard.
