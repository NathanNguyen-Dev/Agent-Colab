// Temporary in-process store standing in for Neon Postgres.
//
// plan.md's implementation rules call for persistent state in Postgres, never
// process memory. This module exists only to make the two routes runnable and
// demoable before the database is provisioned (see plan.md's "Vercel
// deployment sequence", step 3). It is intentionally the single place that
// knows about storage, so swapping it for `lib/db.ts` + SQL later does not
// touch the route handlers' request/response logic.
//
// Known limitation: state does not survive a serverless cold start or a
// redeploy, and is not shared across concurrent function instances. Do not
// rely on it beyond local development and first-deploy smoke tests.

import type { UpdateRequest, UpdateSnapshot } from "./contracts";

const events: UpdateSnapshot[] = [];
let nextSequence = 1;

export type AppendResult =
  | { outcome: "created"; snapshot: UpdateSnapshot }
  | { outcome: "duplicate"; snapshot: UpdateSnapshot }
  | { outcome: "conflict" };

function sameContent(a: UpdateRequest, b: UpdateRequest): boolean {
  return (
    a.task_id === b.task_id &&
    a.agent_id === b.agent_id &&
    a.person === b.person &&
    a.task === b.task &&
    a.status === b.status &&
    a.summary === b.summary &&
    (a.blocker ?? null) === (b.blocker ?? null) &&
    (a.artifact ?? null) === (b.artifact ?? null) &&
    a.next === b.next &&
    JSON.stringify(a.depends_on) === JSON.stringify(b.depends_on)
  );
}

export function countDistinctTasks(): number {
  return new Set(events.map((event) => event.task_id)).size;
}

export function findExistingOwner(taskId: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && event.task_id === taskId) return event.agent_id;
  }
  return undefined;
}

export function findByUpdateId(updateId: string): UpdateSnapshot | undefined {
  return events.find((event) => event.update_id === updateId);
}

// Appends a new event, enforcing the idempotency and ownership rules from
// plan.md: identical retries return the saved result, conflicting retries and
// ownership changes are rejected as conflicts.
export function appendUpdate(request: UpdateRequest): AppendResult {
  const existing = findByUpdateId(request.update_id);
  if (existing) {
    return sameContent(existing, request)
      ? { outcome: "duplicate", snapshot: existing }
      : { outcome: "conflict" };
  }

  const owner = findExistingOwner(request.task_id);
  if (owner && owner !== request.agent_id) {
    return { outcome: "conflict" };
  }

  if (!owner && countDistinctTasks() >= 50) {
    return { outcome: "conflict" };
  }

  const snapshot: UpdateSnapshot = {
    ...request,
    sequence: String(nextSequence),
    timestamp: new Date().toISOString(),
  };
  nextSequence += 1;
  events.push(snapshot);
  return { outcome: "created", snapshot };
}

export function latestTaskSnapshots(): UpdateSnapshot[] {
  const latestByTask = new Map<string, UpdateSnapshot>();
  for (const event of events) {
    latestByTask.set(event.task_id, event);
  }
  return [...latestByTask.values()].sort(
    (a, b) => Number(a.sequence) - Number(b.sequence),
  );
}

export function recentUpdates(limit: number): UpdateSnapshot[] {
  return [...events]
    .sort((a, b) => Number(b.sequence) - Number(a.sequence))
    .slice(0, limit);
}
