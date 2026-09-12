#!/usr/bin/env node
// Agent-Colab sync hook.
//
// Reads one hook event as JSON on stdin, turns it into a POST /update payload
// for the Agent-Colab hub (see the agent-colab-api skill and docs/openapi.yaml),
// and sends it. Works for both Claude Code and Codex, whose hook wire formats
// agree on the fields this script reads.
//
//   node sync-hook.mjs --runtime claude|codex [--dry-run]
//
// Contract with the host agent: never write to stdout (on UserPromptSubmit the
// host injects stdout into the model's context) and always exit 0, so a hub
// outage or a bad config can never block the user's turn. Failures go to the
// log file instead.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const HOME = join(homedir(), ".agent-colab");
const STATE_DIR = join(HOME, "state");
const LOG_PATH = join(HOME, "sync.log");
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Mirrors lib/contracts.ts. Exceeding these is a 400 from the hub.
const MAX_SHORT = 200;
const MAX_SUMMARY = 2000;
const MAX_NEXT = 2000;

const args = process.argv.slice(2);
const runtime = valueOf("--runtime") ?? "claude";
const dryRun = args.includes("--dry-run");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

function log(message) {
  try {
    mkdirSync(HOME, { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${runtime}] ${message}\n`);
  } catch {
    // A log we cannot write is not worth failing a turn over.
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function loadConfig() {
  const file = process.env.AGENT_COLAB_CONFIG ?? join(HOME, "config.json");
  let fromFile = {};
  try {
    fromFile = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // No config file is the normal case; env vars and defaults cover it.
  }
  const person =
    process.env.AGENT_COLAB_PERSON ?? fromFile.person ?? gitConfig("user.name") ?? userInfo().username ?? "unknown";
  const agentId = process.env.AGENT_COLAB_AGENT_ID ?? fromFile.agent_id ?? `${runtimeLabel()}-${slug(person)}`;
  return {
    enabled: process.env.AGENT_COLAB_SYNC !== "0" && fromFile.enabled !== false,
    baseUrl: (process.env.AGENT_COLAB_BASE_URL ?? fromFile.base_url ?? "https://agent-colab-five.vercel.app").replace(/\/+$/, ""),
    projectId: process.env.AGENT_COLAB_PROJECT_ID ?? fromFile.project_id ?? "agent-colab",
    person,
    agentId,
    artifact: process.env.AGENT_COLAB_ARTIFACT ?? fromFile.artifact ?? null,
    includeGitStatus: fromFile.include_git_status !== false,
    timeoutMs: Number(fromFile.timeout_ms ?? 4000),
  };
}

function runtimeLabel() {
  return runtime === "codex" ? "codex" : "claude-code";
}

function gitConfig(key) {
  try {
    return execFileSync("git", ["config", "--get", key], { encoding: "utf8", timeout: 1500 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent";
}

// Prompts and assistant messages are pushed to a shared hub, so strip the
// credential shapes that most often end up pasted into a prompt.
function redact(text) {
  return String(text)
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/g, "[redacted]")
    .replace(/\b[A-Za-z0-9._-]+:\/\/[^\s@]+:[^\s@]+@/g, "[redacted]@");
}

function clamp(text, max) {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function firstLine(text) {
  const line = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? "";
}

function statePath(sessionId) {
  return join(STATE_DIR, `${slug(sessionId) || "session"}.json`);
}

function readState(sessionId) {
  try {
    return JSON.parse(readFileSync(statePath(sessionId), "utf8"));
  } catch {
    return {};
  }
}

function writeState(sessionId, state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(statePath(sessionId), JSON.stringify(state));
  } catch (error) {
    log(`state write failed: ${error.message}`);
  }
}

function pruneState() {
  try {
    const cutoff = Date.now() - STATE_TTL_MS;
    for (const name of readdirSync(STATE_DIR)) {
      const path = join(STATE_DIR, name);
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    }
  } catch {
    // Best effort only.
  }
}

// A cheap, runtime-agnostic answer to "what did the agent actually touch?".
function changedFiles(cwd) {
  try {
    const out = execFileSync("git", ["-C", cwd, "status", "--porcelain"], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = out
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    if (files.length === 0) return null;
    const shown = files.slice(0, 10).join(", ");
    return files.length > 10 ? `${shown}, +${files.length - 10} more` : shown;
  } catch {
    return null;
  }
}

function buildPayload(input, config) {
  const event = input.hook_event_name;
  const sessionId = String(input.session_id ?? "unknown");
  const cwd = input.cwd ?? process.cwd();
  const repo = slug(cwd.split("/").filter(Boolean).pop() ?? "repo");
  const sessionShort = slug(sessionId).replace(/-/g, "").slice(0, 12) || "nosession";
  const taskId = `${config.agentId}-${repo}-${sessionShort}`;

  const state = readState(sessionId);
  const turn = (state.turn ?? 0) + (event === "UserPromptSubmit" ? 1 : 0);
  // prompt_id (Claude) and turn_id (Codex) make the update_id a genuine
  // idempotency key: a retried hook replays the same update instead of
  // creating a second one.
  const turnKey = slug(input.prompt_id ?? input.turn_id ?? `t${turn}`);
  const modelTag = [runtimeLabel(), input.model].filter(Boolean).join("/");

  if (event === "UserPromptSubmit") {
    const prompt = redact(input.prompt_text ?? input.prompt ?? "");
    if (!prompt.trim()) return null;
    const title = clamp(firstLine(prompt) || "Untitled prompt", MAX_SHORT);
    writeState(sessionId, { turn, task: title, prompt: clamp(prompt, MAX_SUMMARY), cwd });
    pruneState();
    return {
      update_id: clamp(`${sessionId}-prompt-${turnKey}`, MAX_SHORT),
      project_id: config.projectId,
      task_id: clamp(taskId, MAX_SHORT),
      agent_id: clamp(config.agentId, MAX_SHORT),
      person: clamp(config.person, MAX_SHORT),
      task: title,
      status: "in_progress",
      summary: clamp(`Prompt to ${modelTag} in ${repo}:\n${prompt}`, MAX_SUMMARY),
      blocker: null,
      depends_on: [],
      artifact: config.artifact,
      next: clamp(`${modelTag} is working on this prompt.`, MAX_NEXT),
    };
  }

  if (event === "Stop") {
    const message = redact(input.last_assistant_message ?? "");
    const files = config.includeGitStatus ? changedFiles(cwd) : null;
    const title = clamp(state.task || `Session ${sessionShort} in ${repo}`, MAX_SHORT);
    const body = message.trim() || "Turn ended without a final assistant message (tool-only turn).";
    const summary = clamp(
      [`${modelTag} finished a turn on: ${title}`, "", body, files ? `\nUncommitted files: ${files}` : ""].join("\n"),
      MAX_SUMMARY,
    );
    writeState(sessionId, { ...state, turn, cwd });
    return {
      update_id: clamp(`${sessionId}-stop-${turnKey}`, MAX_SHORT),
      project_id: config.projectId,
      task_id: clamp(taskId, MAX_SHORT),
      agent_id: clamp(config.agentId, MAX_SHORT),
      person: clamp(config.person, MAX_SHORT),
      task: title,
      status: "done",
      summary,
      blocker: null,
      depends_on: [],
      artifact: config.artifact,
      next: clamp(`Awaiting the next prompt from ${config.person}.`, MAX_NEXT),
    };
  }

  return null;
}

async function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    log("no hook input on stdin");
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    log(`unparseable hook input: ${error.message}`);
    return;
  }

  const config = loadConfig();
  if (!config.enabled) return;

  const payload = buildPayload(input, config);
  if (!payload) return;

  if (dryRun) {
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  try {
    const response = await fetch(`${config.baseUrl}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log(`POST /update ${response.status} for ${payload.update_id}: ${detail.slice(0, 300)}`);
    }
  } catch (error) {
    log(`POST /update failed for ${payload.update_id}: ${error.message}`);
  }
}

main()
  .catch((error) => log(`unexpected failure: ${error?.stack ?? error}`))
  .finally(() => process.exit(0));
