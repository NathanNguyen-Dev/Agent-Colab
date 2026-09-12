// Placeholder root page. The read-only dashboard described in plan.md is not
// built yet; this deployment currently ships the backend API only.

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Agent-Colab</h1>
      <p>
        This deployment currently serves the backend API only. See{" "}
        <code>/docs/openapi.yaml</code> in the repository for the endpoint
        contract.
      </p>
      <ul>
        <li>
          <code>POST /update</code>
        </li>
        <li>
          <code>GET /project-state?project_id=agent-colab</code>
        </li>
      </ul>
      <p>The read-only dashboard is planned but not yet implemented.</p>
    </main>
  );
}
