// Pure dependency checks over the current task snapshots.
//
// Per plan.md's "Coordinator: one dependable feature": emit a
// dependency_ready insight only when every prerequisite of a blocked task is
// done. No background worker; this runs fresh on every GET /project-state.

import type { DependencyReadyInsight, UpdateSnapshot } from "./contracts";

export function computeDependencyReadyInsights(
  tasks: UpdateSnapshot[],
): DependencyReadyInsight[] {
  const byTaskId = new Map(tasks.map((task) => [task.task_id, task]));
  const insights: DependencyReadyInsight[] = [];

  for (const task of tasks) {
    if (task.status !== "blocked" || task.depends_on.length === 0) continue;

    const dependencies = task.depends_on.map((id) => byTaskId.get(id));
    const allDone = dependencies.every((dep) => dep?.status === "done");
    if (!allDone) continue;

    const doneDeps = dependencies.filter(
      (dep): dep is UpdateSnapshot => dep !== undefined,
    );
    const evidenceUpdateIds = [
      task.update_id,
      ...doneDeps.map((dep) => dep.update_id),
    ];
    const artifactUrls = doneDeps
      .map((dep) => dep.artifact)
      .filter((url): url is string => url !== null);

    insights.push({
      id: `dependency_ready:${task.task_id}:${doneDeps
        .map((dep) => dep.sequence)
        .join(",")}:${task.sequence}`,
      type: "dependency_ready",
      task_id: task.task_id,
      agent_id: task.agent_id,
      dependency_task_ids: task.depends_on,
      evidence_update_ids: evidenceUpdateIds,
      artifact_urls: artifactUrls,
      summary: `All prerequisites for "${task.task}" are done.`,
      suggested_next:
        "Read the linked artifact(s) and check whether this task can resume.",
    });
  }

  return insights;
}
