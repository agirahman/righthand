import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { evaluateToolGuard } from "../../guard/engine";
import { piGuardMap } from "./guard-map";
import { getRepoRoot, loadAllPersonas, type PersonaMetadata } from "../common/index";
import { readActivePersona, writeActivePersona } from "../common/state";
import { buildPersonaPrompt } from "../common/prompt";
import { buildStatusLabel } from "../common/status";
import { completionCandidates, parseRighthandArgs } from "../common/commands";
import { join } from "node:path";

const packageProfilesDir = join(getRepoRoot(), "profiles");
const loadPiPersonas = (cwd: string): Map<string, PersonaMetadata> =>
  loadAllPersonas(cwd, { packageDir: packageProfilesDir });

export default function righthandExtension(pi: ExtensionAPI) {
  const syncStatus = (ctx: { cwd: string; ui: any }) => {
    const active = readActivePersona(ctx.cwd);
    if (active) {
      const persona = loadPiPersonas(ctx.cwd).get(active);
      ctx.ui.setStatus("righthand", persona ? buildStatusLabel(persona) : `RightHand: ${active}`);
    } else {
      ctx.ui.setStatus("righthand", buildStatusLabel(null));
    }
  };

  pi.on("session_start", (_event, ctx) => {
    syncStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus("righthand", buildStatusLabel(null));
  });

  pi.on("tool_call", (event, ctx) => {
    try {
      const active = readActivePersona(ctx.cwd);
      if (!active) return;
      const persona = loadPiPersonas(ctx.cwd).get(active);
      if (!persona || persona.mode !== "readonly") return;
      const scratchDirs = process.env.COMMANDCODE_SCRATCHPAD ? [process.env.COMMANDCODE_SCRATCHPAD] : [];
      const decision = evaluateToolGuard(persona.mode, {
        toolName: event.toolName,
        input: event.input,
        cwd: ctx.cwd,
        scratchDirs,
        persona: active,
        harness: { ...piGuardMap, shellKind: event.toolName === "bash" ? "posix" : event.toolName === "powershell" ? "powershell" : piGuardMap.shellKind },
      });
      if (decision.block) return { block: true, reason: decision.reason };
      return undefined;
    } catch {
      return { block: true, reason: "Blocked: the readonly guard failed to evaluate this call." };
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    const active = readActivePersona(ctx.cwd);
    if (!active) {
      if (event.systemPromptOptions?.sections) {
        delete (event.systemPromptOptions.sections as Record<string, string>).righthand;
      }
      return;
    }

    const persona = loadPiPersonas(ctx.cwd).get(active);
    if (!persona) return;

    if (event.systemPromptOptions?.sections) {
      (event.systemPromptOptions.sections as Record<string, string>).righthand = buildPersonaPrompt(persona);
    }
  });

  pi.registerCommand("righthand", {
    description: "Manage RightHand active persona (list, off, <name>)",
    getArgumentCompletions: (prefix) => completionCandidates(loadPiPersonas(process.cwd()).keys(), prefix),
    handler: async (args, ctx) => {
      const rawArg = (args || "").trim().toLowerCase();
      const action = parseRighthandArgs(rawArg);
      const legacyPersonaName = rawArg === "pick" || rawArg === "default" ? rawArg : undefined;
      const personas = loadPiPersonas(ctx.cwd);
      const active = readActivePersona(ctx.cwd);

      if ((action.action === "pick" && !legacyPersonaName) || action.action === "list") {
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

      if (action.action === "off" && !legacyPersonaName) {
        writeActivePersona(ctx.cwd, null);
        syncStatus(ctx);
        ctx.ui.notify("RightHand persona deactivated", "info");
        return;
      }

      const name = legacyPersonaName ?? (action.action === "activate" ? action.name : rawArg);
      const persona = personas.get(name);
      if (!persona) {
        ctx.ui.notify(
          `Unknown persona "${name}". Available: ${Array.from(personas.keys()).join(", ")}`,
          "error"
        );
        return;
      }

      writeActivePersona(ctx.cwd, name);
      syncStatus(ctx);
      ctx.ui.notify(`Switched to RightHand persona: ${persona.name} (${persona.role})`, "info");
    },
  });
}
