// Append-only audit log for every control action.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".bahay-ni-kuya");
const PATH = join(DIR, "audit.jsonl");

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED:key]"],
  [/Bearer\s+\S+/gi, "Bearer [REDACTED]"],
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED:aws]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[^-]+-----/g, "[REDACTED:private-key]"],
  [/(?<=(password|passwd|token|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, "[REDACTED:secret]"],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export interface AuditEntry {
  ts: number;
  actor: "kuya" | "house";
  action: string;
  target?: string;
  detail?: unknown;
}

export function audit(actor: AuditEntry["actor"], action: string, target?: string, detail?: unknown): void {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const entry: AuditEntry = {
      ts: Date.now(),
      actor,
      action,
      target,
      detail: detail === undefined ? undefined : redact(JSON.stringify(detail)),
    };
    appendFileSync(PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* audit must never break the house */
  }
}

export function auditTail(limit = 100): string[] {
  try {
    if (!existsSync(PATH)) return [];
    const lines = readFileSync(PATH, "utf8").trim().split("\n");
    return lines.slice(-Math.max(1, Math.min(limit, 500)));
  } catch {
    return [];
  }
}
