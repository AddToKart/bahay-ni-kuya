// House record management for Bahay ni Kuya
// Persists to ~/.bahay-ni-kuya/houses.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export interface HouseRecord {
  id: string;        // nanoid-style: "house_" + 8 hex chars
  label: string;     // basename of root folder (e.g. "pixel-office")
  root: string;      // absolute path, forward slashes
  createdAt: number; // Date.now()
}

// Always includes global:
export const GLOBAL_HOUSE: HouseRecord = {
  id: "global",
  label: "🌐 Global",
  root: "",
  createdAt: 0,
};

export class Houses {
  private records: HouseRecord[] = [];
  private path: string; // ~/.bahay-ni-kuya/houses.json

  constructor() {
    const dir = join(homedir(), ".bahay-ni-kuya");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.path = join(dir, "houses.json");
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.path)) {
        const raw = readFileSync(this.path, "utf-8").trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.records = parsed as HouseRecord[];
          }
        }
      }
    } catch {
      // Corrupt or missing file: start fresh
      this.records = [];
    }
  }

  private save(): void {
    try {
      writeFileSync(this.path, JSON.stringify(this.records, null, 2) + "\n", {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {
      // best effort
    }
  }

  list(): HouseRecord[] {
    return [GLOBAL_HOUSE, ...this.records];
  }

  create(root: string): HouseRecord {
    // Validate root is a real directory
    const normalized = resolve(root).replace(/\\/g, "/");
    if (!existsSync(normalized)) {
      throw new Error(`Directory does not exist: ${root}`);
    }

    // Check not duplicate
    const existing = this.records.find(
      (r) => r.root.toLowerCase() === normalized.toLowerCase(),
    );
    if (existing) {
      throw new Error(`House already exists for: ${root}`);
    }

    const id = "house_" + randomBytes(4).toString("hex");
    const label = basename(normalized) || normalized;
    const rec: HouseRecord = {
      id,
      label,
      root: normalized,
      createdAt: Date.now(),
    };
    this.records.push(rec);
    this.save();
    return rec;
  }

  close(id: string): boolean {
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.records.splice(idx, 1);
    this.save();
    return true;
  }

  get(id: string): HouseRecord | undefined {
    if (id === "global") return GLOBAL_HOUSE;
    return this.records.find((r) => r.id === id);
  }
}
