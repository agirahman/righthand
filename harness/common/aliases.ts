// harness/common/aliases.ts
// v2 bounded-contract engine, Fase 1: the persona alias layer.
//
// The six canonical personas are named by hand anatomy: one palm plus five
// fingers. Each anatomy name stands for a role (palm = steer, index = point,
// pinky = scan, thumb = build, ring = shape, middle = guard). This module maps
// the legacy shipped personas, the old verb role-words, and common SDLC words
// onto those six anatomy names. Pure data plus a pure resolver.

// The six canonical personas, named by hand anatomy.
export const CANONICAL_PERSONAS: string[] = [
  'palm',   // the palm - chairs the loop, integrates findings, owns release
  'index',  // points - sets direction: requirements, architecture, planning
  'pinky',  // scouts - reads: explore, research, debug, triage
  'thumb',  // builds - writes: implement, refactor, fix, deploy
  'ring',   // shapes - crafts the interface: frontend, design
  'middle', // guards - verifies: review, security, test, qa
];

// The eleven shipped personas this layer supersedes. They stay loadable until
// the retirement step lands; their names always resolve onto a canonical one.
export const LEGACY_PERSONAS: string[] = [
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
export const PERSONA_ALIASES: Record<string, string> = {
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
  'web-performance-auditor': 'middle',
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

export interface ResolvedPersona {
  canonical: string;
  aliasedFrom: string | null;
}

// Resolve a raw persona reference onto its canonical v2 anatomy persona.
// - a canonical name resolves to itself (aliasedFrom is null);
// - a known alias (legacy name, verb role-word, or SDLC word) resolves to its
//   canonical target;
// - any other name passes through unchanged (it is not an alias).
export function resolvePersonaName(raw: string): ResolvedPersona {
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
