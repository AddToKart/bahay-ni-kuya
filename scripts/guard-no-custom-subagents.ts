// Rule 11 guard: the house must never create or fake subagents.
//
// Fails when source outside the housemate-summon path:
//  1. creates a session with a parent/parentID argument (a house-made child session), or
//  2. spawns a harness binary for helper purposes.
//
// `scripts/fake-events.ts` is exempt: it is an external demo player that only POSTs observation
// events; it creates no sessions and spawns no processes. Tests are not scanned.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_FILES: Record<string, true> = {
  "scripts/fake-events.ts": true,
  "scripts/guard-no-custom-subagents.ts": true,
};
const SPAWN_ALLOWED: Record<string, true> = {
  "src/opencode-supervisor.ts": true,
  "src/housemates.ts": true,
  "src/procutil.ts": true,
};
const HARNESS_BINS = ["opencode", "codex", "pi", "omp", "hermes"];

export interface GuardViolation {
  file: string;
  line: number;
  rule: "parented-session-create" | "harness-process-spawn";
  excerpt: string;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

export function scanForCustomSubagents(root = process.cwd()): GuardViolation[] {
  const files = [
    ...walk(join(root, "src")),
    ...walk(join(root, "public")),
    ...walk(join(root, "scripts")),
  ].filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));

  const violations: GuardViolation[] = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, "/");
    if (SKIP_FILES[rel] === true) continue;
    const text = readFileSync(file, "utf8");

    // A session create call carrying a parent argument anywhere in the call.
    const createPattern = /(createSession|create_session|session\.create|\.createSession)\s*\(/g;
    for (let match = createPattern.exec(text); match; match = createPattern.exec(text)) {
      const window = text.slice(match.index, match.index + 500);
      if (/parent/i.test(window)) {
        violations.push({
          file: rel,
          line: lineOf(text, match.index),
          rule: "parented-session-create",
          excerpt: window.split("\n")[0].slice(0, 120),
        });
      }
    }

    // Spawning a harness binary outside the supervisor/summon path.
    if (SPAWN_ALLOWED[rel] !== true) {
      for (const bin of HARNESS_BINS) {
        const pattern = new RegExp(`(spawn|spawnSync|Bun\\.spawn)\\s*\\([^)]*["'\\\`]${bin}([\\.\\\\/]|["'\\\`])`, "i");
        const found = pattern.exec(text);
        if (found) {
          violations.push({
            file: rel,
            line: lineOf(text, found.index),
            rule: "harness-process-spawn",
            excerpt: found[0].split("\n")[0].slice(0, 120),
          });
        }
      }
    }
  }
  return violations;
}

function main(): void {
  const violations = scanForCustomSubagents();
  if (violations.length > 0) {
    console.error(`FAIL: ${violations.length} Rule 11 violation(s):`);
    for (const v of violations) console.error(`  - [${v.rule}] ${v.file}:${v.line} ${v.excerpt}`);
    process.exit(1);
  }
  console.log("guard-no-custom-subagents OK");
}

if (import.meta.main) main();
