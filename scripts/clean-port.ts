// Helper to clean up any process listening on port 4777 or any orphaned opencode server
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.BAHAY_NI_KUYA_PORT ?? 4777);
console.log(`[clean-port] Checking port ${PORT}...`);

// 1. Clean up managed opencode supervisor state if present
const statePath = join(homedir(), ".bahay-ni-kuya", "opencode-state.json");
if (existsSync(statePath)) {
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.pid && Number.isFinite(state.pid)) {
      console.log(`[clean-port] Terminating managed opencode server (PID ${state.pid})...`);
      spawnSync("taskkill", ["/T", "/F", "/PID", String(state.pid)], { stdio: "ignore" });
    }
  } catch {}
  rmSync(statePath, { force: true });
}

// 2. Clean up any process listening on port 4777
try {
  const proc = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
  ]);
  const pid = proc.stdout.toString().trim();
  if (pid && Number(pid) > 0) {
    console.log(`[clean-port] Terminating process holding port ${PORT} (PID ${pid})...`);
    spawnSync("taskkill", ["/T", "/F", "/PID", pid], { stdio: "inherit" });
    // Also clean up any child opencode instances that might inherit socket handles on Windows
    spawnSync("taskkill", ["/F", "/IM", "opencode.exe"], { stdio: "ignore" });
    console.log(`[clean-port] Port ${PORT} released.`);
  } else {
    // Check if opencode.exe is lingering
    spawnSync("taskkill", ["/F", "/IM", "opencode.exe"], { stdio: "ignore" });
    console.log(`[clean-port] Port ${PORT} is already free.`);
  }
} catch (err) {
  console.error("[clean-port] Failed to check port:", err);
}
