// Bahay ni Kuya adapter installer.
//
//   bun run scripts/install-adapters.ts              # install / update (idempotent)
//   bun run scripts/install-adapters.ts --uninstall  # remove everything it installed
//   bun run scripts/install-adapters.ts --dry-run    # show the plan, touch nothing
//   bun run scripts/install-adapters.ts --help
//
// Every file it edits or copies over is backed up first to
//   %USERPROFILE%/.bahay-ni-kuya/backups/<ISO timestamp>/
// The codex hooks.json is JSON-merged (Orca entries preserved); the hermes config.yaml gets a
// marker block appended/updated (never a duplicate `hooks:` key).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const HOME = homedir().replace(/\\/g, "/");

const at = (...parts: string[]): string => join(HOME, ...parts).replace(/\\/g, "/");
const repo = (...parts: string[]): string => resolve(REPO, ...parts).replace(/\\/g, "/");

const TARGETS = {
  omp: at(".omp", "agent", "extensions", "bahay-omp.ts"),
  pi: at(".pi", "agent", "extensions", "bahay-pi.ts"),
  codexDir: at(".bahay-ni-kuya", "adapters", "codex"),
  codexCmd: at(".bahay-ni-kuya", "adapters", "codex", "bahay-codex.cmd"),
  codexPs1: at(".bahay-ni-kuya", "adapters", "codex", "bahay-codex.ps1"),
  hooksJson: at(".codex", "hooks.json"),
  hermesConfig: at("AppData", "Local", "hermes", "config.yaml"),
  openCode: at(".config", "opencode", "plugins", "bahay-opencode.js"),
  localOpenCode: repo(".opencode", "plugins", "bahay-opencode.js"),
};

const SOURCES = {
  omp: repo("adapters", "omp", "bahay-omp.ts"),
  pi: repo("adapters", "pi", "bahay-pi.ts"),
  codexCmd: repo("adapters", "codex", "bahay-codex.cmd"),
  codexPs1: repo("adapters", "codex", "bahay-codex.ps1"),
  hermesFragment: repo("adapters", "hermes", "hooks-fragment.yaml"),
  openCode: repo("adapters", "opencode", "bahay-opencode.js"),
};

// Hook event names verified inside codex.exe 0.166.0 (hooks\src\events\*, hooks\src\registry.rs).
// Omitted on purpose: Notification (not a hook key in this build) and PreCompact/PostCompact
// (valid, but Bahay ni Kuya does not need the extra traffic).
export const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "SessionEnd",
  "Interrupt",
] as const;

const CODEX_COMMAND_MARKER = "bahay-codex";
const HERMES_START = "# >>> bahay-ni-kuya";
const HERMES_END = "# <<< bahay-ni-kuya";

type CodexConfig = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isAgentHouseHook(value: unknown): boolean {
  const record = asRecord(value);
  return !!record && typeof record.command === "string" && record.command.includes(CODEX_COMMAND_MARKER);
}

function hookCommands(group: unknown): unknown[] {
  const record = asRecord(group);
  return record && Array.isArray(record.hooks) ? record.hooks : [];
}

export function mergeCodexHooks(
  config: CodexConfig,
  command: string,
): { config: CodexConfig; added: string[]; skipped: string[] } {
  const next = structuredClone(config);
  const hooks = asRecord(next.hooks) ?? {};
  if (!asRecord(next.hooks)) next.hooks = hooks;
  const added: string[] = [];
  const skipped: string[] = [];

  for (const event of CODEX_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    if (!Array.isArray(hooks[event])) hooks[event] = existing;
    if (existing.some((group) => hookCommands(group).some(isAgentHouseHook))) {
      skipped.push(event);
      continue;
    }
    existing.push({ hooks: [{ type: "command", command, timeout: 10 }] });
    added.push(event);
  }

  return { config: next, added, skipped };
}

