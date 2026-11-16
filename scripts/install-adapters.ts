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
  codexConfigToml: at(".codex", "config.toml"),
  hermesConfig: at("AppData", "Local", "hermes", "config.yaml"),
  openCodeConfig: at(".config", "opencode", "opencode.json"),
};

const SOURCES = {
  omp: repo("adapters", "omp", "bahay-omp.ts"),
  pi: repo("adapters", "pi", "bahay-pi.ts"),
  codexCmd: repo("adapters", "codex", "bahay-codex.cmd"),
  codexPs1: repo("adapters", "codex", "bahay-codex.ps1"),
  hermesFragment: repo("adapters", "hermes", "hooks-fragment.yaml"),
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

// --- MCP Server Registration Helpers (Milestone 8) ---
const CODEX_MCP_START = "# >>> bahay-ni-kuya-mcp";
const CODEX_MCP_END = "# <<< bahay-ni-kuya-mcp";

export function mergeCodexMcp(
  tomlText: string,
  mcpScriptPath: string,
): { text: string; action: "appended" | "replaced" | "unchanged" } {
  const normalizedPath = mcpScriptPath.replace(/\\/g, "/");
  const block = `${CODEX_MCP_START}\n[mcp_servers.bahay_ni_kuya]\ncommand = "bun"\nargs = ["run", "${normalizedPath}"]\n${CODEX_MCP_END}`;

  const start = tomlText.indexOf(CODEX_MCP_START);
  if (start >= 0) {
    const end = tomlText.indexOf(CODEX_MCP_END, start);
    if (end >= 0) {
      const stop = end + CODEX_MCP_END.length;
      const next = tomlText.slice(0, start) + block.trimEnd() + tomlText.slice(stop);
      return { text: next, action: next === tomlText ? "unchanged" : "replaced" };
    }
  }

  if (/\[mcp_servers\.bahay_ni_kuya\]/.test(tomlText)) {
    return { text: tomlText, action: "unchanged" };
  }

  const base = tomlText.endsWith("\n") ? tomlText : `${tomlText}\n`;
  return { text: `${base}\n${block.trimEnd()}\n`, action: "appended" };
}

export function stripCodexMcp(tomlText: string): { text: string; removed: boolean } {
  const start = tomlText.indexOf(CODEX_MCP_START);
  if (start >= 0) {
    const end = tomlText.indexOf(CODEX_MCP_END, start);
    if (end >= 0) {
      const before = tomlText.slice(0, start).replace(/\n+$/, "");
      const after = tomlText.slice(end + CODEX_MCP_END.length).replace(/^\n+/, "");
      const merged = [before, after].filter((p) => p.length > 0).join("\n\n");
      return { text: merged ? `${merged}\n` : "", removed: true };
    }
  }
  return { text: tomlText, removed: false };
}

export function mergeOpenCodeMcp(
  jsonText: string,
  mcpScriptPath: string,
): { text: string; action: "updated" | "unchanged" } {
  const normalizedPath = mcpScriptPath.replace(/\\/g, "/");
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { text: jsonText, action: "unchanged" };
  }
  if (typeof parsed !== "object" || parsed === null) return { text: jsonText, action: "unchanged" };

  parsed.mcp = parsed.mcp || {};
  const existing = parsed.mcp["bahay-ni-kuya"];
  const currentEntry = {
    type: "stdio",
    command: "bun",
    args: ["run", normalizedPath],
  };

  if (existing && JSON.stringify(existing) === JSON.stringify(currentEntry)) {
    return { text: jsonText, action: "unchanged" };
  }

  parsed.mcp["bahay-ni-kuya"] = currentEntry;
  return { text: `${JSON.stringify(parsed, null, 2)}\n`, action: "updated" };
}

