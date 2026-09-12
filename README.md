# Agent in the loop

Shared project context for humans collaborating through their own AI agents.

Gabriel may use ChatGPT, Nathan may use Claude, and Khang may use Codex. They are
working on the same project, but each agent mostly knows what its own human is
doing. That leads to duplicated work, missed dependencies, poor handoffs, and
constant manual status updates.

Agent in the loop gives those agents a shared understanding of the project: a live
stand-up for a team of humans and their personal AI agents. The website is a
visibility layer; the core interaction is agent → shared workspace → agent.

## Current status

This repository includes a runnable frontend prototype with a pannable, zoomable
team canvas, draggable human avatars and agent nodes, and an activity log with
Now/Done filters. A Share Context tab contains editable Plan.md and Context.md
drafts with browser-local saves, copy, and Markdown downloads. These are sample
documents, not synced repository files. All activity is sample data. The API,
storage, agent integrations, and coordinator described below remain planned work. The MVP plan uses Next.js on Vercel with
Neon Postgres provisioned through Vercel Marketplace. See [the build plan](plan.md).
The repository name and internal project ID remain `Agent-Colab` and `agent-colab`.

## Core workflow

Before meaningful work, an agent reads the shared project state to learn:

- What everyone is working on and what is complete.
- What is blocked and which dependencies affect its task.
- Whether another agent has relevant work or an overlapping task.

After meaningful work, the agent posts an update containing:

- A connection credential from which the server resolves its human and agent identity.
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

The MVP authenticates writes with one bearer token per registered agent connection.
It does not require user accounts or a login flow. The read-only dashboard and
project-state endpoint expose synthetic demo state publicly for this sprint.

### Whose agent sent the update?

Pre-register each connection with a stable human ID, display name, agent ID,
agent name, environment label, and project ID. Nathan's ChatGPT and Nathan's Codex
receive different credentials associated with the same human ID.

```http
POST /update
Authorization: Bearer <agent-token>
Content-Type: application/json
```

The server resolves the token to the registered identity and stamps the stored
update. Request bodies contain task progress, not caller-selected identity.
Missing, invalid, or revoked credentials return `401`; attempts to change another
connection's task return `403`.

Generate a random token for each connection, store only its hash in Neon, and
configure the raw token in that agent's tool or connector secret settings. Keep
credentials out of shared instructions, prompts, logs, and browser code. Tokens
can be replaced without changing the stable agent identity or task ownership.

The token identifies a registered connection; “ChatGPT” is its configured
environment label, not independent proof of which provider or model executed.

### Shared storage

**Store rich context. Retrieve compact context.**

Maintain both an append-only update history and a current-state view of tasks,
ownership, dependencies, blockers, next steps, and insights. Preserve longer
prompts and outputs separately with references for retrieval when needed; do not
send the entire transcript history on every read.

The following is an illustrative authenticated request body. The server adds
project, human, and agent identity from the connection record:

```json
{
  "update_id": "update-nathan-001",
  "task_id": "frontend-auth",
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

Group tasks by human and then registered agent, with environment labels and
last-update timestamps. Show current tasks, blockers, dependencies, artifacts, and
coordinator insights. A human should be able to follow progress and understand a
handoff without reading raw agent transcripts.

## MVP implementation plan

| Stage | Work | Completion criteria |
| --- | --- | --- |
| 1. Shared contract | Agree on fields, statuses, dependency references, and API examples. | All workstreams use the same request and response shapes. |
| 2. Hub | Build the API, credential lookup, validation, persistent history, and current-state view. | Updates survive restarts and carry server-resolved identity. |
| 3. Agent integration | Register connections, configure separate credentials, and write common instructions. | Two real agents independently read and update the hub under their registered identities. |
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
- User accounts, login flows, and complex permissions; per-agent write tokens are in scope.
- Autonomous task reassignment or automatic agent wakeups.
- Full transcript ingestion as a requirement for participation.

## Getting started

Clone the repository and enter the project directory:

```sh
git clone https://github.com/NathanNguyen-Dev/Agent-Colab.git
cd Agent-Colab
```

Run the frontend prototype:

```sh
npm install
npm run dev
```

Open [the local preview](http://localhost:3000). Drag the canvas to pan and drag people or agents to rearrange them. Use the zoom
buttons or Control/Command plus scroll to zoom; ordinary scroll pans. Click a
node to inspect its reported focus or task. Switch to Log to search current and
completed work. Arrow keys pan a focused canvas and +/− zoom it. Fit and reset
controls restore the overview. All content is sample data held in the browser;
refreshing resets positions and filters. No backend or credentials
are needed. Run `npm run build` for a production build and `npm run typecheck`
for TypeScript validation.

## Repository files

- `.editorconfig` — shared text formatting defaults.
- `.gitignore` — excludes local configuration, secrets, dependencies, and build artifacts.

## Local configuration

Keep local environment variables in `.env` or `.env.local`. These files are
ignored by Git. Document required variables in a committed `.env.example` using
placeholder values only.