export function stripCodexHooks(config: CodexConfig): { config: CodexConfig; removed: string[] } {
  const next = structuredClone(config);
  const hooks = asRecord(next.hooks);
  const removed: string[] = [];
  if (!hooks) return { config: next, removed };

  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    let removedHere = 0;
    for (const group of groups) {
      const record = asRecord(group);
      const children = record && Array.isArray(record.hooks) ? record.hooks : undefined;
      if (!record || !children) {
        kept.push(group);
        continue;
      }
      const keptChildren = children.filter((child) => !isAgentHouseHook(child));
      if (keptChildren.length === children.length) {
        kept.push(group);
        continue;
      }
      removedHere += children.length - keptChildren.length;
      if (keptChildren.length > 0) kept.push({ ...record, hooks: keptChildren });
    }
    if (removedHere === 0) continue;
    removed.push(event);
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }

  return { config: next, removed };
}

function readHermesFragment(): string {
  return readFileSync(SOURCES.hermesFragment, "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function upsertHermesBlock(
  text: string,
  block: string,
): { text: string; action: "appended" | "replaced" | "unchanged" | "skipped"; note?: string } {
  const start = text.indexOf(HERMES_START);
  if (start >= 0) {
    const end = text.indexOf(HERMES_END, start);
    if (end < 0) {
      return { text, action: "skipped", note: "existing `# >>> bahay-ni-kuya` marker has no closing marker" };
    }
    const stop = end + HERMES_END.length;
    const next = text.slice(0, start) + block.trimEnd() + text.slice(stop);
    return { text: next, action: next === text ? "unchanged" : "replaced" };
  }

  const emptyHooks = /^hooks\s*:\s*\{\s*\}\s*$/m;
  if (emptyHooks.test(text)) {
    return { text: text.replace(emptyHooks, block.trimEnd()), action: "replaced" };
  }
  if (/^hooks\s*:/m.test(text)) {
    return {
      text,
      action: "skipped",
      note: "config.yaml already has a non-empty `hooks:` block — merge adapters/hermes/hooks-fragment.yaml manually",
    };
  }

  const base = text.endsWith("\n") ? text : `${text}\n`;
  return { text: `${base}\n${block.trimEnd()}\n`, action: "appended" };
}

export function removeHermesBlock(text: string): { text: string; removed: boolean } {
  const start = text.indexOf(HERMES_START);
  if (start < 0) return { text, removed: false };
  const end = text.indexOf(HERMES_END, start);
  if (end < 0) return { text, removed: false };
  const before = text.slice(0, start).replace(/\n+$/, "");
  const after = text.slice(end + HERMES_END.length).replace(/^\n+/, "");
  const merged = [before, after].filter((part) => part.length > 0).join("\n\n");
  return { text: merged ? `${merged}\n` : "", removed: true };
}

interface Note {
  action: string;
  path: string;
  detail?: string;
}

let backupRoot = "";
const backups: string[] = [];

function backupFile(abs: string): string | undefined {
  if (!existsSync(abs)) return undefined;
  if (!backupRoot) {
    backupRoot = at(".bahay-ni-kuya", "backups", new Date().toISOString().replace(/[:.]/g, "-"));
    mkdirSync(backupRoot, { recursive: true });
  }
  const relative = abs.replace(/^[A-Za-z]:/, "").replace(/[\\/]+/g, "__");
  const destination = join(backupRoot, relative);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(abs));
  backups.push(destination);
  return destination;
}

function writeTracked(notes: Note[], abs: string, data: Uint8Array, dryRun: boolean): boolean {
  const before = existsSync(abs) ? readFileSync(abs) : undefined;
  const after = Buffer.from(data);
  if (before && before.equals(after)) {
    notes.push({ action: "unchanged", path: abs });
    return false;
  }
  if (dryRun) {
    notes.push({ action: before ? "would-update" : "would-create", path: abs });
    return true;
  }
  const backup = backupFile(abs);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, after);
  notes.push({ action: before ? "updated" : "created", path: abs, detail: backup ? `backup: ${backup}` : undefined });
  return true;
}

