import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface PersonaMetadata {
  name: string;
  role: string;
  mode: "writer" | "readonly";
  desc: string;
  body: string;
}

function getRepoRoot(): string {
  try {
    if (typeof __dirname !== "undefined") {
      return resolve(__dirname, "../..");
    }
  } catch {}
  return process.cwd();
}

function parsePersona(raw: string, fallbackName: string): PersonaMetadata {
  let name = fallbackName;
  let role = fallbackName;
  let mode: "writer" | "readonly" = "readonly";
  let desc = "";
  let body = raw.trim();

  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (m) {
    body = m[2].trim();
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const k = kv[1].toLowerCase();
      const v = kv[2].trim().replace(/^['"](.*)['"]$/, "$1");
      if (k === "name") name = v;
      if (k === "role") role = v;
      if (k === "mode") mode = v.toLowerCase() === "writer" ? "writer" : "readonly";
      if (k === "description" || k === "desc") desc = v;
    }
  }

  return { name, role, mode, desc, body };
}

function loadAllPersonas(cwd: string): Map<string, PersonaMetadata> {
  const map = new Map<string, PersonaMetadata>();
  const repoRoot = getRepoRoot();
  const searchDirs = [
    join(repoRoot, "profiles"),
    join(cwd, "profiles"),
    join(cwd, ".pi", "profiles"),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".md") || file.startsWith(".")) continue;
        const fallbackName = file.slice(0, -3).toLowerCase();
        try {
          const raw = readFileSync(join(dir, file), "utf8");
          const persona = parsePersona(raw, fallbackName);
          map.set(persona.name.toLowerCase(), persona);
        } catch {}
      }
    } catch {}
  }

  return map;
}

function getStatePath(cwd: string): string {
  return join(cwd, ".righthand", "active-persona.json");
}

function readActivePersona(cwd: string): string | null {
  try {
    const p = getStatePath(cwd);
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, "utf8"));
    return data?.active || null;
  } catch {
    return null;
  }
}

function writeActivePersona(cwd: string, persona: string | null): void {
  try {
    const dir = join(cwd, ".righthand");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      getStatePath(cwd),
      JSON.stringify({ active: persona, updatedAt: new Date().toISOString() }, null, 2) + "\n",
      "utf8"
    );
  } catch {}
}

export default function righthandExtension(pi: ExtensionAPI) {
  const syncStatus = (ctx: { cwd: string; ui: any }) => {
    const active = readActivePersona(ctx.cwd);
    if (active) {
      const personas = loadAllPersonas(ctx.cwd);
      const p = personas.get(active);
      const label = p ? `${p.name} (${p.role})` : active;
      ctx.ui.setStatus("righthand", `RightHand: ${label}`);
    } else {
      ctx.ui.setStatus("righthand", undefined);
    }
  };

  pi.on("session_start", (_event, ctx) => {
    syncStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus("righthand", undefined);
  });

  pi.on("before_agent_start", (event, ctx) => {
    const active = readActivePersona(ctx.cwd);
    if (!active) {
      if (event.systemPromptOptions?.sections) {
        delete (event.systemPromptOptions.sections as Record<string, string>).righthand;
      }
      return;
    }

    const personas = loadAllPersonas(ctx.cwd);
    const persona = personas.get(active);
    if (!persona) return;

    if (event.systemPromptOptions?.sections) {
      (event.systemPromptOptions.sections as Record<string, string>).righthand = [
        `## Active RightHand Persona: ${persona.name} (${persona.role}) [mode: ${persona.mode}]`,
        `> ${persona.desc}`,
        "",
        persona.body,
      ].join("\n");
    }
  });

  pi.registerCommand("righthand", {
    description: "Manage RightHand active persona (list, off, <name>)",
    getArgumentCompletions: (prefix) => {
      const base = ["list", "off"];
      const personas = Array.from(loadAllPersonas(process.cwd()).keys());
      const all = [...base, ...personas];
      const match = all.filter((s) => s.startsWith(prefix.toLowerCase()));
      return match.length > 0 ? match.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      const arg = (args || "").trim().toLowerCase();
      const personas = loadAllPersonas(ctx.cwd);
      const active = readActivePersona(ctx.cwd);

      if (!arg || arg === "list") {
        const names = Array.from(personas.keys()).sort();
        if (names.length === 0) {
          ctx.ui.notify("No RightHand profiles found in profiles/", "warning");
          return;
        }

        const items = [
          active ? `[Deactivate] off (currently active: ${active})` : "[Deactivate] off",
          ...names.map((n) => {
            const p = personas.get(n)!;
            const mark = n === active ? "=> " : "   ";
            return `${mark}${n} (${p.role}) [${p.mode}]`;
          }),
        ];

        if (typeof ctx.ui.select === "function") {
          const selected = await ctx.ui.select("Select RightHand Persona", items);
          if (!selected) return;

          if (selected.includes("[Deactivate] off")) {
            writeActivePersona(ctx.cwd, null);
            syncStatus(ctx);
            ctx.ui.notify("RightHand persona deactivated", "info");
            return;
          }

          const matchedName = names.find((n) => selected.includes(`${n} (`));
          if (matchedName) {
            writeActivePersona(ctx.cwd, matchedName);
            syncStatus(ctx);
            const p = personas.get(matchedName)!;
            ctx.ui.notify(`Switched to RightHand persona: ${matchedName} (${p.role})`, "info");
          }
        } else {
          ctx.ui.notify(
            `RightHand Personas:\n` +
              names.map((n) => `  ${n === active ? "* " : "  "}${n}`).join("\n"),
            "info"
          );
        }
        return;
      }

      if (arg === "off" || arg === "none") {
        writeActivePersona(ctx.cwd, null);
        syncStatus(ctx);
        ctx.ui.notify("RightHand persona deactivated", "info");
        return;
      }

      const p = personas.get(arg);
      if (!p) {
        ctx.ui.notify(
          `Unknown persona "${arg}". Available: ${Array.from(personas.keys()).join(", ")}`,
          "error"
        );
        return;
      }

      writeActivePersona(ctx.cwd, arg);
      syncStatus(ctx);
      ctx.ui.notify(`Switched to RightHand persona: ${p.name} (${p.role})`, "info");
    },
  });
}
