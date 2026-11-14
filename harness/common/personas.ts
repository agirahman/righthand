import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getRepoRoot } from './repo-root.js';

export const RETIRED_PERSONAS: string[] = ['editor'];

export type ProfileMode = 'writer' | 'readonly';

export interface ProfileMetadata {
  name: string;
  label: string;
  role: string;
  desc: string;
  mode: ProfileMode;
  skills: string[];
  output: string[];
  body: string;
  sourcePath: string;
}

export interface PersonaMetadata {
  name: string;
  role: string;
  mode: ProfileMode;
  desc: string;
  skills: string[];
  output: string[];
  body: string;
}

export interface ProfileLoadDirs {
  packageDir?: string;
  userDir?: string;
  projectDirs?: string[];
}

export function parseProfileFile(filePath: string, fallbackName: string): ProfileMetadata | undefined {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }

  let name = fallbackName;
  let label = fallbackName;
  let role = fallbackName;
  let desc = '';
  let mode: ProfileMode = 'readonly';
  let skills: string[] = [];
  let output: string[] = [];
  let body = raw.trim();

  // Parse YAML Frontmatter if present
  const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (frontmatterMatch) {
    const fmLines = frontmatterMatch[1].split(/\r?\n/);
    body = frontmatterMatch[2].trim();

    for (const line of fmLines) {
      const match = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1].toLowerCase();
      const val = match[2].trim().replace(/^['"](.*)['"]$/, '$1');

      if (key === 'name') name = val;
      if (key === 'role') role = val;
      if (key === 'description' || key === 'desc') desc = val;
      if (key === 'mode') mode = val.toLowerCase() === 'writer' ? 'writer' : 'readonly';
      if (key === 'skills' || key === 'output') {
        const stripped = val.replace(/^\[/, '').replace(/\]$/, '').trim();
        const parsed = stripped === '' ? [] : stripped.split(',').map((s) => s.trim().replace(/^['"](.*)['"]$/, '$1')).filter(Boolean);
        if (key === 'skills') skills = parsed;
        else output = parsed;
      }
    }
    label = role || name;
  }

  // Fallback parsing (when frontmatter is missing)
  const lines = raw.split(/\r?\n/);
  if (!label || label === fallbackName) {
    for (const line of lines) {
      const m = /^#\s+(.+)$/.exec(line);
      if (m) {
        label = m[1].trim();
        if (!role || role === fallbackName) role = label;
        break;
      }
    }
  }

  if (!desc) {
    for (const line of lines) {
      const m = /^>\s*(.+)$/.exec(line);
      if (m) {
        desc = m[1].trim();
        break;
      }
    }
  }

  if (!frontmatterMatch) {
    for (const line of lines) {
      const m = /^mode:\s*(writer|readonly)\s*$/i.exec(line);
      if (m) {
        mode = m[1].toLowerCase() as ProfileMode;
        break;
      }
    }
  }

  return {
    name: name.toLowerCase(),
    label,
    role,
    desc,
    mode,
    skills,
    output,
    body,
    sourcePath: filePath,
  };
}

export function loadAllProfiles(cwd: string, dirs?: ProfileLoadDirs): Map<string, ProfileMetadata> {
  const map = new Map<string, ProfileMetadata>();

  // Resolve directories, defaulting to today's paths so existing single-arg
  // call sites keep working unchanged.
  let packageProfilesDir: string | undefined = dirs && 'packageDir' in dirs
    ? dirs.packageDir
    : undefined;
  if (packageProfilesDir === undefined) {
    // The default must resolve to the package root's profiles/ from any compiled location.
    try {
      packageProfilesDir = join(getRepoRoot(), 'profiles');
    } catch {
      // fallback if the package root cannot be resolved
    }
  }

  const userDir: string = (dirs && 'userDir' in dirs && dirs.userDir !== undefined)
    ? dirs.userDir
    : join(homedir(), '.commandcode', 'profiles');

  const projectDirs: string[] = (dirs && Array.isArray(dirs.projectDirs))
    ? dirs.projectDirs
    : [join(cwd, 'profiles'), join(cwd, '.commandcode', 'profiles')];

  const retired = new Set(RETIRED_PERSONAS.map((n) => n.toLowerCase()));

  // Determine shipped names from the package dir first, so a legacy
  // user-level copy of a shipped name can never shadow it.
  // If the package directory is missing or unreadable, shippedNames stays
  // empty: no persona silently becomes a shipped name, and a legacy file
  // may then load as a custom persona (documented fallback).
  const shippedNames = new Set<string>();
  if (packageProfilesDir) {
    try {
      for (const file of readdirSync(packageProfilesDir)) {
        if (!file.endsWith('.md') || file.startsWith('.')) continue;
        shippedNames.add(file.slice(0, -3).toLowerCase());
      }
    } catch {
      // package dir missing or unreadable: no shipped names
    }
  }

  // 1. Package profiles are authoritative.
  if (packageProfilesDir) {
    let files: string[] = [];
    try {
      files = readdirSync(packageProfilesDir);
    } catch {
      files = [];
    }
    for (const file of files) {
      if (!file.endsWith('.md') || file.startsWith('.')) continue;
      const fallbackName = file.slice(0, -3).toLowerCase();
      const profile = parseProfileFile(join(packageProfilesDir, file), fallbackName);
      if (profile) {
        shippedNames.add(profile.name);
        map.set(profile.name, profile);
      }
    }
  }

  // 2. Legacy user dir: custom personas only. Retired and shipped names skip.
  try {
    for (const file of readdirSync(userDir)) {
      if (!file.endsWith('.md') || file.startsWith('.')) continue;
      const fallbackName = file.slice(0, -3).toLowerCase();
      if (retired.has(fallbackName)) continue;
      if (shippedNames.has(fallbackName)) continue;
      const profile = parseProfileFile(join(userDir, file), fallbackName);
      if (profile) {
        // shipped name guard by resolved name too
        if (retired.has(profile.name) || shippedNames.has(profile.name)) continue;
        if (map.has(profile.name)) continue;
        map.set(profile.name, profile);
      }
    }
  } catch {
    // user dir missing
  }

  // 3. Project-level dirs override everything, later wins.
  for (const dir of projectDirs) {
    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md') || file.startsWith('.')) continue;
      const fallbackName = file.slice(0, -3).toLowerCase();
      const profile = parseProfileFile(join(dir, file), fallbackName);
      if (profile) {
        map.set(profile.name, profile);
      }
    }
  }

  return map;
}

export function loadAllPersonas(cwd: string, dirs?: ProfileLoadDirs): Map<string, PersonaMetadata> {
  const profiles = loadAllProfiles(cwd, dirs);
  const personas = new Map<string, PersonaMetadata>();
  for (const [name, profile] of profiles) {
    personas.set(name, {
      name: profile.name,
      role: profile.role,
      mode: profile.mode,
      desc: profile.desc,
      skills: profile.skills,
      output: profile.output,
      body: profile.body,
    });
  }
  return personas;
}
