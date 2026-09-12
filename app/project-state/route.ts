import { NextResponse } from "next/server";
import { PROJECT_ID, MAX_RECENT_UPDATES, type ProjectStateResponse } from "@/lib/contracts";
import { latestTaskSnapshots, recentUpdates } from "@/lib/store";
import { computeDependencyReadyInsights } from "@/lib/coordinator";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project_id");

  if (projectId !== PROJECT_ID) {
    return NextResponse.json(
      { error: `unknown project_id; expected "${PROJECT_ID}"` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const tasks = latestTaskSnapshots();
  const body: ProjectStateResponse = {
    project_id: PROJECT_ID,
    generated_at: new Date().toISOString(),
    tasks,
    recent_updates: recentUpdates(MAX_RECENT_UPDATES),
    insights: computeDependencyReadyInsights(tasks),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
