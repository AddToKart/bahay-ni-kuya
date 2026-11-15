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

let bgProc: ReturnType<typeof Bun.spawn> | null = null;
let latestProcs: ProcInfo[] | null = null;
let firstScanPromise: Promise<ProcInfo[] | null> | null = null;
let firstScanResolve: ((procs: ProcInfo[] | null) => void) | null = null;

function startBackgroundScanner(): void {
  const SCRIPT = [
    "$ProgressPreference='SilentlyContinue'",
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
    "while ($true) {",
    "  try {",
    "    $json = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,KernelModeTime,UserModeTime | ConvertTo-Json -Compress -Depth 2",
    "    [Console]::WriteLine('===SCAN_START===')",
    "    [Console]::WriteLine($json)",
    "    [Console]::WriteLine('===SCAN_END===')",
    "  } catch {}",
    "  Start-Sleep -Seconds 5",
    "}",
  ].join("\r\n");

  try {
    bgProc = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", SCRIPT], {
      stdout: "pipe",
      stderr: "ignore",
    });

    void (async () => {
      if (!bgProc) return;
      const reader = bgProc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inScan = false;
      let scanPayload = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx = buffer.indexOf("\n");
          while (newlineIdx !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (line === "===SCAN_START===") {
              inScan = true;
              scanPayload = "";
            } else if (line === "===SCAN_END===") {
              inScan = false;
              try {
                const text = scanPayload.replace(/^\uFEFF/, "").trim();
                if (text) {
                  const raw = JSON.parse(text);
                  const rows = Array.isArray(raw) ? raw : [raw];
                  if (rows.length >= 20) {
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
                    latestProcs = procs;
                    if (firstScanResolve) {
                      firstScanResolve(procs);
                      firstScanResolve = null;
                      firstScanPromise = null;
                    }
                  }
                }
              } catch (err) {
                log("scan: stream parse error", String(err));
              }
            } else if (inScan) {
              scanPayload += line;
            }

            newlineIdx = buffer.indexOf("\n");
          }
        }
      } catch (err) {
        log("scan: stream reader error", String(err));
      } finally {
        bgProc = null;
        setTimeout(startBackgroundScanner, 2000);
      }
    })();
  } catch (err) {
    log("scan: failed to start background powershell", String(err));
    bgProc = null;
  }
}

// Start persistent background process scanner immediately
startBackgroundScanner();

/** Full process table from the long-lived process scanner. Never treats a failure as 0 processes. */
export async function scanProcesses(): Promise<ProcInfo[] | null> {
  if (latestProcs !== null) return latestProcs;
  if (!firstScanPromise) {
    firstScanPromise = new Promise((resolve) => {
      firstScanResolve = resolve;
      setTimeout(() => {
        if (firstScanResolve) {
          firstScanResolve(latestProcs);
          firstScanResolve = null;
          firstScanPromise = null;
        }
      }, 6000);
    });
  }
  return firstScanPromise;
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
