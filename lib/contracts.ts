// Shared request/response contracts for the hub API.
//
// These mirror the frozen contract in plan.md ("API contract: freeze in the
// first 15 minutes"). Keep field names in sync with docs/openapi.yaml.

import { z } from "zod";

export const PROJECT_ID = "agent-colab";
export const MAX_TASKS = 50;
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_DEPENDENCIES = 20;
export const MAX_RECENT_UPDATES = 20;

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const httpUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "artifact must be an http(s) URL",
  });

// POST /update request body.
export const updateRequestSchema = z
  .object({
    update_id: z.string().min(1).max(200),
    project_id: z.literal(PROJECT_ID),
    task_id: z.string().min(1).max(200),
    agent_id: z.string().min(1).max(200),
    person: z.string().min(1).max(200),
    task: z.string().min(1).max(200),
    status: z.enum(TASK_STATUSES),
    summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
    blocker: z.string().max(2000).nullable(),
    depends_on: z.array(z.string().min(1).max(200)).max(MAX_DEPENDENCIES),
    artifact: httpUrl.nullable(),
    next: z.string().min(1).max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.status === "blocked" && !value.blocker) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocker"],
        message: "blocker is required when status is blocked",
      });
    }
    if (value.depends_on.includes(value.task_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depends_on"],
        message: "a task cannot depend on itself",
      });
    }
  });

export type UpdateRequest = z.infer<typeof updateRequestSchema>;

// A stored/returned update snapshot: the request payload plus server-assigned
// ordering fields. Sequence is serialized as a string to avoid bigint issues.
export interface UpdateSnapshot extends UpdateRequest {
  sequence: string;
  timestamp: string;
}

export interface DependencyReadyInsight {
  id: string;
  type: "dependency_ready";
  task_id: string;
  agent_id: string;
  dependency_task_ids: string[];
  evidence_update_ids: string[];
  artifact_urls: string[];
  summary: string;
  suggested_next: string;
}

export interface ProjectStateResponse {
  project_id: string;
  generated_at: string;
  tasks: UpdateSnapshot[];
  recent_updates: UpdateSnapshot[];
  insights: DependencyReadyInsight[];
}

export interface ApiError {
  error: string;
}
