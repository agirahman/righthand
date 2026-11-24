'use strict';

// The bounded-contract engine. It is a plain CommonJS module (like
// registry.js / the per-harness manifest.js) and therefore is NOT compiled
// by tsc (no allowJs) nor inlined into the copy-type bundles: it consumes
// the harness registry and adds no core-file dependency.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const registry = require('../registry');

// Max fresh-context retries for one slice (Fase 3: "maksimal 5 iterasi").
const MAX_ITERATIONS = 5;

const repoRoot = path.join(__dirname, '..', '..');

function resolveIn(manifests, keyOrAlias) {
  const ms = manifests || registry.listManifests();
  const lower = String(keyOrAlias).toLowerCase();
  for (const m of ms) {
    if (m.key === lower) return m;
    if (Array.isArray(m.aliases) && m.aliases.indexOf(lower) !== -1) return m;
  }
  return null;
}

// Capability gate: the bounded slice loop + fresh-retry run ONLY where
// dispatchable === true. Non-dispatchable harnesses must take the
// council review-only path instead.
function assertDispatchable(m) {
  if (!m) {
    const err = new Error('unknown harness for the engine');
    err.code = 'UNKNOWN_HARNESS';
    throw err;
  }
  if (m.dispatchable !== true) {
    const err = new Error(
      "harness '" + m.key + "' is not dispatchable; the bounded slice loop requires a " +
      'dispatchable harness. Use the council review-only path for non-dispatchable harnesses.'
    );
    err.code = 'NOT_DISPATCHABLE';
    err.harness = m.key;
    throw err;
  }
  return true;
}

function launchSpec(m, persona, resolution) {
  if (typeof m.buildLaunch !== 'function') {
    const err = new Error("dispatchable harness '" + m.key + "' has no buildLaunch hook");
    err.code = 'NO_BUILD_LAUNCH';
    throw err;
  }
  return m.buildLaunch(persona, resolution || {});
}

// Default headless launch: spawn the spec's { bin, args, env } and capture output.
function defaultLaunch(spec, opts) {
  const env = Object.assign({}, process.env, spec.env || {});
  const r = spawnSync(spec.bin, spec.args || [], {
    cwd: opts.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutMs || 300000,
    env,
  });
  return {
    bin: spec.bin,
    args: spec.args || [],
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function summarize(tries) {
  const lines = ['# slice summary', ''];
  lines.push('Attempts so far: ' + tries.length);
  for (const t of tries) {
    lines.push('- attempt ' + t.attempt + ': gate=' + t.gate + ' guard=' + t.guard +
      (t.result && typeof t.result.status === 'number' ? ' exit=' + t.result.status : ''));
  }
  return lines.join('\n') + '\n';
}

// The bounded slice loop. launch / gate / guard are injectable so the loop is
// testable without a real model; by default it really spawns the headless launch.
function runSlice(opts) {
  opts = opts || {};
  const m = resolveIn(opts.manifests, opts.harness);
  assertDispatchable(m);

  const persona = opts.persona || 'thumb';
  const sliceId = opts.sliceId || 'slice';
  const maxIterations = Math.max(1, opts.maxIterations || MAX_ITERATIONS);
  const historyDir = opts.historyDir || path.join(repoRoot, '.righthand', 'history');
  const worktreeDir = opts.worktreeDir || path.join(repoRoot, '.righthand', 'worktrees');
  const historyFile = path.join(historyDir, sliceId + '.md');
  const worktreePath = path.join(worktreeDir, sliceId);
  const launch = typeof opts.launch === 'function' ? opts.launch : function (spec, o) { return defaultLaunch(spec, o); };
  const gate = typeof opts.gate === 'function' ? opts.gate : function (result) { return result && result.status === 0; };
  const guard = typeof opts.guard === 'function' ? opts.guard : function () { return true; };

  fs.mkdirSync(worktreePath, { recursive: true });

  const tries = [];
  let attempt = 0;
  let last = null;
  while (attempt < maxIterations) {
    attempt += 1;
    // Fresh-context retry: from the second attempt, hand the agent a summary of
    // what already happened so a clean context converges instead of re-looping.
    const injected = attempt === 1 ? undefined : readHistory(historyFile);
    const resolution = { model: opts.model, slice: sliceId, attempt: attempt, injected: injected };
    const spec = launchSpec(m, persona, resolution);
    const result = launch(spec, Object.assign({}, opts, { cwd: worktreePath, slice: sliceId, attempt: attempt, injected: injected }));
    last = { attempt: attempt, spec: spec, result: result, gate: gate(result), guard: guard(result) };
    tries.push(last);
    writeHistory(historyFile, summarize(tries));
    if (last.gate && last.guard) {
      return { ok: true, harness: m.key, sliceId: sliceId, persona: persona, attempts: attempt, final: last, worktree: worktreePath };
    }
  }
  return { ok: false, harness: m.key, sliceId: sliceId, persona: persona, attempts: attempt, final: last, reason: 'max-iterations', worktree: worktreePath };
}

function readHistory(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return ''; }
}
function writeHistory(file, text) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
  } catch (e) { /* history is best-effort; the loop still converges */ }
}

