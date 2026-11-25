import { evaluateToolGuard } from "../../guard/engine.js";
import { Plugin } from "@opencode/plugin";
import { loadAllPersonas, getPackageProfilesDir, type PersonaMetadata } from "../common/index.js";
import { buildPersonaPrompt } from "../common/prompt.js";
import { join } from "node:path";
import { openCodeGuardMap } from "./guard-map.js";
import { activePersonaForSession } from "./state.js";

const resolveProjectDirectory = (context?: any): string => {
  const location = context && typeof context === "object" ? context.location : undefined;
  const directory = location && typeof location === "object" ? location.directory : undefined;
  return typeof directory === "string" && directory.trim() !== "" ? directory : process.cwd();
};

const packageProfilesDir = getPackageProfilesDir();
const loadOpenCodePersonas = (cwd: string): Map<string, PersonaMetadata> =>
  loadAllPersonas(cwd, {
    packageDir: packageProfilesDir,
    projectDirs: [join(cwd, "profiles"), join(cwd, ".commandcode", "profiles"), join(cwd, ".opencode", "profiles")],
  });

export const righthandOpenCodePlugin = Plugin.define({
  id: "user.righthand.server",

  async setup(context: any) {
    const cwd = resolveProjectDirectory(context);
    const sessionRegistration = await context.session.hook("context", async (event: any) => {
      const info = await context.session.get({ sessionID: event.sessionID });
      if (info.parentID) return;

      const active = activePersonaForSession(event.sessionID, cwd);
      if (!active) return;
      const persona = loadOpenCodePersonas(cwd).get(active.toLowerCase());
      if (!persona) return;

      event.system.push({
        type: "text",
        text: buildPersonaPrompt(persona),
      });
    });

    const toolRegistration = await context.tool.hook("execute.before", (event: any) => {
      let refusal: string | undefined;
      try {
        const active = activePersonaForSession(event.sessionID, cwd);
        if (!active) return;
        const persona = loadOpenCodePersonas(cwd).get(active.toLowerCase());
        if (!persona || persona.mode !== "readonly") return;
        if (event.tool === "apply_patch") {
          refusal = "apply_patch can rewrite any file, so it is refused for readonly personas";
        } else if (event.tool === "batch") {
          refusal = "batch wraps nested tool calls the guard cannot statically classify, so it is refused for readonly personas";
        } else {
          const shellKind = event.tool === "bash" ? "posix" : event.tool === "powershell" ? "powershell" : openCodeGuardMap.shellKind;
          const scratchDirs = process.env.COMMANDCODE_SCRATCHPAD ? [process.env.COMMANDCODE_SCRATCHPAD] : [];
          const input = event.input && typeof event.input === "object" ? event.input : {};
          const normalizedInput = (event.tool === "write" || event.tool === "edit")
            && typeof input.filePath === "string"
            && !("file_path" in input)
            && !("path" in input)
            ? { ...input, file_path: input.filePath }
            : input;
          const decision = evaluateToolGuard(persona.mode, {
            toolName: event.tool,
            input: normalizedInput,
            cwd,
            scratchDirs,
            persona: active,
            harness: { ...openCodeGuardMap, shellKind },
          });
          if (decision.block) refusal = decision.reason ?? "Blocked by the readonly guard.";
        }
      } catch {
        throw new Error("Blocked: the readonly guard failed to evaluate this call.");
      }
      if (refusal) throw new Error(refusal);
    });

    return async () => {
      await sessionRegistration.dispose();
      await toolRegistration?.dispose?.();
    };
  },
});

export default righthandOpenCodePlugin;
