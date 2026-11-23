// GENERATED FILE - do not edit.
// Source: harness/opencode/tui.tsx
// Regenerate: node scripts/bundle-harness.js
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { Show, createMemo } from "solid-js";
import { existsSync, readFileSync, readdirSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
function getRepoRoot() {
    try {
        if (typeof __dirname !== 'undefined') {
            let directory = resolve(__dirname);
            for (let depth = 0; depth < 10; depth++) {
                if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'profiles'))) {
                    return directory;
                }
                const parent = dirname(directory);
                if (parent === directory)
                    break;
                directory = parent;
            }
            return resolve(__dirname, '../..');
        }
    }
    catch { }
    return process.cwd();
}
// harness/common/aliases.ts
// v2 bounded-contract engine, Fase 1: the persona alias layer.
//
// The six canonical personas are named by hand anatomy: one palm plus five
// fingers. Each anatomy name stands for a role (palm = steer, index = point,
// pinky = scan, thumb = build, ring = shape, middle = guard). This module maps
// the legacy shipped personas, the old verb role-words, and common SDLC words
// onto those six anatomy names. Pure data plus a pure resolver.
// The six canonical personas, named by hand anatomy.
const CANONICAL_PERSONAS = [
    'palm', // the palm - chairs the loop, integrates findings, owns release
    'index', // points - sets direction: requirements, architecture, planning
    'pinky', // scouts - reads: explore, research, debug, triage
    'thumb', // builds - writes: implement, refactor, fix, deploy
    'ring', // shapes - crafts the interface: frontend, design
    'middle', // guards - verifies: review, security, test, qa
];
// The eleven shipped personas this layer supersedes. They stay loadable until
// the retirement step lands; their names always resolve onto a canonical one.
const LEGACY_PERSONAS = [
    'architect',
    'backend',
    'code-reviewer',
    'devops',
    'frontend',
    'orchestrator',
    'product-manager',
    'security-auditor',
    'test-engineer',
    'web-performance-auditor',
    'worker',
];
// Alias table: the eleven legacy names, the six old verb role-words, and common
// SDLC words, each mapped to exactly one canonical (anatomy) persona. Keys are
// lowercased; every value is a member of CANONICAL_PERSONAS.
const PERSONA_ALIASES = {
    // palm (steers the loop)
    orchestrator: 'palm',
    'product-manager': 'palm',
    pm: 'palm',
    steer: 'palm',
    // index (sets direction)
    architect: 'index',
    planner: 'index',
    point: 'index',
    // pinky (reads + triages)
    explorer: 'pinky',
    researcher: 'pinky',
    debugger: 'pinky',
    'web-performance-auditor': 'pinky',
    scan: 'pinky',
    // thumb (writes)
    backend: 'thumb',
    devops: 'thumb',
    worker: 'thumb',
    coder: 'thumb',
    refactorer: 'thumb',
    fixer: 'thumb',
    build: 'thumb',
    // ring (UI)
    frontend: 'ring',
    designer: 'ring',
    shape: 'ring',
    // middle (verifies)
    'code-reviewer': 'middle',
    'security-auditor': 'middle',
    'test-engineer': 'middle',
    reviewer: 'middle',
    qa: 'middle',
    security: 'middle',
    guard: 'middle',
};
// Resolve a raw persona reference onto its canonical v2 anatomy persona.
// - a canonical name resolves to itself (aliasedFrom is null);
// - a known alias (legacy name, verb role-word, or SDLC word) resolves to its
//   canonical target;
// - any other name passes through unchanged (it is not an alias).
function resolvePersonaName(raw) {
    const name = raw.trim().toLowerCase();
    if (CANONICAL_PERSONAS.includes(name)) {
        return { canonical: name, aliasedFrom: null };
    }
    const target = PERSONA_ALIASES[name];
    if (target) {
        return { canonical: target, aliasedFrom: name };
    }
    return { canonical: name, aliasedFrom: null };
}
const RETIRED_PERSONAS = ['editor', 'architect', 'backend', 'code-reviewer', 'devops', 'frontend', 'orchestrator', 'product-manager', 'security-auditor', 'test-engineer', 'web-performance-auditor', 'worker'];
// A profile map that also answers legacy and role-word persona names.
// A retired name such as 'architect' or 'backend' still finds its canonical
// anatomy persona, so a stale config, a stale state file, or a habit typed at
// the command line keeps working after the eleven were folded into six.
// Iteration, keys(), size and has() stay exactly the canonical set, so lists,
// completion, and 'unknown persona' checks never see an alias as a persona.
class AliasAwareMap extends Map {
    get(key) {
        const direct = super.get(key);
        if (direct !== undefined)
            return direct;
        if (typeof key !== 'string' || key === '')
            return undefined;
        const canonical = resolvePersonaName(key).canonical;
        if (canonical === key)
            return undefined;
        return super.get(canonical);
    }
}
function parseProfileFile(filePath, fallbackName) {
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch {
        return undefined;
    }
    let name = fallbackName;
    let label = fallbackName;
    let role = fallbackName;
    let desc = '';
    let mode = 'readonly';
    let skills = [];
    let output = [];
    let body = raw.trim();
    // Parse YAML Frontmatter if present
    const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (frontmatterMatch) {
        const fmLines = frontmatterMatch[1].split(/\r?\n/);
        body = frontmatterMatch[2].trim();
        for (const line of fmLines) {
            const match = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
            if (!match)
                continue;
            const key = match[1].toLowerCase();
            const val = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
            if (key === 'name')
                name = val;
            if (key === 'role')
                role = val;
            if (key === 'description' || key === 'desc')
                desc = val;
            if (key === 'mode')
                mode = val.toLowerCase() === 'writer' ? 'writer' : 'readonly';
            if (key === 'skills' || key === 'output') {
                const stripped = val.replace(/^\[/, '').replace(/\]$/, '').trim();
                const parsed = stripped === '' ? [] : stripped.split(',').map((s) => s.trim().replace(/^['"](.*)['"]$/, '$1')).filter(Boolean);
                if (key === 'skills')
                    skills = parsed;
                else
                    output = parsed;
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
                if (!role || role === fallbackName)
                    role = label;
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
                mode = m[1].toLowerCase();
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
function loadAllProfiles(cwd, dirs) {
    const map = new AliasAwareMap();
    // Resolve directories, defaulting to today's paths so existing single-arg
    // call sites keep working unchanged.
    let packageProfilesDir = dirs && 'packageDir' in dirs
        ? dirs.packageDir
        : undefined;
    if (packageProfilesDir === undefined) {
        // The default must resolve to the package root's profiles/ from any compiled location.
        try {
            packageProfilesDir = join(getRepoRoot(), 'profiles');
        }
        catch {
            // fallback if the package root cannot be resolved
        }
    }
    const userDir = (dirs && 'userDir' in dirs && dirs.userDir !== undefined)
        ? dirs.userDir
        : join(homedir(), '.commandcode', 'profiles');
    const projectDirs = (dirs && Array.isArray(dirs.projectDirs))
        ? dirs.projectDirs
        : [join(cwd, 'profiles'), join(cwd, '.commandcode', 'profiles')];
    const retired = new Set(RETIRED_PERSONAS.map((n) => n.toLowerCase()));
    // Determine shipped names from the package dir first, so a legacy
    // user-level copy of a shipped name can never shadow it.
    // If the package directory is missing or unreadable, shippedNames stays
    // empty: no persona silently becomes a shipped name, and a legacy file
    // may then load as a custom persona (documented fallback).
    const shippedNames = new Set();
    if (packageProfilesDir) {
        try {
            for (const file of readdirSync(packageProfilesDir)) {
                if (!file.endsWith('.md') || file.startsWith('.'))
                    continue;
                shippedNames.add(file.slice(0, -3).toLowerCase());
            }
        }
        catch {
            // package dir missing or unreadable: no shipped names
        }
    }
    // 1. Package profiles are authoritative.
    if (packageProfilesDir) {
        let files = [];
        try {
            files = readdirSync(packageProfilesDir);
        }
        catch {
            files = [];
        }
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('.'))
                continue;
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
            if (!file.endsWith('.md') || file.startsWith('.'))
                continue;
            const fallbackName = file.slice(0, -3).toLowerCase();
            if (retired.has(fallbackName))
                continue;
            if (shippedNames.has(fallbackName))
                continue;
            const profile = parseProfileFile(join(userDir, file), fallbackName);
            if (profile) {
                // shipped name guard by resolved name too
                if (retired.has(profile.name) || shippedNames.has(profile.name))
                    continue;
                if (map.has(profile.name))
                    continue;
                map.set(profile.name, profile);
            }
        }
    }
    catch {
        // user dir missing
    }
    // 3. Project-level dirs override everything, later wins.
    for (const dir of projectDirs) {
        let files = [];
        try {
            files = readdirSync(dir);
        }
        catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('.'))
                continue;
            const fallbackName = file.slice(0, -3).toLowerCase();
            const profile = parseProfileFile(join(dir, file), fallbackName);
            if (profile) {
                map.set(profile.name, profile);
            }
        }
    }
    return map;
}
function loadAllPersonas(cwd, dirs) {
    const profiles = loadAllProfiles(cwd, dirs);
    const personas = new AliasAwareMap();
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
function getStatePath(cwd) {
    return join(cwd, '.righthand', 'state', 'active-persona.json');
}
function readActivePersona(cwd) {
    const fromEnv = process.env.RIGHTHAND_PERSONA;
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
        return fromEnv.trim().toLowerCase();
    }
    const canonicalPath = getStatePath(cwd);
    const legacyPath = join(cwd, '.righthand', 'active-persona.json');
    const path = existsSync(canonicalPath) ? canonicalPath : legacyPath;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (parsed && (typeof parsed.active === 'string' || parsed.active === null)) {
            return typeof parsed.active === 'string' ? parsed.active.trim().toLowerCase() : null;
        }
        return null;
    }
    catch {
        return null;
    }
}
function writeActivePersona(cwd, persona) {
    let tempPath;
    try {
        const dir = join(cwd, '.righthand', 'state');
        mkdirSync(dir, { recursive: true });
        const target = getStatePath(cwd);
        tempPath = join(dir, `.active-persona.${process.pid}.tmp`);
        const state = { active: persona, updatedAt: new Date().toISOString() };
        writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n');
        renameSync(tempPath, target);
    }
    catch {
        if (tempPath) {
            try {
                unlinkSync(tempPath);
            }
            catch { }
        }
    }
}
function buildPersonaPrompt(persona, options) {
    const heading = options?.heading ?? 'Persona';
    const label = options?.label ?? persona.name;
    const lines = [
        heading === 'Persona'
            ? `## Active RightHand Persona: ${label} (${persona.role}) [mode: ${persona.mode}]`
            : `## Active RightHand persona: ${label} (${persona.mode})`,
        ...(options?.sections ?? []),
    ];
    if (options?.includeDesc !== false)
        lines.push(`> ${persona.desc}`);
    lines.push('', persona.body);
    return lines.join('\n');
}
function buildStatusLabel(persona) {
    return persona ? `RightHand: ${persona.name} (${persona.role})` : undefined;
}
function parseRighthandArgs(args) {
    const arg = args.trim().toLowerCase();
    if (!arg || arg === 'pick')
        return { action: 'pick' };
    if (arg === 'list')
        return { action: 'list' };
    if (arg === 'off' || arg === 'none' || arg === 'default')
        return { action: 'off' };
    return { action: 'activate', name: arg };
}
function completionCandidates(personas, prefix) {
    const all = ['list', 'off', ...personas];
    const matches = all.filter((name) => name.startsWith(prefix.toLowerCase()));
    return matches.length > 0 ? matches.map((name) => ({ value: name, label: name })) : null;
}
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const statePath = join(homedir(), ".local", "state", "opencode", "righthand.json");
function activePersonaForSession(sessionID, cwd) {
    return loadSessionState().sessions?.[sessionID]?.persona ?? readActivePersona(cwd);
}
function loadSessionState() {
    try {
        const parsed = JSON.parse(readFileSync(statePath, "utf8"));
        return {
            version: 1,
            sessions: parsed.sessions ?? {},
        };
    }
    catch {
        return { version: 1, sessions: {} };
    }
}
function saveSessionState(state) {
    const now = Date.now();
    const sessions = {};
    for (const [id, entry] of Object.entries(state.sessions)) {
        if (!entry.persona || now - (entry.updated ?? 0) > MAX_AGE)
            continue;
        sessions[id] = entry;
    }
    const directory = dirname(statePath);
    const tempPath = join(directory, `.righthand.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    mkdirSync(directory, { recursive: true });
    try {
        writeFileSync(tempPath, JSON.stringify({ version: 1, sessions }, null, 2), "utf8");
        renameSync(tempPath, statePath);
    }
    catch (error) {
        try {
            unlinkSync(tempPath);
        }
        catch { }
        throw error;
    }
}
const packageProfilesDir = join(getRepoRoot(), "profiles");
const loadOpenCodePersonas = (cwd) => loadAllPersonas(cwd, {
    packageDir: packageProfilesDir,
    projectDirs: [join(cwd, "profiles"), join(cwd, ".commandcode", "profiles"), join(cwd, ".opencode", "profiles")],
});
function PersonaFooter(props) {
    const context = usePlugin();
    const isChild = createMemo(() => {
        const id = props.sessionID;
        if (!id)
            return false;
        return Boolean(context.data.session.get(id)?.parentID);
    });
    const label = createMemo(() => {
        const id = props.sessionID;
        if (!id)
            return undefined;
        const name = props.active[id] ?? activePersonaForSession(id, process.cwd());
        if (!name)
            return undefined;
        const persona = props.available.find((item) => item.name.toLowerCase() === name.toLowerCase());
        return persona ? persona.role : name;
    });
    // @ts-ignore
    return <Show when={Boolean(props.sessionID) && !isChild()}><text fg={label() ? context.theme.text.base : context.theme.text.muted}>{`persona: ${label() ?? "off"}`}</text></Show>;
}
const righthandOpenCodeTui = Plugin.define({
    id: "user.righthand",
    setup(context) {
        const cwd = process.cwd();
        const available = Array.from(loadOpenCodePersonas(cwd).values()).sort((a, b) => a.name.localeCompare(b.name));
        const [store, update] = context.storage.store("righthand", { initial: { active: {} } });
        const hydrate = () => {
            const now = Date.now();
            const active = {};
            for (const [id, entry] of Object.entries(loadSessionState().sessions)) {
                if (!entry.persona || now - (entry.updated ?? 0) > MAX_AGE)
                    continue;
                active[id] = entry.persona;
            }
            void update((draft) => {
                draft.active = active;
            });
        };
        hydrate();
        const apply = async (sessionID, persona) => {
            const state = loadSessionState();
            if (persona)
                state.sessions[sessionID] = { persona: persona.name.toLowerCase(), updated: Date.now() };
            else
                delete state.sessions[sessionID];
            saveSessionState(state);
            writeActivePersona(cwd, persona?.name.toLowerCase() ?? null);
            await update((draft) => {
                if (persona)
                    draft.active[sessionID] = persona.name.toLowerCase();
                else
                    delete draft.active[sessionID];
            });
            context.ui.toast.show({
                message: persona
                    ? `RightHand persona: ${persona.role} (${persona.mode})`
                    : "Persona dinonaktifkan - kembali ke default.",
                variant: "success",
            });
        };
        const run = async (input) => {
            const route = context.ui.router.current();
            if (route.type !== "session") {
                context.ui.toast.show({ message: "Buka sesi dulu untuk memakai /righthand.", variant: "warning" });
                return;
            }
            const sessionID = route.sessionID;
            if (context.data.session.root(sessionID) !== sessionID) {
                context.ui.toast.show({ message: "Persona hanya untuk sesi utama, bukan subagent.", variant: "warning" });
                return;
            }
            const profiles = Array.from(loadOpenCodePersonas(cwd).values()).sort((a, b) => a.name.localeCompare(b.name));
            const currentName = activePersonaForSession(sessionID, cwd) ?? undefined;
            const rawArg = (input ?? "").trim().toLowerCase();
            const action = parseRighthandArgs(rawArg);
            if (action.action === "list") {
                const lines = profiles.length > 0
                    ? profiles.map((persona) => `${persona.name === currentName ? "=>" : "  "} ${persona.name}${persona.mode === "writer" ? " (writer)" : ""} - ${persona.desc || persona.role}`)
                    : ["Belum ada persona di profiles/"];
                await context.ui.dialog.alert({ title: "RightHand Personas", message: [...lines, "", "Pakai: /righthand <nama>  |  /righthand off"].join("\n") });
                return;
            }
            if (action.action === "off") {
                await apply(sessionID);
                return;
            }
            if (action.action === "pick") {
                if (profiles.length === 0) {
                    context.ui.toast.show({ message: "Belum ada persona di profiles/", variant: "warning" });
                    return;
                }
                const picked = await context.ui.dialog.select({
                    title: "Pilih RightHand Persona",
                    current: currentName ?? "off",
                    options: [
                        { title: "off", value: "off", description: "Kembali ke persona default" },
                        ...profiles.map((persona) => ({
                            title: persona.name,
                            value: persona.name,
                            description: (persona.name === currentName ? "aktif - " : "") + `${persona.desc || persona.role}${persona.mode === "writer" ? " [writer]" : ""}`,
                        })),
                    ],
                });
                if (picked === undefined)
                    return;
                if (picked === "off") {
                    await apply(sessionID);
                    return;
                }
                const persona = profiles.find((item) => item.name.toLowerCase() === picked.toLowerCase());
                if (!persona) {
                    context.ui.toast.show({ message: `Persona "${picked}" tidak dikenal.`, variant: "error" });
                    return;
                }
                await apply(sessionID, persona);
                return;
            }
            const name = action.action === "activate" ? action.name : rawArg;
            const persona = profiles.find((item) => item.name.toLowerCase() === name.toLowerCase());
            if (!persona) {
                context.ui.toast.show({
                    message: profiles.length
                        ? `Persona "${name}" tidak dikenal. Pilihan: ${profiles.map((item) => item.name).join(", ")}`
                        : "Belum ada persona di profiles/",
                    variant: "warning",
                });
                return;
            }
            await apply(sessionID, persona);
        };
        context.keymap.layer(() => ({
            mode: "global",
            commands: [{
                    id: "user.righthand.switch",
                    title: "Switch RightHand Persona",
                    description: "Ganti persona spesialis untuk sesi aktif",
                    group: "RightHand",
                    palette: true,
                    slash: { name: "righthand", arguments: true },
                    run: (input) => run(input),
                }],
        }));
        context.ui.slot({
            append: "prompt.footer.status",
            render: (input) => {
                // @ts-ignore
                return <PersonaFooter sessionID={input.sessionID} active={store.active} available={available}/>;
            },
        });
    },
});
export default righthandOpenCodeTui;