// Council review-only path (Fase 4 hardens this into the multi-model council).
// It is harness-agnostic and needs NO dispatchable harness: it runs the guard
// prompt against a diff and returns STRUCTURED findings, never a 1-10 score.
function councilReview(opts) {
  opts = opts || {};
  const m = resolveIn(opts.manifests, opts.harness); // may be null / non-dispatchable
  const reviewers = Array.isArray(opts.reviewers) ? opts.reviewers : [];
  const diff = typeof opts.diff === 'string' ? opts.diff : '';
  const findings = { regressions: [], contractViolations: [] };
  for (const rv of reviewers) {
    const out = rv && typeof rv.review === 'function' ? rv.review(diff) : {};
    rejectScore(out);
    collect(findings, out && out.regressions, 'regressions');
    collect(findings, out && out.contractViolations, 'contractViolations');
  }
  return { harness: m ? m.key : null, findings: findings };
}
// One-screen chairman synthesis (palm). Renders structured findings into a
// compact report that names every regression and contract violation by
// file:line. There is deliberately NO numeric 1-10 score field anywhere.
function synthesizeCouncilReport(findings, opts) {
  opts = opts || {};
  const reg = findings && Array.isArray(findings.regressions) ? findings.regressions : [];
  const cv = findings && Array.isArray(findings.contractViolations) ? findings.contractViolations : [];
  const models = opts.models || [];
  const lines = ['# Council report', ''];
  lines.push('Chairman: ' + (opts.chairman || 'palm'));
  lines.push('Models: ' + (models.length ? models.join(', ') : 'n/a'));
  lines.push('');
  lines.push('## Regressions (' + reg.length + ')');
  if (reg.length === 0) lines.push('- none');
  for (const f of reg) {
    const loc = (f.file || '?') + (f.line ? ':' + f.line : '');
    lines.push('- ' + loc);
    if (f.note) lines.push('  ' + f.note);
  }
  lines.push('');
  lines.push('## Contract violations (' + cv.length + ')');
  if (cv.length === 0) lines.push('- none');
  for (const f of cv) {
    const loc = (f.file || '?') + (f.line ? ':' + f.line : '');
    lines.push('- ' + loc);
    if (f.note) lines.push('  ' + f.note);
  }
  const total = reg.length + cv.length;
  lines.push('');
  lines.push('Verdict: ' + (total === 0
    ? 'no regressions or contract violations found'
    : total + ' finding(s) need attention before merge'));
  return lines.join('\n') + '\n';
}

// Parallel multi-model council path: fan out to N reviewers concurrently.
// Each reviewer.review(diff) may be sync or async; a reviewer may be a real
// model launch or an injectable stub for tests. Findings are merged and the
// numeric-score ban is enforced by the shared collector.
async function councilReviewAsync(opts) {
  opts = opts || {};
  const m = resolveIn(opts.manifests, opts.harness);
  const reviewers = Array.isArray(opts.reviewers) ? opts.reviewers : [];
  const diff = typeof opts.diff === 'string' ? opts.diff : '';
  const outs = await Promise.all(reviewers.map(function (rv) {
    if (!rv || typeof rv.review !== 'function') return null;
    return Promise.resolve(rv.review(diff));
  }));
  const findings = { regressions: [], contractViolations: [] };
  for (const out of outs) {
    if (out == null) continue;
    rejectScore(out);
    collect(findings, out.regressions, 'regressions');
    collect(findings, out.contractViolations, 'contractViolations');
  }
  return {
    harness: m ? m.key : null,
    findings: findings,
    report: synthesizeCouncilReport(findings, { models: opts.models, chairman: opts.chairman }),
  };
}

function collect(findings, list, target) {
  if (!Array.isArray(list)) return;
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    if (typeof f.score === 'number') {
      const err = new Error('council findings must not carry a numeric score field');
      err.code = 'NUMERIC_SCORE';
      throw err;
    }
    const entry = { file: String(f.file || ''), note: String(f.note || '') };
    if (f.line) entry.line = f.line;
    if (f.severity) entry.severity = f.severity;
    findings[target].push(entry);
  }
}

// A reviewer's output may also carry a top-level numeric score; reject it here
// so the ban holds at the reviewer level, not just per finding.
function rejectScore(out) {
  if (out && typeof out.score === 'number') {
    const err = new Error('council findings must not carry a numeric score field');
    err.code = 'NUMERIC_SCORE';
    throw err;
  }
}

module.exports = {
  MAX_ITERATIONS: MAX_ITERATIONS,
  resolveIn: resolveIn,
  assertDispatchable: assertDispatchable,
  launchSpec: launchSpec,
  runSlice: runSlice,
  councilReview: councilReview,
  councilReviewAsync: councilReviewAsync,
  synthesizeCouncilReport: synthesizeCouncilReport,
};
