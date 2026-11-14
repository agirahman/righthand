import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PersistedPersonaState { active: string | null; updatedAt?: string; }

export function getStatePath(cwd: string): string {
  return join(cwd, '.righthand', 'state', 'active-persona.json');
}

export function readActivePersona(cwd: string): string | null {
  const canonicalPath = getStatePath(cwd);
  const legacyPath = join(cwd, '.righthand', 'active-persona.json');
  const path = existsSync(canonicalPath) ? canonicalPath : legacyPath;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedPersonaState;
    if (parsed && (typeof parsed.active === 'string' || parsed.active === null)) {
      return typeof parsed.active === 'string' ? parsed.active.trim().toLowerCase() : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeActivePersona(cwd: string, persona: string | null): void {
  let tempPath: string | undefined;
  try {
    const dir = join(cwd, '.righthand', 'state');
    mkdirSync(dir, { recursive: true });
    const target = getStatePath(cwd);
    tempPath = join(dir, `.active-persona.${process.pid}.tmp`);
    const state: PersistedPersonaState = { active: persona, updatedAt: new Date().toISOString() };
    writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n');
    renameSync(tempPath, target);
  } catch {
    if (tempPath) {
      try {
        unlinkSync(tempPath);
      } catch {}
    }
  }
}
