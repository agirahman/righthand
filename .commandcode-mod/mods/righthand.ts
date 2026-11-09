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
import {join, resolve, dirname} from 'node:path';

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

export interface GuardContext {
  toolName: string;
  input: unknown;
  cwd: string;
  scratchDirs?: string[];
  persona?: string;
}

export interface GuardDecision {
  block: boolean;
  reason?: string;
}

function isInsideRoot(target: string, root: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget === resolvedRoot) return false;
  const prefix = resolvedRoot.endsWith('/') || resolvedRoot.endsWith('\\') ? resolvedRoot : resolvedRoot + '\\';
  // handle both separators
  let normalizedTarget = resolvedTarget.replace(/\//g, '\\');
  let normalizedRoot = resolvedRoot.replace(/\//g, '\\');
  if (process.platform === 'win32') {
    normalizedTarget = normalizedTarget.toLowerCase();
    normalizedRoot = normalizedRoot.toLowerCase();
  }
  const rootWithSep = normalizedRoot.endsWith('\\') ? normalizedRoot : normalizedRoot + '\\';
  return normalizedTarget.startsWith(rootWithSep);
}

function hasUnsafeTraversal(rawPath: string): boolean {
  const segments = rawPath.split(/[/\\\\]/);
  for (const seg of segments) {
    if (seg.trim() === '..') return true;
  }
  return false;
}

function allowedRighthandRoot(target: string): string | null {
  let dir = dirname(target);
  while (true) {
    if (dir.split(/[/\\]/).pop() === '.righthand') {
      const root = dirname(dir);
      if (existsSync(join(root, '.git')) || existsSync(join(root, 'package.json'))) {
        return dir;
      }
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isAllowedWritePath(target: string, scratchDirs?: string[], rawPath?: string): boolean {
  if (rawPath && hasUnsafeTraversal(rawPath)) {
    return false;
  }
  const rhDir = allowedRighthandRoot(target);
  if (rhDir) {
    const normTarget = target.replace(/\//g, '\\').toLowerCase();
    const normRh = rhDir.replace(/\//g, '\\').toLowerCase();
    const sep = '\\';
    const rootWithSep = normRh.endsWith(sep) ? normRh : normRh + sep;
    if (normTarget.startsWith(rootWithSep)) {
      return true;
    }
  }
  if (scratchDirs) {
    for (const dir of scratchDirs) {
      if (isInsideRoot(target, dir)) return true;
    }
  }
  return false;
}

const SHELL_INTERPRETERS = new Set([
  'node', 'nodejs', 'deno', 'bun', 'python', 'python3', 'py',
  'pwsh', 'powershell', 'bash', 'sh', 'zsh', 'fish',
]);

const POWERSHELL_FILE_CMDLETS = new Set([
  'set-content', 'add-content', 'clear-content', 'set-item', 'new-item', 'remove-item',
  'move-item', 'copy-item', 'rename-item', 'set-itemproperty', 'new-itemproperty',
  'remove-itemproperty', 'export-csv', 'export-clixml', 'set-acl', 'out-file',
  'tee-object', 'start-transcript', 'stop-transcript', 'compress-archive',
  'expand-archive', 'clear-recyclebin',
]);

const POWERSHELL_PATH_FLAGS = new Set([
  '-path', '-filepath', '-literalpath', '-destination', '-outfile', '-target', '-name',
]);

const POWERSHELL_VALUE_FLAGS = new Set([
  '-value', '-encoding', '-itemtype', '-type', '-inputobject', '-filter', '-include',
  '-exclude', '-stream', '-separator', '-width', '-credential', '-delimiter', '-replace',
  '-namespace', '-property', '-propertytype',
]);

const POSIX_FILE_MUTATORS = new Set([
  'rm', 'rmdir', 'rd', 'del', 'erase', 'mv', 'move', 'cp', 'copy', 'touch', 'mkdir',
  'md', 'tee', 'truncate', 'ln', 'chmod', 'chown', 'sed', 'patch',
]);

const GIT_READ_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'describe', 'rev-parse', 'rev-list', 'ls-files',
  'ls-tree', 'ls-remote', 'cat-file', 'shortlog', 'blame', 'grep', 'for-each-ref',
  'merge-base', 'name-rev', 'var', 'help', 'whatchanged', 'count-objects', 'fsck',
  'show-ref', 'show-branch', 'cherry', 'check-ignore', 'check-attr', 'check-ref-format',
  'verify-commit', 'difftool', 'mergetool', 'range-diff', 'version', 'annotate',
  'diff-tree', 'diff-index', 'diff-files',
]);

/**
 * gh commands that change shared state other work depends on: merging, closing,
 * reviewing, retargeting a PR, deleting, publishing releases or gists,
 * credentials, secrets and repo configuration. These stay blocked for readonly
 * personas.
 *
 * Content-append verbs are deliberately absent: `issue create/comment/edit` and
 * `pr create/comment` publish text to the remote but change nothing on disk and
 * nothing another lane builds on. `pr edit` is NOT in that set because it can
 * retarget the base branch, and `gist create` is NOT either because it publishes
 * local file contents.
 */
const GH_MUTATING_PATTERNS: RegExp[] = [
  /^pr\s+(merge|close|reopen|ready|lock|unlock|checkout|review|edit)\b/,
  /^issue\s+(close|reopen|delete|lock|unlock|transfer|develop)\b/,
  /^release\s+(create|delete|edit|upload)\b/,
  /^repo\s+(create|delete|edit|rename|archive|unarchive|fork|clone|sync|set-default)\b/,
  /^workflow\s+(run|enable|disable)\b/,
  /^run\s+(cancel|rerun|delete)\b/,
  /^label\s+(create|edit|delete|clone)\b/,
  /^(secret|variable)\s+(set|delete)\b/,
  /^gist\s+(create|delete|edit)\b/,
  /^auth\s+(login|logout|setup-git|refresh|token)\b/,
  /^extension\s+(install|remove|upgrade)\b/,
  /^config\s+set\b/,
];

const PACKAGE_MUTATING_SUBCOMMANDS = new Set([
  'install', 'i', 'add', 'uninstall', 'un', 'remove', 'rm', 'r', 'update', 'up',
  'upgrade', 'publish', 'unpublish', 'version', 'link', 'ci', 'dedupe', 'prune',
  'rebuild', 'pack', 'init',
]);

interface ShellRedirectScan {
  targets: string[];
  body: string;
}

type ShellVars = Map<string, string>;

function lookupShellVar(name: string, vars?: ShellVars): string | undefined {
  if (!vars) return undefined;
  if (vars.has(name)) return vars.get(name);
  const lower = name.toLowerCase();
  if (vars.has(lower)) return vars.get(lower);
  return undefined;
}

function expandShellToken(token: string, vars?: ShellVars): string {
  let value = token;
  value = value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match, name: string) => process.env[name] ?? match);
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name: string) => process.env[name] ?? match);
  const substitute = (input: string): string => input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain;
    if (!name) return match;
    const fromVars = lookupShellVar(name, vars);
    if (fromVars !== undefined) return fromVars;
    return process.env[name] ?? match;
  });
  value = substitute(value);
  // a variable whose value contains another variable or an $env: reference
  const second = substitute(value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match, name: string) => process.env[name] ?? match));
  if (second !== value) value = second;
  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
    value = join(homedir(), value.slice(1));
  }
  return value;
}

