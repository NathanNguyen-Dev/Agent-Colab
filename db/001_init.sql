-- Agent-Colab hub: single append-only updates table.
-- See plan.md's "Data model" section for the rationale: current state is
-- derived by taking the highest sequence per task rather than maintaining a
-- separate current-state table.
--
-- Apply once against the direct (non-pooled) connection string, e.g.:
--   psql "$DATABASE_URL_UNPOOLED" -f db/001_init.sql

CREATE TABLE IF NOT EXISTS updates (
  sequence    BIGSERIAL PRIMARY KEY,
  project_id  TEXT NOT NULL,
  update_id   TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  person      TEXT NOT NULL,
  task        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  summary     TEXT NOT NULL,
  blocker     TEXT,
  next        TEXT NOT NULL,
  depends_on  TEXT[] NOT NULL DEFAULT '{}',
  artifact    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT updates_project_update_unique UNIQUE (project_id, update_id)
);

CREATE INDEX IF NOT EXISTS updates_project_task_sequence_idx
  ON updates (project_id, task_id, sequence DESC);