function removeTracked(notes: Note[], abs: string, dryRun: boolean): boolean {
  if (!existsSync(abs)) {
    notes.push({ action: "absent", path: abs });
    return false;
  }
  if (dryRun) {
    notes.push({ action: "would-remove", path: abs });
    return true;
  }
  const backup = backupFile(abs);
  rmSync(abs, { force: true });
  notes.push({ action: "removed", path: abs, detail: backup ? `backup: ${backup}` : undefined });
  return true;
}

function requireSource(path: string): Uint8Array {
  if (!existsSync(path)) throw new Error(`missing adapter source: ${path}`);
  return readFileSync(path);
}

function readCodexConfig(path: string): CodexConfig {
  if (!existsSync(path)) return { hooks: {} };
  const text = readFileSync(path, "utf8").trim();
  if (!text) return { hooks: {} };
  const parsed: unknown = JSON.parse(text);
  const record = asRecord(parsed);
  if (!record) throw new Error(`hooks.json is not a JSON object: ${path}`);
  return record;
}

function installAll(notes: Note[], dryRun: boolean): void {
  writeTracked(notes, TARGETS.openCode, requireSource(SOURCES.openCode), dryRun);
  writeTracked(notes, TARGETS.localOpenCode, requireSource(SOURCES.openCode), dryRun);
  writeTracked(notes, TARGETS.omp, requireSource(SOURCES.omp), dryRun);
  writeTracked(notes, TARGETS.pi, requireSource(SOURCES.pi), dryRun);

  writeTracked(notes, TARGETS.codexCmd, requireSource(SOURCES.codexCmd), dryRun);
  writeTracked(notes, TARGETS.codexPs1, requireSource(SOURCES.codexPs1), dryRun);

  const command = TARGETS.codexCmd;
  const config = readCodexConfig(TARGETS.hooksJson);
  const merged = mergeCodexHooks(config, command);
  if (merged.added.length > 0) {
    const text = `${JSON.stringify(merged.config, null, 2)}\n`;
    writeTracked(notes, TARGETS.hooksJson, Buffer.from(text, "utf8"), dryRun);
    notes.push({
      action: "merged",
      path: TARGETS.hooksJson,
      detail: `added: ${merged.added.join(", ") || "none"}${merged.skipped.length ? `; already present: ${merged.skipped.join(", ")}` : ""}`,
    });
  } else {
    notes.push({
      action: "unchanged",
      path: TARGETS.hooksJson,
      detail: `all ${CODEX_EVENTS.length} entries already present`,
    });
  }

  if (!existsSync(TARGETS.hermesConfig)) {
    notes.push({ action: "skipped", path: TARGETS.hermesConfig, detail: "hermes config not found" });
    return;
  }
  const raw = readFileSync(TARGETS.hermesConfig, "utf8");
  const crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");
  const result = upsertHermesBlock(text, readHermesFragment());
  if (result.action === "skipped") {
    notes.push({ action: "skipped", path: TARGETS.hermesConfig, detail: result.note });
    return;
  }
  if (result.action === "unchanged") {
    notes.push({ action: "unchanged", path: TARGETS.hermesConfig, detail: "bahay-ni-kuya block already current" });
    return;
  }
  const output = crlf ? result.text.replace(/\n/g, "\r\n") : result.text;
  writeTracked(notes, TARGETS.hermesConfig, Buffer.from(output, "utf8"), dryRun);
  notes.push({
    action: result.action === "appended" ? "appended" : "replaced",
    path: TARGETS.hermesConfig,
    detail: result.action === "appended" ? "added `hooks.outbound` block" : "updated `hooks.outbound` block in place",
  });
}

