import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { Show, createMemo } from "solid-js";
import { loadAllPersonas, getRepoRoot, type PersonaMetadata } from "../common/index.js";
import { writeActivePersona } from "../common/state.js";
import { parseRighthandArgs } from "../common/commands.js";
import { join } from "node:path";
import { loadSessionState, MAX_AGE, saveSessionState } from "./state.js";

const packageProfilesDir = join(getRepoRoot(), "profiles");
const loadOpenCodePersonas = (cwd: string): Map<string, PersonaMetadata> =>
  loadAllPersonas(cwd, { packageDir: packageProfilesDir });

function PersonaFooter(props: { sessionID?: string; active: Record<string, string>; available: PersonaMetadata[] }) {
  const context = usePlugin() as any;
  const isChild = createMemo(() => {
    const id = props.sessionID;
    if (!id) return false;
    return Boolean(context.data.session.get(id)?.parentID);
  });
  const label = createMemo(() => {
    const id = props.sessionID;
    if (!id) return undefined;
    const name = props.active[id];
    if (!name) return undefined;
    const persona = props.available.find((item) => item.name.toLowerCase() === name.toLowerCase());
    return persona ? persona.role : name;
  });

  // @ts-ignore
  return <Show when={Boolean(props.sessionID) && !isChild()}><text fg={label() ? context.theme.text.base : context.theme.text.muted}>{`persona: ${label() ?? "off"}`}</text></Show>;
}

export const righthandOpenCodeTui = Plugin.define({
  id: "user.righthand",

  setup(context: any) {
    const cwd = process.cwd();
    const available = Array.from(loadOpenCodePersonas(cwd).values()).sort((a, b) => a.name.localeCompare(b.name));
    const [store, update] = context.storage.store("righthand", { initial: { active: {} } });

    const hydrate = () => {
      const now = Date.now();
      const active: Record<string, string> = {};
      for (const [id, entry] of Object.entries(loadSessionState().sessions)) {
        if (!entry.persona || now - (entry.updated ?? 0) > MAX_AGE) continue;
        active[id] = entry.persona;
      }
      void update((draft: any) => {
        draft.active = active;
      });
    };
    hydrate();

    const apply = async (sessionID: string, persona?: PersonaMetadata) => {
      const state = loadSessionState();
      if (persona) state.sessions[sessionID] = { persona: persona.name.toLowerCase(), updated: Date.now() };
      else delete state.sessions[sessionID];
      saveSessionState(state);
      writeActivePersona(cwd, persona?.name.toLowerCase() ?? null);

      await update((draft: any) => {
        if (persona) draft.active[sessionID] = persona.name.toLowerCase();
        else delete draft.active[sessionID];
      });
      context.ui.toast.show({
        message: persona
          ? `RightHand persona: ${persona.role} (${persona.mode})`
          : "Persona dinonaktifkan — kembali ke default.",
        variant: "success",
      });
    };

    const run = async (input: string) => {
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
      const currentName = loadSessionState().sessions[sessionID]?.persona;
      const rawArg = (input ?? "").trim().toLowerCase();
      const action = parseRighthandArgs(rawArg);

      if (action.action === "list") {
        const lines = profiles.length > 0
          ? profiles.map((persona) => `${persona.name === currentName ? "=>" : "  "} ${persona.name}${persona.mode === "writer" ? " (writer)" : ""} — ${persona.desc || persona.role}`)
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
              description: (persona.name === currentName ? "aktif — " : "") + `${persona.desc || persona.role}${persona.mode === "writer" ? " [writer]" : ""}`,
            })),
          ],
        });
        if (picked === undefined) return;
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
        run: (input: string) => run(input),
      }],
    }));

    context.ui.slot({
      append: "prompt.footer.status",
      render: (input: { sessionID?: string }) => {
        // @ts-ignore
        return <PersonaFooter sessionID={input.sessionID} active={store.active} available={available} />;
      },
    });
  },
});

export default righthandOpenCodeTui;
