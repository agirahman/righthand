/**
 * Mod `righthand`: switch agent persona via `/righthand <name>`.
 * The launch flag --mod-option default= outranks the persisted state file.
 * Multi-agent orchestration engine for Herdr workspaces, adapted from Addy Osmani agent-skills architecture.
 *
 * Profiles are discovered and loaded from:
 *   1. ~/.commandcode/profiles/*.md         (global user directory)
 *   2. <project>/profiles/*.md             (repository level)
 *   3. <project>/.commandcode/profiles/*.md (project overrides)
 *
 * Profile files support YAML frontmatter (Addy Osmani specification) and legacy headers:
 *   ---
 *   name: code-reviewer
 *   role: Senior Code Reviewer
 *   description: 5-axis review
 *   mode: readonly
 *   skills: [code-review, report-and-board]
 *   output: [report, review]
 *   ---
 */

import type {ModApi} from '@commandcode/harness';
import {readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, renameSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  evaluateToolGuard,
  type ProfileMode,
  type GuardContext,
  type GuardDecision,
  type ShellKind,
  type ShellVars,
  type SubstitutionScan,
  type ShellRedirectScan,
} from '../../shared/guard';

export {
  evaluateToolGuard,
  type ProfileMode,
  type GuardContext,
  type GuardDecision,
  type ShellKind,
  type ShellVars,
  type SubstitutionScan,
  type ShellRedirectScan,
};

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

export const RETIRED_PERSONAS: string[] = ['editor'];

export interface ProfileLoadDirs {
  packageDir?: string;
  userDir?: string;
  projectDirs?: string[];
}