function uninstallAll(notes: Note[], dryRun: boolean): void {
  if (existsSync(TARGETS.openCode)) removeTracked(notes, TARGETS.openCode, dryRun);
  if (existsSync(TARGETS.localOpenCode)) removeTracked(notes, TARGETS.localOpenCode, dryRun);
  removeTracked(notes, TARGETS.omp, dryRun);
  removeTracked(notes, TARGETS.pi, dryRun);
  removeTracked(notes, TARGETS.codexCmd, dryRun);
  removeTracked(notes, TARGETS.codexPs1, dryRun);

  if (existsSync(TARGETS.hooksJson)) {
    const config = readCodexConfig(TARGETS.hooksJson);
    const stripped = stripCodexHooks(config);
    if (stripped.removed.length > 0) {
      const text = `${JSON.stringify(stripped.config, null, 2)}\n`;
      writeTracked(notes, TARGETS.hooksJson, Buffer.from(text, "utf8"), dryRun);
      notes.push({ action: "unmerged", path: TARGETS.hooksJson, detail: `removed: ${stripped.removed.join(", ")}` });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.hooksJson, detail: "no bahay-ni-kuya entries" });
    }
  } else {
    notes.push({ action: "absent", path: TARGETS.hooksJson });
  }

  if (existsSync(TARGETS.hermesConfig)) {
    const raw = readFileSync(TARGETS.hermesConfig, "utf8");
    const crlf = raw.includes("\r\n");
    const result = removeHermesBlock(raw.replace(/\r\n/g, "\n"));
    if (result.removed) {
      const output = crlf ? result.text.replace(/\n/g, "\r\n") : result.text;
      writeTracked(notes, TARGETS.hermesConfig, Buffer.from(output, "utf8"), dryRun);
      notes.push({ action: "unmerged", path: TARGETS.hermesConfig, detail: "removed bahay-ni-kuya block" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.hermesConfig, detail: "no bahay-ni-kuya block" });
    }
  } else {
    notes.push({ action: "absent", path: TARGETS.hermesConfig });
  }
}

function printNotes(notes: Note[]): void {
  for (const note of notes) {
    const line = `  ${note.action.padEnd(12)} ${note.path}${note.detail ? `  (${note.detail})` : ""}`;
    console.log(line);
  }
  if (backups.length > 0) {
    console.log("\nBackups:");
    for (const backup of backups) console.log(`  ${backup}`);
  }
  const touched = notes.filter((note) => !["unchanged", "absent", "skipped"].includes(note.action)).length;
  console.log(`\n${touched} path(s) changed${backupRoot ? `, backups in ${backupRoot}` : ""}.`);
}

function printHelp(): void {
  console.log(`Bahay ni Kuya adapter installer

Usage:
  bun run scripts/install-adapters.ts [options]

Options:
  --uninstall   remove every adapter file/entry this script installed
  --dry-run     print the plan without writing or backing up anything
  --help, -h    show this help

Targets (home: ${HOME}):
  omp       ${TARGETS.omp}
  pi        ${TARGETS.pi}
  codex     ${TARGETS.codexDir}/bahay-codex.{cmd,ps1}
            ${TARGETS.hooksJson}   (JSON merge; Orca entries preserved)
  hermes    ${TARGETS.hermesConfig}   (marker block append)

Backups: ${HOME}/.bahay-ni-kuya/backups/<ISO timestamp>/

Environment:
  BAHAY_NI_KUYA_URL   read at runtime by every adapter except hermes (whose URL is
                    written into config.yaml). Default http://127.0.0.1:4777/event.
`);
}

async function main(argv: string[]): Promise<void> {
  const flags = new Set(argv);
  if (flags.has("--help") || flags.has("-h")) {
    printHelp();
    return;
  }
  const dryRun = flags.has("--dry-run");
  const uninstall = flags.has("--uninstall");
  const notes: Note[] = [];
  console.log(`Bahay ni Kuya adapters — ${uninstall ? "uninstall" : "install"}${dryRun ? " (dry run)" : ""}\n`);
  if (uninstall) uninstallAll(notes, dryRun);
  else installAll(notes, dryRun);
  printNotes(notes);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`install-adapters failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
