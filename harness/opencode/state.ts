import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export interface OpenCodeSessionEntry {
  persona: string;
  updated: number;
}

export interface OpenCodeState {
  version: 1;
  sessions: Record<string, OpenCodeSessionEntry>;
}

const statePath = join(homedir(), ".local", "state", "opencode", "righthand.json");

export function loadSessionState(): OpenCodeState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      version: 1,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    return { version: 1, sessions: {} };
  }
}

export function saveSessionState(state: OpenCodeState): void {
  const now = Date.now();
  const sessions: OpenCodeState["sessions"] = {};
  for (const [id, entry] of Object.entries(state.sessions)) {
    if (!entry.persona || now - (entry.updated ?? 0) > MAX_AGE) continue;
    sessions[id] = entry;
  }

  const directory = dirname(statePath);
  const tempPath = join(directory, `.righthand.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(tempPath, JSON.stringify({ version: 1, sessions }, null, 2), "utf8");
    renameSync(tempPath, statePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {}
    throw error;
  }
}
