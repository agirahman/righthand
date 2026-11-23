// harness/common/aliases.ts
// v2 bounded-contract engine, Fase 1: the persona alias layer.
//
// Maps the legacy shipped personas (and common SDLC role words) onto the six
// canonical "one palm + five fingers" personas. This module is pure data plus
// a pure resolver: it does not add or remove any live persona on its own.
// The retirement of the eleven legacy personas (the "11 -> 6" step) builds on
// this table and lands as a separate, later increment.

// The six canonical personas: one palm (steer) + five fingers.
export const CANONICAL_PERSONAS: string[] = [
  'steer',  // palm - chairs the loop, integrates findings
  'point',  // sets direction: requirements, architecture, planning
  'scan',   // reads: explore, research, debug, performance
  'build',  // writes: implement, refactor, fix, deploy
  'shape',  // crafts the interface: frontend, design
  'guard',  // verifies: review, security, test, qa
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

// Alias table: the eleven legacy names plus common SDLC role words, each
// mapped to exactly one canonical persona. Keys are lowercased; every value is
// a member of CANONICAL_PERSONAS.
export const PERSONA_ALIASES: Record<string, string> = {
  // steer (the palm)
  orchestrator: 'steer',
  'product-manager': 'steer',
  // point
  architect: 'point',
  planner: 'point',
  // scan
  explorer: 'scan',
  researcher: 'scan',
  debugger: 'scan',
  'web-performance-auditor': 'scan',
  // build
  backend: 'build',
  devops: 'build',
  worker: 'build',
  coder: 'build',
  refactorer: 'build',
  fixer: 'build',
  // shape
  frontend: 'shape',
  designer: 'shape',
  // guard
  'code-reviewer': 'guard',
  'security-auditor': 'guard',
  'test-engineer': 'guard',
  reviewer: 'guard',
  qa: 'guard',
  security: 'guard',
};

export interface ResolvedPersona {
  canonical: string;
  aliasedFrom: string | null;
}

// Resolve a raw persona reference onto its canonical v2 persona.
// - a canonical name resolves to itself (aliasedFrom is null);
// - a known alias resolves to its canonical target;
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
