import { Plugin } from "@opencode/plugin"
import { existsSync, readFileSync, readdirSync } from "node:fs"
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

function loadAllPersonas(cwd) {
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

  return map
}

// ---------------------------------------------------------------------------
// State: ~/.local/state/opencode/righthand.json
// { version: 1, sessions: { [sessionID]: { persona: string, updated: number } } }
// ---------------------------------------------------------------------------
const statePath = join(homedir(), ".local", "state", "opencode", "righthand.json")

async function readState() {
  try {
    const { readFile } = await import("node:fs/promises")
    return JSON.parse(await readFile(statePath, "utf8"))
  } catch {
    return { version: 1, sessions: {} }
  }
}

// ---------------------------------------------------------------------------
// Plugin: inject active persona into system prompt on every context event
// ---------------------------------------------------------------------------
export default Plugin.define({
  id: "user.righthand.server",

  async setup(context) {
    const cwd = process.cwd()

    const registration = await context.session.hook("context", async (event) => {
      // skip subagent sessions
      const info = await context.session.get({ sessionID: event.sessionID })
      if (info.parentID) return

      const state = await readState()
      const personaName = state.sessions?.[event.sessionID]?.persona
      if (!personaName) return

      const personas = loadAllPersonas(cwd)
      const persona = personas.get(personaName.toLowerCase())
      if (!persona) return

      event.system.push({
        type: "text",
        text: `## Active RightHand Persona: ${persona.name} (${persona.role}) [mode: ${persona.mode}]\n> ${persona.desc}\n\n${persona.body}`,
      })
    })

    return async () => {
      await registration.dispose()
    }
  },
})
