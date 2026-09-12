# Agent-Colab

Shared project context for humans collaborating through their own AI agents.

Gabriel may use ChatGPT, Nathan may use Claude, and Khang may use Codex. They are
working on the same project, but each agent mostly knows what its own human is
doing. That leads to duplicated work, missed dependencies, poor handoffs, and
constant manual status updates.

Agent-Colab gives those agents a shared understanding of the project: a live
stand-up for a team of humans and their personal AI agents. The website is a
visibility layer; the core interaction is agent → shared workspace → agent.

## Current status

The technology stack is selected and the backend is deployed. See
[plan.md](plan.md) for the full architecture decision.

This is a Next.js (App Router, TypeScript) application deployed to Vercel as
project `agent-colab`. It currently ships the hub API only:

- `POST /update` and `GET /project-state` are implemented per
  [docs/openapi.yaml](docs/openapi.yaml), including idempotent retries,
  ownership conflicts, and the `dependency_ready` coordinator insight.
- Storage is Neon Postgres, per plan.md's data model (`db/001_init.sql`,
  `lib/db.ts`, `lib/store.ts`), provisioned through the Vercel Marketplace
  integration. Writes use the Neon serverless driver's WebSocket `Client` for
  the interactive transaction (advisory lock, ownership check, insert); reads
  use its HTTP tagged-template in a single query so tasks and recent updates
  reflect the same snapshot.
- The dashboard (`app/page.tsx`) is a placeholder; the visibility layer
  described below is not built yet.

Agent integrations and the coordinator's semantic-overlap features are
planned work, not implemented.

## Core workflow

Before meaningful work, an agent reads the shared project state to learn:

- What everyone is working on and what is complete.
- What is blocked and which dependencies affect its task.
- Whether another agent has relevant work or an overlapping task.

After meaningful work, the agent posts an update containing:

- The human it represents and its agent identity.
- The task, status, and a summary of what changed.
- Any blocker and dependencies.
- Outputs or artifacts and its next intended step.
- Optional original prompts and meaningful outputs for richer context.

## Architecture

```text
Gabriel's agent ─┐
Nathan's agent  ─┼── Shared API / Hub ── Shared project state
Khang's agent   ─┘          │                    │
                           └── Coordinator AI ──┘
                                    │
                          Cross-agent insights
                                    │
                     Agents + read-only dashboard
```

### Personal agents

Each participating agent receives common instructions for reading and updating
shared state. Each demo environment also needs a callable tool or adapter: an
instruction file alone does not provide API access.

### Shared API

The proposed minimum API is:

| Endpoint | Purpose |
| --- | --- |
| `POST /update` | Record project activity and refresh current task state. |
| `GET /project-state` | Retrieve compact current context and relevant insights. |

The hackathon prototype does not require a full authentication system. Project
identity must still be explicit so updates and reads stay scoped to a project.

### Shared storage

**Store rich context. Retrieve compact context.**

Maintain both an append-only update history and a current-state view of tasks,
ownership, dependencies, blockers, next steps, and insights. Preserve longer
prompts and outputs separately with references for retrieval when needed; do not
send the entire transcript history on every read.

The following is an illustrative update, pending agreement on the API contract:

```json
{
  "update_id": "update-nathan-001",
  "project_id": "agent-colab",
  "task_id": "frontend-auth",
  "agent_id": "nathan-agent",
  "person": "Nathan",
  "task": "Build frontend authentication",
  "status": "blocked",
  "summary": "Login UI complete. Waiting to connect the auth API.",
  "blocker": "Waiting for Khang's auth endpoint",
  "depends_on": ["auth-api"],
  "next": "Integrate backend",
  "artifact": null
}
```

Use stable task IDs for dependencies, unique update IDs to make retries
idempotent, and server-assigned timestamps for ordering. Proposed task statuses
are `todo`, `in_progress`, `blocked`, and `done`.

### Coordinator intelligence

The coordinator reads across agents and surfaces useful signals:

- **Duplicate work:** suggest checking scope when two agents appear to be
  implementing the same thing.
- **Resolved dependency:** notify a blocked task that its prerequisite is done.
- **Possible assistance:** connect a blocked agent with relevant work or knowledge
  from another agent.

Start with explicit dependency checks, then add AI interpretation for semantic
overlap and assistance. Each insight should identify the affected tasks or
agents, cite supporting updates, and suggest a next action. Overlapping task
descriptions are a reason to check scope, not proof of duplication.

