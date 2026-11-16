// Windows-first process helpers. The house never leaves orphaned harness processes.
import { spawnSync } from "node:child_process";

/** Kill a process and every descendant. Returns true when the parent is gone afterwards. */
export function killTree(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    const result = spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], {
      windowsHide: true,
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
