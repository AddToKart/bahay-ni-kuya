// Security, Bearer Token management, and Host/Origin validation for Bahay ni Kuya

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import runnersConfig from "../config/runners.json";

let cachedToken: string | null = null;

export function getTokenPath(): string {
  const dir = join(homedir(), ".bahay-ni-kuya");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "token");
}

export function getOrCreateToken(): string {
  if (cachedToken) return cachedToken;
  const path = getTokenPath();
  if (existsSync(path)) {
    cachedToken = readFileSync(path, "utf-8").trim();
    if (cachedToken.length > 0) return cachedToken;
  }
  // Generate cryptographically strong 32-byte hex token
  const token = randomBytes(32).toString("hex");
  writeFileSync(path, token, { encoding: "utf-8", mode: 0o600 });
  cachedToken = token;
  return cachedToken;
}

/** Reject requests whose Host or Origin is not localhost / 127.0.0.1 */
export function isAllowedHostAndOrigin(req: Request): boolean {
  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin");

  // Validate Host: must be localhost or 127.0.0.1 with optional port
  const hostPattern = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (!hostPattern.test(host)) {
    return false;
  }

  // If Origin is present (e.g. cross-origin/CORS check), it must be localhost or 127.0.0.1
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/** Authenticate Bearer token from Authorization header */
export function isAuthenticated(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  const expected = getOrCreateToken();
  return token.length > 0 && token === expected;
}

export function getAllowlistedRoots(): string[] {
  const configured = (runnersConfig as { allowlistedRoots?: string[] }).allowlistedRoots ?? [];
  const roots = configured.length > 0 ? configured : [process.cwd()];
  return roots.map((r) => r.replace(/\\/g, "/"));
}

export function validateCwd(rawCwd?: string): { ok: boolean; path?: string; error?: string } {
  if (!rawCwd) {
    return { ok: true, path: process.cwd().replace(/\\/g, "/") };
  }
  try {
    const normalized = resolve(rawCwd).replace(/\\/g, "/");
    if (!existsSync(normalized)) {
      return { ok: false, error: `Directory does not exist: ${rawCwd}` };
    }
    const real = realpathSync(normalized).replace(/\\/g, "/");
    const roots = getAllowlistedRoots();
    const isAllowed = roots.some(
      (root) => real.toLowerCase() === root.toLowerCase() || real.toLowerCase().startsWith(root.toLowerCase() + "/"),
    );
    if (!isAllowed) {
      return { ok: false, error: `Directory is not inside allowlisted roots: ${rawCwd}` };
    }
    return { ok: true, path: real };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
