import { HARNESSES, type Harness } from "./types";
import { log } from "./log";

export interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
  cmd: string;
  cpuMs: number;
  working?: boolean;
}

const PS_SCRIPT = [
  "$ProgressPreference='SilentlyContinue'",
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,KernelModeTime,UserModeTime | ConvertTo-Json -Compress -Depth 2",
].join("; ");

const BIN: Record<Harness, string> = {
  opencode: "opencode",
  codex: "codex",
  pi: "pi",
  omp: "omp",
  hermes: "hermes",
};

const word = (needle: string) => new RegExp(`(^|[\\\\/"'\\s])${needle}(\\.cmd|\\.exe)?(["'\\s]|$)`, "i");

const MATCHERS: Record<Harness, (p: ProcInfo) => boolean> = {
  opencode: (p) =>
    p.name.toLowerCase() === "opencode.exe" ||
    word("opencode").test(p.cmd) ||
    /[\\/]opencode[\\/]bin[\\/]opencode/i.test(p.cmd),
  codex: (p) =>
    p.name.toLowerCase() === "codex.exe" ||
    word("codex").test(p.name + " " + p.cmd) ||
    /[\\/]codex[\\/]bin[\\/]codex/i.test(p.cmd),
  pi: (p) =>
    p.name.toLowerCase() === "pi.exe" ||
    /pi-coding-agent/i.test(p.cmd) ||
    word("pi").test(p.cmd),
  omp: (p) =>
    p.name.toLowerCase() === "omp.exe" ||
    /oh-my-pi/i.test(p.cmd) ||
    word("omp").test(p.cmd),
  hermes: (p) =>
    /hermes/i.test(p.name) ||
    word("hermes").test(p.cmd + " " + p.name) ||
    /AppData[\\/]Local[\\/]hermes/i.test(p.cmd),
};

export function matchHarness(p: ProcInfo): Harness | null {
  if (p.pid === process.pid) return null;
  if (p.cmd.includes("bahay-ni-kuya-fixture")) return null;
  for (const harness of HARNESSES) if (MATCHERS[harness](p)) return harness;
  return null;
}

function spawnPowershell() {
  try {
    return Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    log("scan: could not spawn powershell", String(err));
    return null;
  }
}

/** Full process table or null on failure. A partial/failed scan must never look like "no processes". */
export async function scanProcesses(): Promise<ProcInfo[] | null> {
  const proc = spawnPowershell();
  if (!proc) return null;

  const killTimer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }, 12_000);

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      log("scan: powershell failed", { code, stderr: stderr.slice(0, 300) });
      return null;
    }
    const text = stdout.replace(/^\uFEFF/, "").trim();
    const raw = JSON.parse(text || "[]");
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length < 20) {
      log("scan: implausibly small process table; keeping previous state", { rows: rows.length });
      return null;
    }
    const procs: ProcInfo[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || typeof row.ProcessId !== "number") continue;
      procs.push({
        pid: row.ProcessId,
        ppid: Number(row.ParentProcessId ?? 0),
        name: String(row.Name ?? ""),
        cmd: String(row.CommandLine ?? ""),
        cpuMs: (Number(row.KernelModeTime ?? 0) + Number(row.UserModeTime ?? 0)) / 10_000,
      });
    }
    return procs;
  } catch (err) {
    log("scan: parse/enumeration failed", String(err));
    return null;
  } finally {
    clearTimeout(killTimer);
  }
}

export async function checkInstalled(): Promise<Record<Harness, boolean>> {
  const pairs = await Promise.all(
    HARNESSES.map(async (harness) => {
      try {
        const proc = Bun.spawn(["where.exe", BIN[harness]], { stdout: "pipe", stderr: "pipe" });
        const timer = setTimeout(() => {
          try {
            proc.kill();
          } catch {
            /* already gone */
          }
        }, 5_000);
        const code = await proc.exited;
        clearTimeout(timer);
        return [harness, code === 0] as const;
      } catch {
        return [harness, false] as const;
      }
    }),
  );
  return Object.fromEntries(pairs) as Record<Harness, boolean>;
}