/**
 * Record simple variable assignments so a path built from a variable can still be
 * resolved when the assignment happens earlier in the same command.
 * Supports `NAME=value` (bash) and `$NAME = value` / `$NAME=value` (PowerShell).
 * Only literal values are recorded; anything unresolved stays unresolvable, which
 * keeps the guard fail-closed.
 */
function collectShellVars(segment: string, vars: ShellVars): void {
  const body = scanShellRedirects(segment).body;
  const tokens = tokenizeShellSegment(body);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const posix = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(token);
    if (posix) {
      vars.set(posix[1], expandShellToken(posix[2].replace(/^["']|["']$/g, ''), vars));
      continue;
    }
    const psInline = /^\$([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(token);
    if (psInline) {
      vars.set(psInline[1], expandShellToken(psInline[2].replace(/^["']|["']$/g, ''), vars));
      continue;
    }
    const psSpaced = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(token);
    if (psSpaced && tokens[i + 1] === '=') {
      const rawValue = (tokens[i + 2] ?? '').replace(/^["']|["']$/g, '');
      if (rawValue) vars.set(psSpaced[1], expandShellToken(rawValue, vars));
      i += 2;
    }
  }
}

function looksLikePathToken(token: string): boolean {
  if (!token || token.startsWith('-')) return false;
  if (token.startsWith('$') || token.startsWith('%')) return false;
  if (/^[A-Za-z]:[\\/]/.test(token)) return true;
  if (token.startsWith('/') || token.startsWith('\\')) return true;
  if (token.startsWith('./') || token.startsWith('../') || token.startsWith('.\\') || token.startsWith('..\\')) return true;
  if (/[\\/]/.test(token)) return true;
  return /\.(?:js|mjs|cjs|ts|mts|cts|jsx|tsx|json|py|ps1|sh|bat|cmd|rb|pl)$/i.test(token);
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r') {
      segments.push(current);
      current = '';
      continue;
    }
    if (ch === '|') {
      segments.push(current);
      current = '';
      if (command[i + 1] === '|') i++;
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      segments.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.filter((segment) => segment.trim() !== '');
}

function tokenizeShellSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function scanShellRedirects(segment: string): ShellRedirectScan {
  const chars = segment.split('');
  const targets: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch !== '>') continue;
    const next = segment[i + 1];
    if (next === '&' || next === '=') continue;
    const start = i;
    let cursor = i + 1;
    if (next === '>') cursor += 1;
    while (cursor < segment.length && /\s/.test(segment[cursor])) cursor++;
    if (cursor >= segment.length) {
      for (let k = start; k < cursor; k++) chars[k] = ' ';
      continue;
    }
    let target = '';
    if (segment[cursor] === '"' || segment[cursor] === "'") {
      const quoteChar = segment[cursor];
      cursor += 1;
      while (cursor < segment.length && segment[cursor] !== quoteChar) {
        target += segment[cursor];
        cursor++;
      }
      cursor += 1;
    } else {
      while (cursor < segment.length && !/[\s;|&]/.test(segment[cursor])) {
        target += segment[cursor];
        cursor++;
      }
    }
    targets.push(target);
    for (let k = start; k < cursor; k++) chars[k] = ' ';
    i = cursor - 1;
  }
  return {targets, body: chars.join('')};
}

function targetAllowed(rawTarget: string, cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  const expanded = expandShellToken(rawTarget.trim(), vars).replace(/^["']|["']$/g, '');
  if (!expanded) return false;
  const lower = expanded.toLowerCase();
  if (lower === 'nul' || lower === '/dev/null' || lower === '$null') return true;
  if (hasUnsafeTraversal(expanded)) return false;
  return isAllowedWritePath(resolve(cwd, expanded), scratchDirs, expanded);
}

function posixTargets(tokens: string[], command: string): string[] {
  const targets: string[] = [];
  let skipNextPositional = command === 'chmod' || command === 'chown' || command === 'sed';
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) continue;
    if (skipNextPositional) {
      skipNextPositional = false;
      continue;
    }
    targets.push(token);
  }
  return targets;
}

function powershellTargets(tokens: string[]): string[] {
  const targets: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const isSlashFlag = /^\/[A-Za-z][A-Za-z0-9-]*$/.test(token);
    if (!token.startsWith('-') && !isSlashFlag) {
      targets.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    if (POWERSHELL_PATH_FLAGS.has(lower)) {
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        targets.push(next);
        i++;
      }
      continue;
    }
    if (POWERSHELL_VALUE_FLAGS.has(lower)) {
      i++;
    }
  }
  return targets;
}

function mutationTargetsBlocked(targets: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  if (targets.length === 0) return true;
  for (const target of targets) {
    if (!targetAllowed(target, cwd, scratchDirs, vars)) return true;
  }
  return false;
}

function interpreterBlocked(command: string, args: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  const lower = args.map((arg) => arg.toLowerCase());

  if (command === 'node' || command === 'nodejs' || command === 'deno' || command === 'bun') {
    if (lower.some((arg) => arg === '-e' || arg === '--eval' || arg.startsWith('--eval='))) return true;
    if (command === 'deno' && lower[0] === 'eval') return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars);
  }

  if (command === 'python' || command === 'python3' || command === 'py') {
    if (lower.some((arg) => arg === '-c' || arg === '-m' || arg === '-')) return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars);
  }

  if (command === 'pwsh' || command === 'powershell') {
    if (lower.some((arg) => /^(-command|-c|-encodedcommand|-ec)$/.test(arg))) return true;
    const fileIndex = lower.findIndex((arg) => arg === '-file' || arg === '-f');
    if (fileIndex >= 0) {
      const target = args[fileIndex + 1];
      if (!target) return true;
      return !targetAllowed(target, cwd, scratchDirs, vars);
    }
    const script = args.find((arg) => looksLikePathToken(arg));
    if (script) return !targetAllowed(script, cwd, scratchDirs, vars);
    return true;
  }

  if (command === 'bash' || command === 'sh' || command === 'zsh' || command === 'fish') {
    if (lower.some((arg) => arg === '-c' || arg === '--command')) return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars);
  }

  return true;
}

function gitSubcommandBlocked(subcommand: string, args: string[]): boolean {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const positionals = args.filter((arg) => !arg.startsWith('-'));
  const flagMatches = (pattern: RegExp): boolean => flags.some((flag) => pattern.test(flag));

  switch (subcommand) {
    case 'branch':
      if (flagMatches(/^(-d|-D|-m|-M|-c|-C|-u|-f|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description|--create-reflog)/)) return true;
      if (positionals.length > 0 && !flagMatches(/^(-l|--list|--contains|--no-contains|--merged|--no-merged|--points-at)/)) return true;
      return false;
    case 'tag':
      if (flagMatches(/^(-a|--annotate|-d|--delete|-m|--message|-F|--file|-s|--sign|-f|--force|-u|--local-user|-e|--edit|--cleanup)/)) return true;
      if (positionals.length > 0 && !flagMatches(/^(-l|--list)/)) return true;
      return false;
    case 'worktree':
      return !(positionals.length === 0 || positionals[0].toLowerCase() === 'list');
    case 'remote':
      if (positionals.length === 0) return false;
      return !['show', 'get-url'].includes(positionals[0].toLowerCase());
    case 'stash':
      return !(positionals.length > 0 && ['list', 'show'].includes(positionals[0].toLowerCase()));
    case 'reflog':
      return !(positionals.length === 0 || ['show', 'list'].includes(positionals[0].toLowerCase()));
    case 'config':
      if (flagMatches(/^(--unset|--unset-all|--add|--replace-all|--rename-section|--remove-section)/)) return true;
      return positionals.length > 1;
    case 'submodule':
      return !(positionals.length === 0 || ['status', 'summary'].includes(positionals[0].toLowerCase()));
    case 'notes':
      return !(positionals.length === 0 || ['list', 'show'].includes(positionals[0].toLowerCase()));
    default:
      return !GIT_READ_SUBCOMMANDS.has(subcommand);
  }
}

function gitBlocked(args: string[]): boolean {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    break;
  }
  const subcommand = (args[index] || '').toLowerCase();
  if (!subcommand) return false;
  return gitSubcommandBlocked(subcommand, args.slice(index + 1));
}

function ghBlocked(args: string[]): boolean {
  const positional = args.filter((arg) => !arg.startsWith('-')).map((arg) => arg.toLowerCase()).join(' ');
  if (GH_MUTATING_PATTERNS.some((pattern) => pattern.test(positional))) return true;

  if ((args[0] || '').toLowerCase() === 'api') {
    const methodIndex = args.findIndex((arg) => /^(-X|--method)$/i.test(arg));
    if (methodIndex >= 0) {
      const method = (args[methodIndex + 1] || '').toUpperCase();
      if (method !== 'GET') return true;
    }
    if (args.some((arg) => /^--method=(?!GET$)/i.test(arg))) return true;
    if (args.some((arg) => /^(-f|--field|--raw-field|--input)$/i.test(arg))) return true;
  }

  // Everything not listed above is either read-only (`gh pr view`, `gh issue
  // list`) or content-append (`gh issue create`, `gh pr comment`). Neither can
  // mutate the working tree, so a readonly persona may run it.
  return false;
}

function packageManagerBlocked(args: string[]): boolean {
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) {
    if (['--prefix', '--dir', '-C', '-w', '--workspace'].includes(args[index])) index += 2;
    else index += 1;
  }
  const subcommand = (args[index] || '').toLowerCase();
  if (!subcommand) return false;
  return PACKAGE_MUTATING_SUBCOMMANDS.has(subcommand);
}

const SHELL_WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'nice', 'ionice', 'time',
  'timeout', 'xargs', 'start', 'cmd',
]);

function stripShellWrapper(command: string, args: string[]): string[] | null {
  if (!SHELL_WRAPPERS.has(command)) return null;

  let index = 0;
  if (command === 'cmd') {
    while (index < args.length && /^[/-][a-z]$/i.test(args[index])) index++;
    return args.slice(index);
  }
  if (command === 'timeout') {
    while (index < args.length && args[index].startsWith('-')) index++;
    if (index < args.length) index++;
    return args.slice(index);
  }
  while (index < args.length) {
    const token = args[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index++;
      continue;
    }
    if (token.startsWith('-') || token.startsWith('/')) {
      const takesValue = ['-u', '-g', '-p', '-C', '-n', '-t', '-U', '-r', '-a', '--user', '--group'].includes(token);
      index += takesValue ? 2 : 1;
      continue;
    }
    break;
  }
  return args.slice(index);
}

function commandBlocked(command: string, rawCommand: string, args: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  if (SHELL_INTERPRETERS.has(command)) return interpreterBlocked(command, args, cwd, scratchDirs, vars);
  if (command === 'git') return gitBlocked(args);
  if (command === 'gh') return ghBlocked(args);
  if (command === 'npm' || command === 'pnpm' || command === 'yarn') return packageManagerBlocked(args);

  if (command === 'sed' && !args.some((arg) => /^-i/.test(arg) || /^--in-place/.test(arg))) return false;

  if (POWERSHELL_FILE_CMDLETS.has(command)) {
    return mutationTargetsBlocked(powershellTargets([rawCommand, ...args]), cwd, scratchDirs, vars);
  }

  if (POSIX_FILE_MUTATORS.has(command)) {
    if (command === 'patch') return true;
    return mutationTargetsBlocked(posixTargets([rawCommand, ...args], command), cwd, scratchDirs, vars);
  }

  return false;
}

function shellSegmentBlocked(segment: string, cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  const redirects = scanShellRedirects(segment);
  for (const target of redirects.targets) {
    if (!targetAllowed(target, cwd, scratchDirs, vars)) return true;
  }

  const tokens = tokenizeShellSegment(redirects.body);
  let start = 0;
  while (start < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start])) start++;

  let commandTokens = tokens.slice(start);
  for (let depth = 0; commandTokens.length > 0 && depth < 8; depth++) {
    const rawCommand = commandTokens[0];
    const command = (rawCommand.split(/[\\/]/).pop() ?? rawCommand).replace(/\.exe$/i, '').toLowerCase();
    const args = commandTokens.slice(1);
    const stripped = stripShellWrapper(command, args);
    if (stripped) {
      commandTokens = stripped;
      continue;
    }
    return commandBlocked(command, rawCommand, args, cwd, scratchDirs, vars);
  }

  return false;
}

