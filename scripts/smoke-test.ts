// API smoke test for the hub, driven by the contract in docs/openapi.yaml.
//
// Exercises a real deployment end-to-end (not a mock): validation, the
// idempotent-retry and both 409 conflict paths from POST /update, and the
// dependency_ready insight from GET /project-state. Intended to be re-run
// against production after every deploy to confirm the API didn't break;
// each run uses a fresh, timestamped task/update-id prefix (per plan.md's
// demo guidance) so repeated runs never collide with earlier data and
// nothing needs to be reset.
//
// Usage:
//   npm run smoke-test                                  # against production
//   SMOKE_BASE_URL=http://localhost:3000 npm run smoke-test   # against local dev

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://agent-colab-five.vercel.app";
const PROJECT_ID = "agent-colab";
const RUN = `smoke-${Date.now()}`;

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok - ${message}`);
  } else {
    failed += 1;
    console.error(`  FAIL - ${message}`);
  }
}

async function postUpdate(body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => undefined);
  return { status: res.status, json };
}

async function getProjectState(projectId: string) {
  const res = await fetch(
    `${BASE_URL}/project-state?project_id=${encodeURIComponent(projectId)}`,
  );
  const json = await res.json().catch(() => undefined);
  return { status: res.status, json };
}

function baseUpdate(overrides: Record<string, unknown>) {
  return {
    project_id: PROJECT_ID,
    depends_on: [],
    artifact: null,
    blocker: null,
    ...overrides,
  };
}

async function main() {
  console.log(`Smoke testing ${BASE_URL} (run prefix: ${RUN})\n`);

  console.log("GET /project-state — rejects unknown project_id");
  {
    const { status } = await getProjectState("not-a-real-project");
    assert(status === 400, `unknown project_id returns 400 (got ${status})`);
  }

  console.log("\nPOST /update — rejects an invalid body");
  {
    const { status } = await postUpdate({ project_id: PROJECT_ID });
    assert(status === 400, `missing required fields returns 400 (got ${status})`);
  }

  const frontendTaskId = `${RUN}-greeting-page`;
  const backendTaskId = `${RUN}-greeting-api`;
  const frontendUpdateId = `${RUN}-frontend-blocked`;
  const backendUpdateId = `${RUN}-backend-done`;

  console.log("\nPOST /update — frontend agent posts a blocked task");
  {
    const { status, json } = await postUpdate(
      baseUpdate({
        update_id: frontendUpdateId,
        task_id: frontendTaskId,
        agent_id: "frontend-agent",
        person: "Nathan",
        task: `Smoke test greeting page (${RUN})`,
        status: "blocked",
        summary: "Page shell complete; waiting for the endpoint.",
        blocker: "Waiting for greeting-api",
        depends_on: [backendTaskId],
        next: "Read the endpoint artifact and integrate it",
      }),
    );
    assert(status === 201, `blocked task create returns 201 (got ${status})`);
    assert(json?.update_id === frontendUpdateId, "response echoes update_id");
    assert(typeof json?.sequence === "string", "sequence is a string");
  }

  console.log("\nPOST /update — backend agent posts the completed dependency");
  let backendSequence: string | undefined;
  {
    const { status, json } = await postUpdate(
      baseUpdate({
        update_id: backendUpdateId,
        task_id: backendTaskId,
        agent_id: "backend-agent",
        person: "Khang",
        task: `Smoke test greeting API (${RUN})`,
        status: "done",
        summary: "Endpoint ready; returns a JSON message string.",
        artifact: "https://example.com/greeting-api",
        next: "Support frontend integration",
      }),
    );
    assert(status === 201, `done task create returns 201 (got ${status})`);
    backendSequence = json?.sequence;
    assert(typeof backendSequence === "string", "sequence is a string");
  }

  console.log("\nPOST /update — identical retry is idempotent");
  {
    const { status, json } = await postUpdate(
      baseUpdate({
        update_id: backendUpdateId,
        task_id: backendTaskId,
        agent_id: "backend-agent",
        person: "Khang",
        task: `Smoke test greeting API (${RUN})`,
        status: "done",
        summary: "Endpoint ready; returns a JSON message string.",
        artifact: "https://example.com/greeting-api",
        next: "Support frontend integration",
      }),
    );
    assert(status === 200, `identical retry returns 200 (got ${status})`);
    assert(
      json?.sequence === backendSequence,
      `identical retry keeps the original sequence (${json?.sequence} === ${backendSequence})`,
    );
  }

  console.log("\nPOST /update — retry with different content is rejected");
  {
    const { status } = await postUpdate(
      baseUpdate({
        update_id: backendUpdateId,
        task_id: backendTaskId,
        agent_id: "backend-agent",
        person: "Khang",
        task: `Smoke test greeting API (${RUN})`,
        status: "done",
        summary: "CHANGED",
        artifact: "https://example.com/greeting-api",
        next: "Support frontend integration",
      }),
    );
    assert(status === 409, `conflicting retry returns 409 (got ${status})`);
  }

  console.log("\nPOST /update — a different agent cannot take over an owned task");
  {
    const { status } = await postUpdate(
      baseUpdate({
        update_id: `${RUN}-hijack`,
        task_id: backendTaskId,
        agent_id: "someone-else-agent",
        person: "Gabriel",
        task: `Smoke test greeting API (${RUN})`,
        status: "in_progress",
        summary: "trying to take over",
        next: "none",
      }),
    );
    assert(status === 409, `ownership conflict returns 409 (got ${status})`);
  }

  console.log("\nGET /project-state — reflects both tasks and the dependency_ready insight");
  {
    const { status, json } = await getProjectState(PROJECT_ID);
    assert(status === 200, `project-state returns 200 (got ${status})`);

    const tasks: Array<{ task_id: string; status: string }> = json?.tasks ?? [];
    assert(
      tasks.some((t) => t.task_id === frontendTaskId && t.status === "blocked"),
      "tasks include the blocked frontend task",
    );
    assert(
      tasks.some((t) => t.task_id === backendTaskId && t.status === "done"),
      "tasks include the done backend task",
    );

    const insights: Array<{
      task_id: string;
      dependency_task_ids: string[];
      evidence_update_ids: string[];
      artifact_urls: string[];
    }> = json?.insights ?? [];
    const insight = insights.find((i) => i.task_id === frontendTaskId);
    assert(insight !== undefined, "a dependency_ready insight exists for the frontend task");
    assert(
      insight?.dependency_task_ids.includes(backendTaskId) ?? false,
      "insight names the backend task as the resolved dependency",
    );
    assert(
      (insight?.evidence_update_ids.includes(frontendUpdateId) ?? false) &&
        (insight?.evidence_update_ids.includes(backendUpdateId) ?? false),
      "insight cites both updates as evidence",
    );
    assert(
      insight?.artifact_urls.includes("https://example.com/greeting-api") ?? false,
      "insight carries the backend artifact URL",
    );
  }

  // Finish the synthetic task so successful test runs leave no active work.
  const finished = await postUpdate(baseUpdate({
    update_id: `${RUN}-frontend-done`, task_id: frontendTaskId,
    agent_id: "frontend-agent", person: "Nathan",
    task: `Smoke test greeting page (${RUN})`, status: "done",
    summary: "Synthetic handoff check finished; no implementation work remains.",
    blocker: null, depends_on: [backendTaskId], next: "No further test work",
  }));
  assert(finished.status === 201, "synthetic frontend task is closed");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("smoke test crashed:", error);
  process.exit(1);
});
