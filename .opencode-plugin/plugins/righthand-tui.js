import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { Show, createMemo } from "solid-js"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

// ---------------------------------------------------------------------------
// Helpers: locate the package's profiles/ directory
// ---------------------------------------------------------------------------
function getRepoRoot() {
  try {
    const currentFile = fileURLToPath(import.meta.url)
    return resolve(dirname(currentFile), "../..")
  } catch {
    return process.cwd()
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parsePersona(raw, fallbackName) {
  let name = fallbackName
  let role = fallbackName
  let mode = "readonly"
  let desc = ""
  let body = raw.trim()

  const m = FRONTMATTER_RE.exec(raw)
  if (m) {
    body = m[2].trim()
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line)
      if (!kv) continue
      const k = kv[1].toLowerCase()
      const v = kv[2].trim().replace(/^['"](.*)['"]$/, "$1")
      if (k === "name") name = v
      if (k === "role") role = v
      if (k === "mode") mode = v.toLowerCase() === "writer" ? "writer" : "readonly"
      if (k === "description" || k === "desc") desc = v
    }
  }

  return { name, role, mode, desc, body }
}

function loadProfiles(cwd) {
  const map = new Map()
  const repoRoot = getRepoRoot()
  const searchDirs = [
    join(repoRoot, "profiles"),
    join(cwd, "profiles"),
    join(cwd, ".opencode", "profiles"),
  ]

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md") || file.startsWith(".")) continue
        const fallbackName = file.slice(0, -3).toLowerCase()
        try {
          const raw = readFileSync(join(dir, file), "utf8")
          const persona = parsePersona(raw, fallbackName)
          map.set(persona.name.toLowerCase(), persona)
        } catch {}
      }
    } catch {}
  }

  // Return sorted array of personas
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// State: ~/.local/state/opencode/righthand.json
// { version: 1, sessions: { [sessionID]: { persona: string, updated: number } } }
// ---------------------------------------------------------------------------
const MAX_AGE = 30 * 24 * 60 * 60 * 1000
const statePath = join(homedir(), ".local", "state", "opencode", "righthand.json")

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"))
    return {
      version: parsed.version ?? 1,
      sessions: parsed.sessions ?? {},
    }
  } catch {
    return { version: 1, sessions: {} }
  }
}

function saveState(state) {
  const now = Date.now()
  const sessions = {}
  for (const [id, entry] of Object.entries(state.sessions)) {
    if (!entry.persona) continue
    if (now - (entry.updated ?? 0) > MAX_AGE) continue
    sessions[id] = entry
  }
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, JSON.stringify({ version: 1, sessions }, null, 2), "utf8")
}