export function stripOpenCodeMcp(jsonText: string): { text: string; removed: boolean } {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { text: jsonText, removed: false };
  }
  if (typeof parsed !== "object" || parsed === null || !parsed.mcp) {
    return { text: jsonText, removed: false };
  }

  if (parsed.mcp["bahay-ni-kuya"]) {
    delete parsed.mcp["bahay-ni-kuya"];
    if (Object.keys(parsed.mcp).length === 0) delete parsed.mcp;
    return { text: `${JSON.stringify(parsed, null, 2)}\n`, removed: true };
  }

  return { text: jsonText, removed: false };
}

const HERMES_MCP_START = "# >>> bahay-ni-kuya-mcp";
const HERMES_MCP_END = "# <<< bahay-ni-kuya-mcp";

export function mergeHermesMcp(
  yamlText: string,
  mcpScriptPath: string,
): { text: string; action: "appended" | "replaced" | "unchanged" } {
  const normalizedPath = mcpScriptPath.replace(/\\/g, "/");
  const block = `  ${HERMES_MCP_START}\n  bahay_ni_kuya:\n    command: bun\n    args:\n      - run\n      - "${normalizedPath}"\n  ${HERMES_MCP_END}`;

  const start = yamlText.indexOf(HERMES_MCP_START);
  if (start >= 0) {
    const end = yamlText.indexOf(HERMES_MCP_END, start);
    if (end >= 0) {
      const stop = end + HERMES_MCP_END.length;
      const next = yamlText.slice(0, start) + block.trim() + yamlText.slice(stop);
      return { text: next, action: next === yamlText ? "unchanged" : "replaced" };
    }
  }

  const mcpServersMatch = yamlText.match(/^mcp_servers\s*:\s*$/m);
  if (mcpServersMatch && mcpServersMatch.index !== undefined) {
    const insertPos = mcpServersMatch.index + mcpServersMatch[0].length;
    const before = yamlText.slice(0, insertPos);
    const after = yamlText.slice(insertPos);
    return {
      text: `${before}\n${block}${after}`,
      action: "appended",
    };
  }

  const rootBlock = `${HERMES_MCP_START}\nmcp_servers:\n  bahay_ni_kuya:\n    command: bun\n    args:\n      - run\n      - "${normalizedPath}"\n${HERMES_MCP_END}\n`;
  const base = yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`;
  return { text: `${base}\n${rootBlock}`, action: "appended" };
}

export function stripHermesMcp(yamlText: string): { text: string; removed: boolean } {
  const start = yamlText.indexOf(HERMES_MCP_START);
  if (start >= 0) {
    const end = yamlText.indexOf(HERMES_MCP_END, start);
    if (end >= 0) {
      const before = yamlText.slice(0, start).replace(/\n+$/, "");
      const after = yamlText.slice(end + HERMES_MCP_END.length).replace(/^\n+/, "");
      const merged = [before, after].filter((p) => p.length > 0).join("\n\n");
      return { text: merged ? `${merged}\n` : "", removed: true };
    }
  }
  return { text: yamlText, removed: false };
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
  } else {
    const output = crlf ? result.text.replace(/\n/g, "\r\n") : result.text;
    writeTracked(notes, TARGETS.hermesConfig, Buffer.from(output, "utf8"), dryRun);
    notes.push({
      action: result.action === "appended" ? "appended" : "replaced",
      path: TARGETS.hermesConfig,
      detail: result.action === "appended" ? "added `hooks.outbound` block" : "updated `hooks.outbound` block in place",
    });
  }

  // --- MCP Client Registrations (Milestone 8) ---
  const mcpScript = repo("src", "mcp.ts");

  // 1. Codex MCP (config.toml)
  if (existsSync(TARGETS.codexConfigToml)) {
    const codexToml = readFileSync(TARGETS.codexConfigToml, "utf8");
    const mcpRes = mergeCodexMcp(codexToml, mcpScript);
    if (mcpRes.action !== "unchanged") {
      writeTracked(notes, TARGETS.codexConfigToml, Buffer.from(mcpRes.text, "utf8"), dryRun);
      notes.push({ action: mcpRes.action, path: TARGETS.codexConfigToml, detail: "registered bahay_ni_kuya MCP server" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.codexConfigToml, detail: "bahay_ni_kuya MCP server already configured" });
    }
  }

  // 2. OpenCode MCP (opencode.json)
  if (existsSync(TARGETS.openCodeConfig)) {
    const openJson = readFileSync(TARGETS.openCodeConfig, "utf8");
    const mcpRes = mergeOpenCodeMcp(openJson, mcpScript);
    if (mcpRes.action === "updated") {
      writeTracked(notes, TARGETS.openCodeConfig, Buffer.from(mcpRes.text, "utf8"), dryRun);
      notes.push({ action: "updated", path: TARGETS.openCodeConfig, detail: "registered bahay-ni-kuya MCP server" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.openCodeConfig, detail: "bahay-ni-kuya MCP server already configured" });
    }
  }

  // 3. Hermes MCP (config.yaml)
  if (existsSync(TARGETS.hermesConfig)) {
    const curYaml = readFileSync(TARGETS.hermesConfig, "utf8");
    const isCrlf = curYaml.includes("\r\n");
    const normYaml = curYaml.replace(/\r\n/g, "\n");
    const mcpRes = mergeHermesMcp(normYaml, mcpScript);
    if (mcpRes.action !== "unchanged") {
      const out = isCrlf ? mcpRes.text.replace(/\n/g, "\r\n") : mcpRes.text;
      writeTracked(notes, TARGETS.hermesConfig, Buffer.from(out, "utf8"), dryRun);
      notes.push({ action: mcpRes.action, path: TARGETS.hermesConfig, detail: "registered bahay_ni_kuya MCP server" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.hermesConfig, detail: "bahay_ni_kuya MCP server already configured" });
    }
  }
}

function uninstallAll(notes: Note[], dryRun: boolean): void {
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
    let text = raw.replace(/\r\n/g, "\n");

    const hookRes = removeHermesBlock(text);
    if (hookRes.removed) text = hookRes.text;

    const mcpRes = stripHermesMcp(text);
    if (mcpRes.removed) text = mcpRes.text;

    if (hookRes.removed || mcpRes.removed) {
      const output = crlf ? text.replace(/\n/g, "\r\n") : text;
      writeTracked(notes, TARGETS.hermesConfig, Buffer.from(output, "utf8"), dryRun);
      notes.push({ action: "unmerged", path: TARGETS.hermesConfig, detail: "removed bahay-ni-kuya hooks and/or MCP block" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.hermesConfig, detail: "no bahay-ni-kuya blocks" });
    }
  } else {
    notes.push({ action: "absent", path: TARGETS.hermesConfig });
  }

  // MCP Cleanup
  if (existsSync(TARGETS.codexConfigToml)) {
    const raw = readFileSync(TARGETS.codexConfigToml, "utf8");
    const result = stripCodexMcp(raw);
    if (result.removed) {
      writeTracked(notes, TARGETS.codexConfigToml, Buffer.from(result.text, "utf8"), dryRun);
      notes.push({ action: "unmerged", path: TARGETS.codexConfigToml, detail: "removed bahay_ni_kuya MCP server" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.codexConfigToml, detail: "no bahay_ni_kuya MCP server" });
    }
  }

  if (existsSync(TARGETS.openCodeConfig)) {
    const raw = readFileSync(TARGETS.openCodeConfig, "utf8");
    const result = stripOpenCodeMcp(raw);
    if (result.removed) {
      writeTracked(notes, TARGETS.openCodeConfig, Buffer.from(result.text, "utf8"), dryRun);
      notes.push({ action: "unmerged", path: TARGETS.openCodeConfig, detail: "removed bahay-ni-kuya MCP server" });
    } else {
      notes.push({ action: "unchanged", path: TARGETS.openCodeConfig, detail: "no bahay-ni-kuya MCP server" });
    }
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
