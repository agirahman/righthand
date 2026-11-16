import { evaluateToolGuard } from "../../guard/engine.js";
import { Plugin } from "@opencode/plugin";
import { loadAllPersonas, getRepoRoot, type PersonaMetadata } from "../common/index.js";
import { readActivePersona } from "../common/state.js";
import { buildPersonaPrompt } from "../common/prompt.js";
import { buildStatusLabel } from "../common/status.js";
import { completionCandidates, parseRighthandArgs } from "../common/commands.js";
import { join } from "node:path";
import { openCodeGuardMap } from "./guard-map.js";
import { loadSessionState } from "./state.js";

const packageProfilesDir = join(getRepoRoot(), "profiles");
const loadOpenCodePersonas = (cwd: string): Map<string, PersonaMetadata> =>
  loadAllPersonas(cwd, { packageDir: packageProfilesDir });

const activePersonaForSession = (sessionID: string, cwd: string): string | null =>
  loadSessionState().sessions?.[sessionID]?.persona ?? readActivePersona(cwd);

export const righthandOpenCodePlugin = Plugin.define({
  id: "user.righthand.server",

  async setup(context: any) {
    const cwd = process.cwd();
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

    const toolRegistration = context.tool.hook("execute.before", (event: any) => {
      let refusal: string | undefined;
      try {
        const active = activePersonaForSession(event.sessionID, cwd);
        if (!active) return;
        const persona = loadOpenCodePersonas(cwd).get(active.toLowerCase());
        if (!persona || persona.mode !== "readonly") return;

        const shellKind = event.tool === "bash" ? "posix" : event.tool === "powershell" ? "powershell" : openCodeGuardMap.shellKind;
        const scratchDirs = process.env.COMMANDCODE_SCRATCHPAD ? [process.env.COMMANDCODE_SCRATCHPAD] : [];
        const decision = evaluateToolGuard(persona.mode, {
          toolName: event.tool,
          input: event.input,
          cwd,
          scratchDirs,
          persona: active,
          harness: { ...openCodeGuardMap, shellKind },
        });
        if (decision.block) refusal = decision.reason ?? "Blocked by the readonly guard.";
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