type ShellKind = 'powershell' | 'posix';

/**
 * Command substitution runs a second command inside the text of the first one.
 * The guard judges the literal tokens, so anything hidden in `$(...)` or in a
 * backtick pair would execute unexamined. Refuse it instead of trying to parse
 * it, the same way `-e`, `-c` and `--eval` are refused.
 *
 * Quoting rules differ per shell and both matter:
 * - single quotes make both forms literal everywhere
 * - POSIX escapes with a backslash, and substitutes inside double quotes
 * - PowerShell escapes with a backtick, so `` `$( `` is literal text
 */
function hasCommandSubstitution(command: string, kind: ShellKind): boolean {
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (kind === 'powershell' ? ch === '`' : ch === '\\') {
      i += 1;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') { quote = null; continue; }
    } else {
      if (ch === "'") { quote = "'"; continue; }
      if (ch === '"') { quote = '"'; continue; }
    }
    if (ch === '`') return true;
    if (ch === '$' && command[i + 1] === '(') return true;
    // POSIX process substitution, <(cmd) / >(cmd), also runs a command
    if (kind === 'posix' && (ch === '<' || ch === '>') && command[i + 1] === '(') return true;
  }
  return false;
}

function shellBlocked(command: string, cwd: string, scratchDirs?: string[], kind: ShellKind = 'posix'): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (hasCommandSubstitution(trimmed, kind)) return true;
  const vars: ShellVars = new Map();
  for (const segment of splitShellSegments(trimmed)) {
    if (shellSegmentBlocked(segment, cwd, scratchDirs, vars)) return true;
    collectShellVars(segment, vars);
  }
  return false;
}