export function loadAllProfiles(cwd: string, dirs?: ProfileLoadDirs): Map<string, ProfileMetadata> {
  const map = new Map<string, ProfileMetadata>();

  // Resolve directories, defaulting to today's paths so existing single-arg
  // call sites keep working unchanged.
  let packageProfilesDir: string | undefined = dirs && 'packageDir' in dirs
    ? dirs.packageDir
    : undefined;
  if (packageProfilesDir === undefined) {
    try {
      if (typeof __dirname !== 'undefined') {
        packageProfilesDir = join(__dirname, '..', 'profiles');
      }
    } catch {
      // fallback if __dirname is unavailable
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

const SESSION_ENTRY_TYPE = 'righthand/persona';

interface PersistedPersonaState {
  active: string | null;
  updatedAt?: string;
}

function readStateFilePersona(cwd: string): string | null {
  const candidates = [
    join(cwd, '.righthand', 'state', 'active-persona.json'),
    join(cwd, '.righthand', 'active-persona.json'),
  ];
  for (const filePath of candidates) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedPersonaState;
      if (parsed && (typeof parsed.active === 'string' || parsed.active === null)) {
        return typeof parsed.active === 'string' ? parsed.active.trim().toLowerCase() : null;
      }
      return null;
    } catch {
      // missing or corrupt => no persona
    }
  }
  return null;
}

function writeStateFilePersona(cwd: string, active: string | null): void {
  try {
    const dir = join(cwd, '.righthand', 'state');
    mkdirSync(dir, {recursive: true});
    const target = join(dir, 'active-persona.json');
    const tmp = join(dir, `.active-persona.${process.pid}.tmp`);
    const state: PersistedPersonaState = {active, updatedAt: new Date().toISOString()};
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    renameSync(tmp, target);
  } catch {
    // ignore write failures (read-only lane checkout)
  }
}

export default function (cmd: ModApi): void {
  let activeProfile: string | null | undefined = undefined;
  let activeModeCache: {name: string | null; mode: ProfileMode | null} | undefined = undefined;

  cmd.addFlag('default', {
    type: 'string',
    default: '',
    description: 'Name of the profile automatically activated upon session startup.',
  });

  const setStatus = (text: string | null): void => {
    if (cmd.ui.capabilities?.status) {
      cmd.ui.setStatus(text);
    } else if (text) {
      cmd.ui.notify(text);
    }
  };

  const resolveActiveProfile = (): string | null => {
    if (activeProfile !== undefined) {
      return activeProfile;
    }

    // 1. Check session custom entries (persisted across session resume)
    if (cmd.session) {
      try {
        const entries = cmd.session.getCustomEntries<{persona?: string | null}>({
          customType: SESSION_ENTRY_TYPE,
        });
        if (entries && entries.length > 0) {
          const last = entries[entries.length - 1];
          if (last?.data && 'persona' in last.data) {
            activeProfile = last.data.persona ?? null;
            cmd.state?.set('activeProfile', activeProfile);
            return activeProfile;
          }
        }
      } catch {}
    }

    // 2. Check mod state in host memory (retained across /reload within same process)
    const stateVal = cmd.state?.get<string | null>('activeProfile');
    if (typeof stateVal === 'string' || stateVal === null) {
      activeProfile = stateVal;
      return activeProfile;
    }

    // 3. --mod-option default= is an explicit per-launch instruction from the dispatcher
    const def = cmd.getFlag('default');
    if (typeof def === 'string' && def.trim()) {
      const defProfile = def.trim().toLowerCase();
      activeProfile = defProfile;
      cmd.state?.set('activeProfile', defProfile);
      return activeProfile;
    }

    // 4. State file written by the CLI (righthand switch / off)
    const stateFilePath = join(cmd.cwd, '.righthand', 'state', 'active-persona.json');
    const legacyStatePath = join(cmd.cwd, '.righthand', 'active-persona.json');
    if (existsSync(stateFilePath) || existsSync(legacyStatePath)) {
      const filePersona = readStateFilePersona(cmd.cwd);
      activeProfile = filePersona;
      return activeProfile;
    }

    // 5. No persona
    activeProfile = null;
    return null;
  };

  const getActiveMode = (): ProfileMode | null => {
    const currentName = resolveActiveProfile();
    if (activeModeCache && activeModeCache.name === currentName) {
      return activeModeCache.mode;
    }
    let mode: ProfileMode | null = null;
    if (currentName) {
      const profiles = loadAllProfiles(cmd.cwd);
      const p = profiles.get(currentName);
      if (p) mode = p.mode;
    }
    activeModeCache = {name: currentName, mode};
    return mode;
  };

  const activate = (name: string): ProfileMetadata | undefined => {
    const profiles = loadAllProfiles(cmd.cwd);
    const target = profiles.get(name.toLowerCase());
    if (!target) return undefined;
    activeProfile = target.name;
    activeModeCache = undefined;
    cmd.state?.set('activeProfile', target.name);
    cmd.session?.appendCustomEntry({
      customType: SESSION_ENTRY_TYPE,
      data: {persona: target.name},
    });
    writeStateFilePersona(cmd.cwd, target.name);
    setStatus(`righthand: ${target.label} [${target.mode}]`);
    return target;
  };

  const deactivate = (): void => {
    activeProfile = null;
    activeModeCache = undefined;
    cmd.state?.set('activeProfile', null);
    cmd.session?.appendCustomEntry({
      customType: SESSION_ENTRY_TYPE,
      data: {persona: null},
    });
    writeStateFilePersona(cmd.cwd, null);
    setStatus(null);
  };

  const syncState = (): void => {
    activeProfile = undefined;
    activeModeCache = undefined;
    const name = resolveActiveProfile();
    if (name) {
      const profile = loadAllProfiles(cmd.cwd).get(name);
      if (profile) {
        setStatus(`righthand: ${profile.label} [${profile.mode}]`);
      } else {
        setStatus(null);
      }
    } else {
      setStatus(null);
    }
  };

  cmd.hooks({
    onSessionStart: () => {
      syncState();
    },
    beforeToolCall: ({toolName, input}) => {
      try {
        const currentName = resolveActiveProfile();
        const mode = getActiveMode();
        const scratchDirs = process.env.COMMANDCODE_SCRATCHPAD
          ? [process.env.COMMANDCODE_SCRATCHPAD]
          : [];
        const decision = evaluateToolGuard(mode, {
          toolName,
          input,
          cwd: cmd.cwd,
          scratchDirs,
          persona: currentName || undefined,
        });
        if (decision.block) {
          return {block: true, additionalContext: decision.reason};
        }
        return undefined;
      } catch {
        return {block: true, additionalContext: 'Blocked: the readonly guard failed to evaluate this call.'};
      }
    },
    appendSystemPrompt: () => {
      const currentName = resolveActiveProfile();
      if (!currentName) return undefined;
      const profiles = loadAllProfiles(cmd.cwd);
      const current = profiles.get(currentName);
      if (!current) return undefined;
      return `## Active RightHand persona: ${current.label} (${current.mode})\nHerdr Tab: ${current.name}\n\n${current.body}`;
    },
  });

  const commandHandler = async ({args}: {args: string}) => {
    const arg = args.trim().toLowerCase();
    const profiles = loadAllProfiles(cmd.cwd);
    const currentName = resolveActiveProfile();

    // Interactive pick
    if (!arg || arg === 'pick') {
      const sorted = [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
      const picked = await cmd.ui.select({
        title: 'Select RightHand Agent Persona',
        options: sorted.map((p) => {
          const activePrefix = p.name === currentName ? '[ACTIVE] ' : '';
          const modeBadge = `[${p.mode.toUpperCase()}]`;
          return {
            label: p.name,
            description: `${activePrefix}${modeBadge} ${p.role}: ${p.desc || p.label}`,
          };
        }),
      });

      if (!picked) {
        return {
          message: 'No persona selected. Run `/righthand list` to view all personas with full descriptions.',
        };
      }

      const profile = activate(picked);
      return {
        message: profile
          ? `Active persona: ${profile.label} [${profile.mode}] (Herdr tab: ${profile.name})`
          : `Persona "${picked}" not found.`,
      };
    }

    // List profiles
    if (arg === 'list') {
      if (profiles.size === 0) {
        return {
          message: 'No personas found. Place persona markdown files in ./profiles/*.md or ~/.commandcode/profiles/*.md',
        };
      }

      const cards = [...profiles.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => {
          const isCurrent = p.name === currentName;
          const marker = isCurrent ? '▶ ' : '• ';
          const status = isCurrent ? ' [ACTIVE]' : '';
          const mode = `[${p.mode.toUpperCase()}]`;
          const header = `${marker}${p.name} ${mode} — ${p.role}${status}`;
          const desc = `    Role & Purpose: ${p.desc || p.label}`;
           const tab = `    Herdr Tab: ${p.name}`;
          return `${header}\n${desc}\n${tab}`;
        });

      return {
        message: [
          'RightHand Specialist Personas (Herdr Multi-Agent Team):',
          '========================================================',
          '',
          cards.join('\n\n'),
          '',
          '--------------------------------------------------------',
          'Usage: /righthand <name>  |  /righthand off  |  /righthand pick  |  /righthand list',
        ].join('\n'),
      };
    }

    // Turn off profile
    if (arg === 'off' || arg === 'default') {
      deactivate();
      return {message: 'Persona deactivated — restored default agent behavior.'};
    }

    // Activate specific profile
    const profile = activate(arg);
    if (profile) {
      return {
          message: `Active persona: ${profile.label} [${profile.mode}] (Herdr tab: ${profile.name})`,
      };
    }

    const available = [...profiles.keys()].sort().join(', ');
    return {
      message: available
        ? `Persona "${arg}" not found. Available options: ${available}`
        : 'No personas available.',
    };
  };

  cmd.addCommand({
    name: 'righthand',
    description: 'Switch specialist agent persona in Herdr multi-agent team',
    argumentHint: '[name|pick|list|off]',
    handler: commandHandler,
  });

  cmd.on('session_start', () => {
    syncState();
  });

  // Run immediately on load / reload
  syncState();
}
