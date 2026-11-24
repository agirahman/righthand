'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    passed++;
    console.log(`OK: ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}${detail ? `: ${detail}` : ''}`);
  }
}

// Same frontmatter regex the product uses.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function bodyOf(raw) {
  const m = FRONTMATTER.exec(raw);
  return m ? m[2] || '' : raw;
}
// Fenced blocks can quote headers; strip them before section checks.
function stripFences(text) {
  let inFence = false;
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (line.trim().startsWith('```')) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join('\n');
}

const ENVELOPE_KEYS = ['ticket', 'persona', 'kind', 'status', 'verdict', 'commit', 'round'];
const SHARED_SECTIONS = ['## Outcome', '## Verification', '## Risks & Follow-up'];
// Target contract: each persona names its own artifact root under .righthand/.
const ARTIFACT_ROOTS = {
  palm: ['.righthand/tickets/<TICKET>/reports/palm.md'],
  index: ['.righthand/prd/', '.righthand/architecture/', '.righthand/tickets/<TICKET>/reports/index.md'],
  pinky: ['.righthand/triage/', '.righthand/tickets/<TICKET>/reports/pinky.md'],
  thumb: ['.righthand/tickets/<TICKET>/reports/thumb.md'],
  ring: ['.righthand/tickets/<TICKET>/reports/ring.md'],
  middle: ['.righthand/tickets/<TICKET>/reviews/middle.md', '.righthand/council/'],
};

// ---- 1. The skill declares the envelope contract ----
const skillPath = path.join(root, 'skills', 'report-and-board', 'SKILL.md');
const skillRaw = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';
check('skill: skills/report-and-board/SKILL.md exists', skillRaw !== '');
const skillLines = bodyOf(skillRaw).split(/\r?\n/);

// An envelope key declaration: optional list bullet, optional backticks, key at line start.
const DECL_RE = /^\s*(?:[-*]\s+)?`?(ticket|persona|kind|status|verdict|commit|round)`?\s*:/;
const keyLine = new Map();
skillLines.forEach((line, i) => {
  const m = DECL_RE.exec(line);
  if (m && !keyLine.has(m[1])) keyLine.set(m[1], i);
});
check(
  `skill: declares envelope keys in order ${ENVELOPE_KEYS.join(',')}`,
  ENVELOPE_KEYS.every((k) => keyLine.has(k)) &&
    ENVELOPE_KEYS.every((k, i) => i === 0 || keyLine.get(k) > keyLine.get(ENVELOPE_KEYS[i - 1])),
  `first declaration lines: ${JSON.stringify(Object.fromEntries(keyLine))}`,
);

const windowAfter = (i) => skillLines.slice(i, i + 4).join('\n');
const statusIdx = keyLine.get('status');
check(
  'skill: states status values completed|partial|blocked',
  statusIdx !== undefined && ['completed', 'partial', 'blocked'].every((v) => windowAfter(statusIdx).includes(v)),
  statusIdx === undefined ? 'no status declaration line found' : `window: ${JSON.stringify(windowAfter(statusIdx).slice(0, 160))}`,
);
const skillBody = bodyOf(skillRaw);
const verdictIdx = keyLine.get('verdict');
check(
  'skill: states verdict values pass|fail for kind review',
  verdictIdx !== undefined &&
    /pass/.test(windowAfter(verdictIdx)) &&
    /fail/.test(windowAfter(verdictIdx)) &&
    /verdict[^\n]*review|review[^\n]*verdict/i.test(skillBody),
  verdictIdx === undefined
    ? 'no verdict declaration line found'
    : `window: ${JSON.stringify(windowAfter(verdictIdx).slice(0, 160))}`,
);
check(
  'skill: owns the shared sections (Outcome, Verification, Risks & Follow-up)',
  ['Outcome', 'Verification', 'Risks & Follow-up'].every((s) => skillBody.includes(s)),
  'one or more shared section names absent from the skill body',
);

// ---- 2+3. Profiles: no shared-section redefinition; each names its artifact root ----
const profilesDir = path.join(root, 'profiles');
const profileFiles = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.md')).sort();
check(
  'profiles: exactly the six persona profiles exist',
  profileFiles.length === 6 && Object.keys(ARTIFACT_ROOTS).every((p) => profileFiles.includes(`${p}.md`)),
  profileFiles.join(', '),
);

for (const persona of Object.keys(ARTIFACT_ROOTS)) {
  const pFile = path.join(profilesDir, `${persona}.md`);
  const raw = fs.existsSync(pFile) ? fs.readFileSync(pFile, 'utf8') : '';
  const bodyLines = stripFences(bodyOf(raw)).split(/\r?\n/);
  const offenders = SHARED_SECTIONS.filter((s) => bodyLines.some((l) => l.trim() === s));
  check(
    `profile ${persona}.md: does not redefine shared sections`,
    offenders.length === 0,
    `redefines: ${offenders.join(', ')}`,
  );
  const missing = ARTIFACT_ROOTS[persona].filter((r) => !raw.includes(r));
  check(
    `profile ${persona}.md: names its artifact root(s) under .righthand/`,
    missing.length === 0,
    `missing: ${missing.join(', ')}`,
  );
}