// ---------------------------------------------------------------------------
// TUI component: show active persona in prompt footer
// ---------------------------------------------------------------------------
function PersonaFooter(props) {
  const context = usePlugin()

  const isChild = createMemo(() => {
    const id = props.sessionID
    if (!id) return false
    return Boolean(context.data.session.get(id)?.parentID)
  })

  const label = createMemo(() => {
    const id = props.sessionID
    if (!id) return undefined
    const name = props.active[id]
    if (!name) return undefined
    const persona = props.available.find((p) => p.name.toLowerCase() === name.toLowerCase())
    return persona ? `${persona.role}` : name
  })

  return (
    <Show when={Boolean(props.sessionID) && !isChild()}>
      <text fg={label() ? context.theme.text.base : context.theme.text.muted}>
        {`persona: ${label() ?? "off"}`}
      </text>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------
export default Plugin.define({
  id: "user.righthand",

  setup(context) {
    const cwd = process.cwd()
    const available = loadProfiles(cwd)

    // Store: active persona per sessionID
    const [store, update] = context.storage.store("righthand", {
      initial: { active: {} },
    })

    // Hydrate from disk on startup
    const hydrate = () => {
      const disk = loadState()
      const now = Date.now()
      const active = {}
      for (const [id, entry] of Object.entries(disk.sessions)) {
        if (!entry.persona) continue
        if (now - (entry.updated ?? 0) > MAX_AGE) continue
        active[id] = entry.persona
      }
      void update((draft) => {
        draft.active = active
      })
    }
    hydrate()

    // Apply a persona switch
    const apply = async (sessionID, persona) => {
      const state = loadState()
      if (persona) {
        state.sessions[sessionID] = { persona: persona.name.toLowerCase(), updated: Date.now() }
      } else {
        delete state.sessions[sessionID]
      }
      saveState(state)

      await update((draft) => {
        if (persona) draft.active[sessionID] = persona.name.toLowerCase()
        else delete draft.active[sessionID]
      })

      context.ui.toast.show({
        message: persona
          ? `RightHand persona: ${persona.role} (${persona.mode})`
          : "Persona dinonaktifkan — kembali ke default.",
        variant: "success",
      })
    }

    // Main command handler
    const run = async (input) => {
      const route = context.ui.router.current()
      if (route.type !== "session") {
        context.ui.toast.show({
          message: "Buka sesi dulu untuk memakai /righthand.",
          variant: "warning",
        })
        return
      }

      const sessionID = route.sessionID
      if (context.data.session.root(sessionID) !== sessionID) {
        context.ui.toast.show({
          message: "Persona hanya untuk sesi utama, bukan subagent.",
          variant: "warning",
        })
        return
      }

      const profiles = loadProfiles(cwd)
      const currentName = loadState().sessions[sessionID]?.persona
      const arg = (input ?? "").trim().toLowerCase()

      // /righthand list
      if (arg === "list") {
        const lines =
          profiles.length > 0
            ? profiles.map(
                (p) =>
                  `${p.name === currentName ? "=>" : "  "} ${p.name}${
                    p.mode === "writer" ? " (writer)" : ""
                  } — ${p.desc || p.role}`,
              )
            : ["Belum ada persona di profiles/"]

        await context.ui.dialog.alert({
          title: "RightHand Personas",
          message: [...lines, "", "Pakai: /righthand <nama>  |  /righthand off"].join("\n"),
        })
        return
      }

      // /righthand off
      if (arg === "off" || arg === "default") {
        await apply(sessionID, undefined)
        return
      }

      // /righthand (no arg) or /righthand pick → show picker
      if (!arg || arg === "pick") {
        if (profiles.length === 0) {
          context.ui.toast.show({
            message: "Belum ada persona di profiles/",
            variant: "warning",
          })
          return
        }

        const picked = await context.ui.dialog.select({
          title: "Pilih RightHand Persona",
          current: currentName ?? "off",
          options: [
            {
              title: "off",
              value: "off",
              description: "Kembali ke persona default",
            },
            ...profiles.map((p) => ({
              title: p.name,
              value: p.name,
              description:
                (p.name === currentName ? "aktif — " : "") +
                `${p.desc || p.role}${p.mode === "writer" ? " [writer]" : ""}`,
            })),
          ],
        })

        if (picked === undefined) return
        if (picked === "off") {
          await apply(sessionID, undefined)
          return
        }

        const persona = profiles.find((p) => p.name.toLowerCase() === picked.toLowerCase())
        if (!persona) {
          context.ui.toast.show({ message: `Persona "${picked}" tidak dikenal.`, variant: "error" })
          return
        }
        await apply(sessionID, persona)
        return
      }

      // /righthand <persona-name>
      const persona = profiles.find((p) => p.name.toLowerCase() === arg)
      if (!persona) {
        context.ui.toast.show({
          message: profiles.length
            ? `Persona "${arg}" tidak dikenal. Pilihan: ${profiles.map((p) => p.name).join(", ")}`
            : "Belum ada persona di profiles/",
          variant: "warning",
        })
        return
      }

      await apply(sessionID, persona)
    }

    // Register /righthand slash command
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "user.righthand.switch",
          title: "Switch RightHand Persona",
          description: "Ganti persona spesialis untuk sesi aktif",
          group: "RightHand",
          palette: true,
          slash: { name: "righthand", arguments: true },
          run: (input) => run(input),
        },
      ],
    }))

    // Show active persona in prompt footer
    context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <PersonaFooter
          sessionID={input.sessionID}
          active={store.active}
          available={available}
        />
      ),
    })
  },
})