For the MVP, agents receive insights on their next project-state read. Waking an
idle agent automatically requires additional integration and is outside the
initial scope.

### Read-only dashboard

Show team activity, current tasks, blockers, dependencies, artifacts, and
coordinator insights. A human should be able to follow progress and understand a
handoff without reading raw agent transcripts.

## MVP implementation plan

| Stage | Work | Completion criteria |
| --- | --- | --- |
| 1. Shared contract | Agree on fields, statuses, dependency references, and API examples. | All workstreams use the same request and response shapes. |
| 2. Hub | Build the API, validation, persistent history, and current-state view. | Updates survive restarts and produce accurate state. |
| 3. Agent integration | Write common instructions and connect the demo environments. | Two real agents independently read and update the hub. |
| 4. Coordination | Add dependency checks and AI-assisted overlap and assistance insights. | Insights reference supporting updates and suggest useful actions. |
| 5. Visibility | Build the read-only dashboard. | Humans can follow activity, blockers, and handoffs. |
| 6. Demo validation | Rehearse the complete flow and check failure handling. | The scenario works repeatedly with real agent calls. |

After the shared contract is agreed, work can proceed across three workstreams:

- **Hub:** API, storage, and current-state calculation.
- **Agent integration:** instructions, environment adapters, and coordinator.
- **Dashboard:** activity feed, task visibility, and demo presentation.

The first milestone is two real agents exchanging useful context through the
hub. Complete that end-to-end flow before polishing the dashboard.

### Demo scenario

1. Nathan's agent reports frontend integration blocked on Khang's auth endpoint.
2. Khang's agent completes the endpoint and posts its artifact.
3. The coordinator identifies the resolved dependency.
4. Nathan's agent reads shared state and resumes integration.
5. In a second scenario, Gabriel's agent discovers overlapping work before
   starting and adjusts its intended task.

Validate persistence, duplicate-update retries, project isolation, and compact
state retrieval alongside the demo. If coordinator analysis fails, recording and
reading project updates should continue to work.

### Outside the initial scope

- Team chat and dashboard task editing.
- Complex permissions and production authentication.
- Autonomous task reassignment or automatic agent wakeups.
- Full transcript ingestion as a requirement for participation.

## Getting started

Clone the repository, enter the project directory, and install dependencies:

```sh
git clone https://github.com/NathanNguyen-Dev/Agent-Colab.git
cd Agent-Colab
npm install
vercel link                    # once, to connect this checkout to the Vercel project
vercel env pull .env.local     # pulls DATABASE_URL and DATABASE_URL_UNPOOLED from Neon
npm run db:migrate             # applies db/001_init.sql if not already applied
npm run dev
```

This serves the hub API at `http://localhost:3000` (`POST /update`,
`GET /project-state?project_id=agent-colab`), backed by the same Neon
database as the deployment. See [docs/openapi.yaml](docs/openapi.yaml) for
the full contract and [plan.md](plan.md) for the architecture.

Useful scripts: `npm run build` (production build), `npm run typecheck`,
`npm run db:migrate` (apply `db/001_init.sql`).

### Deployment

The Vercel project `agent-colab` (scope `khangtoh-7074s-projects`) is linked
via `vercel link`. Automatic deploy-on-push from GitHub is not yet connected —
`vercel git connect` failed because this Vercel account doesn't have access to
the `NathanNguyen-Dev/Agent-Colab` GitHub repo. Connect it from the project's
Git settings in the Vercel dashboard (or grant repo access to the Vercel
GitHub App) to enable that. Until then, deploy manually with `vercel deploy`
(preview) or `vercel deploy --prod` (production) from a machine with an
authenticated, linked CLI.

## Repository files

- `.editorconfig` — shared text formatting defaults.
- `.gitignore` — excludes local configuration, secrets, dependencies, and build artifacts.
- `app/` — Next.js App Router: `update/` and `project-state/` route handlers, plus a placeholder root page.
- `lib/` — shared contracts (`contracts.ts`), coordinator logic (`coordinator.ts`), the Postgres-backed store (`store.ts`), and the database client (`db.ts`).
- `db/001_init.sql` — schema; apply with `npm run db:migrate`.
- `scripts/migrate.ts` — one-off migration runner (not run automatically on build or per-request).
- `docs/openapi.yaml` — OpenAPI spec for the hub API.
- `plan.md` — architecture decision and build plan.

## Local configuration

Keep local environment variables in `.env` or `.env.local`. These files are
ignored by Git. Document required variables in a committed `.env.example` using
placeholder values only.
