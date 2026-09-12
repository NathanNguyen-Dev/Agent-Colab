// Postgres-backed storage. See db/001_init.sql for the schema and plan.md's
// "Data model" section for the rationale: current state is derived by taking
// the highest sequence per task rather than maintaining a separate
// current-state table.

import "server-only";
import type { Client } from "@neondatabase/serverless";
import { getSql, withTransaction } from "./db";
import { MAX_TASKS, PROJECT_ID, type UpdateRequest, type UpdateSnapshot } from "./contracts";

export type AppendResult =
  | { outcome: "created"; snapshot: UpdateSnapshot }
  | { outcome: "duplicate"; snapshot: UpdateSnapshot }
  | { outcome: "conflict"; reason: "update_id_reused" | "ownership_or_limit" };

interface UpdateRow {
  sequence: string;
  project_id: string;
  update_id: string;
  task_id: string;
  agent_id: string;
  person: string;
  task: string;
  status: UpdateSnapshot["status"];
  summary: string;
  blocker: string | null;
  next: string;
  depends_on: string[];
  artifact: string | null;
  created_at: string;
}

function toSnapshot(row: UpdateRow): UpdateSnapshot {
  return {
    update_id: row.update_id,
    // The column is a plain TEXT; every write already validated it against
    // PROJECT_ID (see contracts.ts), so this cast just restores the literal type.
    project_id: row.project_id as typeof PROJECT_ID,
    task_id: row.task_id,
    agent_id: row.agent_id,
    person: row.person,
    task: row.task,
    status: row.status,
    summary: row.summary,
    blocker: row.blocker,
    depends_on: row.depends_on,
    artifact: row.artifact,
    next: row.next,
    sequence: row.sequence,
    timestamp: new Date(row.created_at).toISOString(),
  };
}

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

async function queryOne<T>(
  client: Client,
  text: string,
  params: unknown[],
): Promise<T | undefined> {
  const result = await client.query(text, params);
  return result.rows[0] as T | undefined;
}

// Appends a new event, enforcing the idempotency and ownership rules from
// plan.md: identical retries return the saved result, conflicting retries
// and ownership changes are rejected as conflicts. The advisory lock
// serializes the ownership/task-count check against the insert that
// allocates the next sequence, per project.
export async function appendUpdate(request: UpdateRequest): Promise<AppendResult> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      request.project_id,
    ]);

    const existing = await queryOne<UpdateRow>(
      client,
      `SELECT * FROM updates WHERE project_id = $1 AND update_id = $2`,
      [request.project_id, request.update_id],
    );
    if (existing) {
      const existingSnapshot = toSnapshot(existing);
      return sameContent(existingSnapshot, request)
        ? { outcome: "duplicate" as const, snapshot: existingSnapshot }
        : { outcome: "conflict" as const, reason: "update_id_reused" as const };
    }

    const owner = await queryOne<{ agent_id: string }>(
      client,
      `SELECT agent_id FROM updates
       WHERE project_id = $1 AND task_id = $2
       ORDER BY sequence DESC LIMIT 1`,
      [request.project_id, request.task_id],
    );
    if (owner && owner.agent_id !== request.agent_id) {
      return { outcome: "conflict" as const, reason: "ownership_or_limit" as const };
    }

    if (!owner) {
      const countRow = await queryOne<{ count: string }>(
        client,
        `SELECT count(DISTINCT task_id) FROM updates WHERE project_id = $1`,
        [request.project_id],
      );
      if (Number(countRow?.count ?? 0) >= MAX_TASKS) {
        return { outcome: "conflict" as const, reason: "ownership_or_limit" as const };
      }
    }

    const inserted = await queryOne<UpdateRow>(
      client,
      `INSERT INTO updates
         (project_id, update_id, task_id, agent_id, person, task, status,
          summary, blocker, next, depends_on, artifact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        request.project_id,
        request.update_id,
        request.task_id,
        request.agent_id,
        request.person,
        request.task,
        request.status,
        request.summary,
        request.blocker,
        request.next,
        request.depends_on,
        request.artifact,
      ],
    );
    if (!inserted) {
      throw new Error("insert did not return a row");
    }

    return { outcome: "created" as const, snapshot: toSnapshot(inserted) };
  });
}

// Reads the latest per-task snapshots and the most recent updates in a
// single round trip, so both lists reflect the same point in time (plan.md:
// "Read tasks and recent events in one SQL statement").
// Casts sequence to text explicitly: jsonb numbers would otherwise decode as
// JS numbers, and plan.md requires sequence serialized as a string to avoid
// bigint precision issues.
const SNAPSHOT_JSON_OBJECT = `jsonb_build_object(
  'sequence', sequence::text,
  'project_id', project_id,
  'update_id', update_id,
  'task_id', task_id,
  'agent_id', agent_id,
  'person', person,
  'task', task,
  'status', status,
  'summary', summary,
  'blocker', blocker,
  'next', next,
  'depends_on', to_jsonb(depends_on),
  'artifact', artifact,
  'timestamp', created_at
)`;

export async function readProjectState(
  projectId: string,
  recentLimit: number,
): Promise<{ tasks: UpdateSnapshot[]; recentUpdates: UpdateSnapshot[] }> {
  const sql = getSql();
  const rows = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (task_id) *
      FROM updates
      WHERE project_id = ${projectId}
      ORDER BY task_id, sequence DESC
    ),
    recent AS (
      SELECT *
      FROM updates
      WHERE project_id = ${projectId}
      ORDER BY sequence DESC
      LIMIT ${recentLimit}
    )
    SELECT
      (SELECT coalesce(jsonb_agg(${sql.unsafe(SNAPSHOT_JSON_OBJECT)} ORDER BY sequence), '[]'::jsonb) FROM latest) AS tasks,
      (SELECT coalesce(jsonb_agg(${sql.unsafe(SNAPSHOT_JSON_OBJECT)} ORDER BY sequence DESC), '[]'::jsonb) FROM recent) AS recent_updates
  `;

  const row = rows[0] as
    | { tasks: UpdateSnapshot[]; recent_updates: UpdateSnapshot[] }
    | undefined;

  return {
    tasks: row?.tasks ?? [],
    recentUpdates: row?.recent_updates ?? [],
  };
}
