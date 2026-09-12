import { NextResponse } from "next/server";
import { PROJECT_ID, MAX_RECENT_UPDATES, type ProjectStateResponse } from "@/lib/contracts";
import { dropProjectEvents, readProjectState } from "@/lib/store";
import { computeDependencyReadyInsights } from "@/lib/coordinator";

export const runtime = "nodejs";

// Header carrying the shared admin secret for DELETE. The deployment is
// public and otherwise unauthenticated, so without AGENT_COLAB_ADMIN_TOKEN set
// in the environment the destructive handler stays switched off entirely
// rather than defaulting to "anyone may wipe the project".
const ADMIN_TOKEN_HEADER = "x-admin-token";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project_id");

  if (projectId !== PROJECT_ID) {
    return NextResponse.json(
      { error: `unknown project_id; expected "${PROJECT_ID}"` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let tasks, recentUpdates;
  try {
    ({ tasks, recentUpdates } = await readProjectState(
      PROJECT_ID,
      MAX_RECENT_UPDATES,
    ));
  } catch (error) {
    console.error("readProjectState failed", error);
    return NextResponse.json(
      { error: "storage failure; could not read project state" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body: ProjectStateResponse = {
    project_id: PROJECT_ID,
    generated_at: new Date().toISOString(),
    tasks,
    recent_updates: recentUpdates,
    insights: computeDependencyReadyInsights(tasks),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

// Drops every event for a project. Irreversible: the updates table is the only
// copy of project state, so this also releases task ownership and frees the
// MAX_TASKS budget. Intended for resetting a demo, not for routine use.
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  const noStore = { "Cache-Control": "no-store" };

  const adminToken = process.env.AGENT_COLAB_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: "reset is not enabled; AGENT_COLAB_ADMIN_TOKEN is not configured" },
      { status: 503, headers: noStore },
    );
  }

  if (request.headers.get(ADMIN_TOKEN_HEADER) !== adminToken) {
    return NextResponse.json(
      { error: `missing or invalid ${ADMIN_TOKEN_HEADER} header` },
      { status: 403, headers: noStore },
    );
  }

  if (projectId !== PROJECT_ID) {
    return NextResponse.json(
      { error: `unknown project_id; expected "${PROJECT_ID}"` },
      { status: 400, headers: noStore },
    );
  }

  // A second, explicit confirmation of the same id. A valid token in a shell
  // history is one careless re-run away from wiping the hub; this makes the
  // destructive call impossible to issue by accident.
  if (url.searchParams.get("confirm") !== PROJECT_ID) {
    return NextResponse.json(
      { error: `confirm must equal the project_id ("confirm=${PROJECT_ID}")` },
      { status: 400, headers: noStore },
    );
  }

  let deleted;
  try {
    deleted = await dropProjectEvents(PROJECT_ID);
  } catch (error) {
    console.error("dropProjectEvents failed", error);
    return NextResponse.json(
      { error: "storage failure; nothing was deleted" },
      { status: 503, headers: noStore },
    );
  }

  return NextResponse.json(
    {
      project_id: PROJECT_ID,
      deleted_updates: deleted.deletedUpdates,
      deleted_tasks: deleted.deletedTasks,
    },
    { headers: noStore },
  );
}
