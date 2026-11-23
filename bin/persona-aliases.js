'use strict';

// bin/persona-aliases.js
//
// Plain CommonJS mirror of the persona alias table in harness/common/aliases.ts.
// bin/ is plain JavaScript and cannot require the TypeScript source, so the
// table is duplicated here. test/validate-persona-aliases.cjs asserts that this
// copy and the compiled dist/harness/common/aliases.js answer identically, so
// the two can never drift apart silently.

// The six canonical personas, named by hand anatomy.
const CANONICAL_PERSONAS = ['palm', 'index', 'pinky', 'thumb', 'ring', 'middle'];

// The eleven shipped personas folded into the six.
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

// Legacy names, old verb role-words, and common SDLC words, each mapped onto
// exactly one canonical persona.
const PERSONA_ALIASES = {
  orchestrator: 'palm',
  'product-manager': 'palm',
  pm: 'palm',
  steer: 'palm',
  architect: 'index',
  planner: 'index',
  point: 'index',
  explorer: 'pinky',
  researcher: 'pinky',
  debugger: 'pinky',
  'web-performance-auditor': 'pinky',
  scan: 'pinky',
  backend: 'thumb',
  devops: 'thumb',
  worker: 'thumb',
  coder: 'thumb',
  refactorer: 'thumb',
  fixer: 'thumb',
  build: 'thumb',
  frontend: 'ring',
  designer: 'ring',
  shape: 'ring',
  'code-reviewer': 'middle',
  'security-auditor': 'middle',
  'test-engineer': 'middle',
  reviewer: 'middle',
  qa: 'middle',
  security: 'middle',
  guard: 'middle',
};

// Resolve a raw persona reference onto its canonical persona. A canonical name
// resolves to itself, a known alias to its target, and anything else passes
// through unchanged.
function resolvePersonaName(raw) {
  const name = String(raw).trim().toLowerCase();
  if (CANONICAL_PERSONAS.includes(name)) return { canonical: name, aliasedFrom: null };
  const target = PERSONA_ALIASES[name];
  if (target) return { canonical: target, aliasedFrom: name };
  return { canonical: name, aliasedFrom: null };
}

module.exports = { CANONICAL_PERSONAS, LEGACY_PERSONAS, PERSONA_ALIASES, resolvePersonaName };