// ---- 4. One shared parser handles all six personas, no persona-specific branch ----
function parseReport(text) {
  const lines = text.split(/\r?\n/);
  const envelope = {};
  for (const line of lines) {
    if (/^##\s/.test(line)) break;
    const m = /^\s*(ticket|persona|kind|status|verdict|commit|round)\s*:\s*(.+?)\s*$/.exec(line);
    if (m) envelope[m[1]] = m[2];
  }
  const sections = lines
    .filter((l) => /^##\s/.test(l))
    .map((l) => l.replace(/^##\s+/, '').trim());
  return {
    envelope,
    sections,
    hasShared: SHARED_SECTIONS.every((s) => sections.includes(s.replace(/^##\s+/, ''))),
  };
}

function fixtureText({ persona, kind, status, verdict }) {
  const lines = [`ticket: T42`, `persona: ${persona}`, `kind: ${kind}`, `status: ${status}`];
  if (verdict) lines.push(`verdict: ${verdict}`);
  lines.push('commit: 9f1e2d3', 'round: 1', '', ...SHARED_SECTIONS, 'Body text.');
  return lines.join('\n');
}

const FIXTURES = [
  { persona: 'palm', kind: 'report', status: 'completed', verdict: undefined },
  { persona: 'index', kind: 'report', status: 'completed', verdict: undefined },
  { persona: 'pinky', kind: 'report', status: 'completed', verdict: undefined },
  { persona: 'thumb', kind: 'report', status: 'completed', verdict: undefined },
  { persona: 'ring', kind: 'report', status: 'partial', verdict: undefined },
  { persona: 'middle', kind: 'review', status: 'completed', verdict: 'pass' },
];

for (const f of FIXTURES) {
  const parsed = parseReport(fixtureText(f));
  check(
    `fixture ${f.persona}: shared parser returns kind/status/verdict/sections`,
    parsed.envelope.persona === f.persona &&
      parsed.envelope.kind === f.kind &&
      parsed.envelope.status === f.status &&
      (parsed.envelope.verdict === f.verdict || (f.verdict === undefined && !('verdict' in parsed.envelope))) &&
      parsed.envelope.ticket === 'T42' &&
      parsed.envelope.commit === '9f1e2d3' &&
      parsed.envelope.round === '1' &&
      parsed.hasShared,
    JSON.stringify(parsed.envelope),
  );
}
check(
  'fixture negative: parser flags a report missing the shared sections',
  !parseReport('ticket: T42\npersona: thumb\nkind: report\nstatus: completed\ncommit: 9f1e2d3\nround: 1\n\n## Outcome\nx\n').hasShared,
  'expected hasShared to be false',
);

// ---- 5. Pairing rule, tested on temp fixtures in the OS temp dir ----
// A report claiming status: completed requires a matching board done event.
// A review claiming verdict: pass requires a matching board verdict pass event.
function pairingViolations(report, events) {
  const v = [];
  const mine = (ev) => ev.ticket === report.ticket && ev.persona === report.persona;
  if (report.status === 'completed' && !events.some((ev) => mine(ev) && ev.event === 'done')) {
    v.push('status completed without a matching board done event');
  }
  if (report.kind === 'review' && report.verdict === 'pass' && !events.some((ev) => mine(ev) && ev.event === 'verdict' && ev.verdict === 'pass')) {
    v.push('review verdict pass without a matching board verdict pass event');
  }
  return v;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-envelope-'));
try {
  const writeScenario = (name, reportText, boardEvents) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'report.md'), reportText + '\n');
    fs.writeFileSync(path.join(dir, 'board.jsonl'), boardEvents.map((e) => JSON.stringify(e)).join('\n') + '\n');
    const report = parseReport(fs.readFileSync(path.join(dir, 'report.md'), 'utf8'));
    const events = fs
      .readFileSync(path.join(dir, 'board.jsonl'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return pairingViolations(report.envelope, events);
  };

  const thumbReport = fixtureText({ persona: 'thumb', kind: 'report', status: 'completed' });
  const ringReport = fixtureText({ persona: 'ring', kind: 'report', status: 'partial' });
  const middleReview = fixtureText({ persona: 'middle', kind: 'review', status: 'completed', verdict: 'pass' });
  const doneThumb = { v: 1, ts: '2026-11-24T00:00:00Z', ticket: 'T42', persona: 'thumb', event: 'done' };
  const doneMiddle = { v: 1, ts: '2026-11-24T00:00:00Z', ticket: 'T42', persona: 'middle', event: 'done' };
  const verdictMiddle = { v: 1, ts: '2026-11-24T00:01:00Z', ticket: 'T42', persona: 'middle', event: 'verdict', verdict: 'pass' };

  const a = writeScenario('a', thumbReport, [doneThumb]);
  check('pairing: completed report with a matching done event holds', a.length === 0, a.join('; '));
  const b = writeScenario('b', thumbReport, []);
  check('pairing: completed report without a done event is flagged', b.length === 1 && /completed/.test(b[0]), b.join('; '));
  const c = writeScenario('c', middleReview, [doneMiddle, verdictMiddle]);
  check('pairing: review verdict pass with a matching board verdict holds', c.length === 0, c.join('; '));
  const d = writeScenario('d', middleReview, [doneMiddle]);
  check('pairing: review verdict pass without a board verdict is flagged', d.length === 1 && /verdict/.test(d[0]), d.join('; '));
  const e = writeScenario('e', ringReport, []);
  check('pairing: partial report makes no completion claim, no violation', e.length === 0, e.join('; '));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- Summary ----
const total = passed + failed;
if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${passed}/${total} checks passed (${failed} failed)`);
} else {
  console.log(`\n${total}/${total} checks passed`);
}
