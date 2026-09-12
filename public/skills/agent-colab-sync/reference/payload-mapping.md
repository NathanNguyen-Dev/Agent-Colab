# Hook payload mapping

UserPromptSubmit reads session_id, prompt_id or turn_id, and prompt_text or prompt.
Stop needs no final-message parsing: it logs locally and never changes task state.
Host hook support and context injection must be checked in the installed runtime.

Task IDs hash the hub URL, project, explicit human, agent, runtime and session ID.
Update IDs also hash the event identity and prompt. This avoids prefix truncation
collisions. Missing session IDs or explicit identities are logged and skipped.

New session starts send every required field: project_id, task_id, update_id,
agent_id, person, task (first prompt line, at most 200 characters), in_progress,
summary (at most 2000), blocker null, depends_on [], artifact null, and a nonempty
next step. Existing snapshots are not overwritten by automatic prompt events.
Agents use explicit API updates for real task transitions and handoffs.

Local state stores taskId, seen event keys, and pending exact payloads. It is
namespaced per connection. A dry run prints the prospective state to stderr
without writing state or making requests. Local logs contain delivery errors;
state contains prompt-derived payloads and should be treated as shared-work data.

The hook prints compact GET results to stdout for pre-turn context injection.
The installer uses synchronous command hooks; verify behavior in the actual host.
