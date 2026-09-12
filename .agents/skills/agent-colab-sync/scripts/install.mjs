#!/usr/bin/env node
// Installs (or removes) the Agent-Colab sync hooks in a host agent's config.
//
//   node install.mjs --runtime claude|codex [--scope project|user] [--dry-run]
//   node install.mjs --runtime claude --uninstall
//
// Writes UserPromptSubmit and Stop entries pointing at sync-hook.mjs. Existing
// hooks in the file are preserved; re-running replaces only our own entries, so
// installing twice is a no-op rather than a duplicate POST per turn.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "sync-hook.mjs");
const EVENTS = ["UserPromptSubmit", "Stop"];
const MARKER = "agent-colab-sync";

const args = process.argv.slice(2);
const runtime = valueOf("--runtime");
const scope = valueOf("--scope") ?? (runtime === "codex" ? "user" : "project");
const projectDir = resolve(valueOf("--project-dir") ?? process.cwd());
const uninstall = args.includes("--uninstall");
const dryRun = args.includes("--dry-run");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

if (runtime !== "claude" && runtime !== "codex") fail("--runtime must be 'claude' or 'codex'");
if (scope !== "project" && scope !== "user") fail("--scope must be 'project' or 'user'");

const target =
  runtime === "claude"
    ? scope === "project"
      ? join(projectDir, ".claude", "settings.json")
      : join(homedir(), ".claude", "settings.json")
    : scope === "project"
      ? join(projectDir, ".codex", "hooks.json")
      : join(homedir(), ".codex", "hooks.json");

// Absolute paths, not ${CLAUDE_PROJECT_DIR}: the same entry then works at user
// scope and under Codex, which does not expand that variable.
const command = `node ${JSON.stringify(HOOK_SCRIPT)} --runtime ${runtime}`;

function readJson(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${path} is not valid JSON (${error.message}); fix or move it before installing`);
  }
}

function isOurs(handler) {
  return typeof handler?.command === "string" && handler.command.includes(MARKER);
}

const config = readJson(target);
config.hooks ??= {};

for (const event of EVENTS) {
  const groups = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
  const cleaned = groups
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((handler) => !isOurs(handler)) }))
    .filter((group) => (group.hooks ?? []).length > 0);

  if (!uninstall) {
    cleaned.push({
      hooks: [
        {
          type: "command",
          command,
          timeout: 10,
          ...(runtime === "codex" ? { statusMessage: "Reading shared project context" } : {}),
        },
      ],
    });
  }

  if (cleaned.length > 0) config.hooks[event] = cleaned;
  else delete config.hooks[event];
}

if (Object.keys(config.hooks).length === 0) delete config.hooks;

const output = `${JSON.stringify(config, null, 2)}\n`;

if (dryRun) {
  console.log(`# would write ${target}\n${output}`);
  process.exit(0);
}

if (existsSync(target)) {
  const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(target, backup);
  console.log(`backed up ${target} -> ${backup}`);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output);
console.log(`${uninstall ? "removed" : "installed"} Agent-Colab sync hooks (${EVENTS.join(", ")}) in ${target}`);
if (!uninstall) console.log(`hook command: ${command}`);