export function evaluateToolGuard(mode: ProfileMode | null, ctx: GuardContext): GuardDecision {
  if (mode !== 'readonly') {
    return { block: false };
  }

  const toolName = ctx.toolName;
  const allowReason = (ctx.persona || 'readonly persona') + ' is readonly: writes are limited to .righthand/ and the scratchpad. Put reports under .righthand/tickets/<ID>/reports/.';

  if (toolName === 'write_file' || toolName === 'edit_file') {
    let rawPath = '';
    try {
      const input = (ctx.input && typeof ctx.input === 'object') ? (ctx.input as Record<string, unknown>) : {};
      rawPath = typeof input.file_path === 'string' ? input.file_path : (typeof input.path === 'string' ? input.path : '');
    } catch {
      return { block: true, reason: allowReason };
    }
    if (!rawPath) {
      return { block: true, reason: allowReason };
    }
    const target = resolve(ctx.cwd, rawPath);
    if (!isAllowedWritePath(target, ctx.scratchDirs, rawPath)) {
      return { block: true, reason: allowReason };
    }
    return { block: false };
  }

  const shellTools = new Set(['shell_command', 'powershell', 'bash', 'terminal']);
  if (shellTools.has(toolName)) {
    if (!ctx.input || typeof ctx.input !== 'object') {
      return { block: true, reason: allowReason };
    }
    const input = ctx.input as Record<string, unknown>;
    const rawCmd = input.command ?? input.script;
    if (typeof rawCmd !== 'string' || rawCmd.trim() === '') {
      return { block: true, reason: allowReason };
    }
    const command = rawCmd;
    // `powershell` and the default Windows shell escape with a backtick, so a
    // backtick there is not substitution. `bash`/`sh` always substitute.
    const shellKind: ShellKind = toolName === 'powershell' || (process.platform === 'win32' && toolName !== 'bash')
      ? 'powershell'
      : 'posix';
    if (shellBlocked(command, ctx.cwd, ctx.scratchDirs, shellKind)) {
      return { block: true, reason: allowReason };
    }
    return { block: false };
  }

  const safeTools = new Set(['read_file', 'grep', 'glob', 'ls', 'cat']);
  if (safeTools.has(toolName)) {
    return { block: false };
  }

  // unknown tool: fail closed if mutating fields present
  if (ctx.input && typeof ctx.input === 'object') {
    const input = ctx.input as Record<string, unknown>;
    const mutating = ['command', 'script', 'file_path', 'path', 'patch', 'content'];
    if (mutating.some((k) => k in input)) {
      return { block: true, reason: allowReason };
    }
  }

  // read-only tools untouched
  return { block: false };
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
