#!/usr/bin/env node
'use strict';

// Validates the bounded-contract engine (Fase 3). It checks the capability
// gate (loop + fresh-retry only where dispatchable === true), the council
// review-only path for non-dispatchable harnesses (structured findings, no
// numeric score), fresh-context retry, and that a 5th harness stays a folder
// add picked up by the engine without touching any core file.

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const engine = require(path.join(repoRoot, 'harness', 'engine'));
const registry = require(path.join(repoRoot, 'harness', 'registry'));

let failed = 0;
let passed = 0;
function check(label, fn) {
  try { fn(); console.log('OK: ' + label); passed++; }
  catch (e) { console.error('FAIL: ' + label + ' -> ' + (e && e.message ? e.message : e)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function mkTmp(p) { return fs.mkdtempSync(path.join(os.tmpdir(), p)); }
function rmTmp(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }

check('runSlice throws NOT_DISPATCHABLE on a non-dispatchable harness (omp)', () => {
  let threw = null;
  try {
    engine.runSlice({ harness: 'omp', sliceId: 's', persona: 'thumb', launch: () => ({ bin: 'noop' }), gate: () => true, guard: () => true });
  } catch (e) { threw = e; }
  assert(threw && threw.code === 'NOT_DISPATCHABLE', 'expected NOT_DISPATCHABLE, got ' + (threw && threw.code));
});

check('runSlice throws NOT_DISPATCHABLE on a non-dispatchable harness (opencode)', () => {
  let threw = null;
  try {
    engine.runSlice({ harness: 'opencode', sliceId: 's', persona: 'thumb', launch: () => ({ bin: 'noop' }), gate: () => true, guard: () => true });
  } catch (e) { threw = e; }
  assert(threw && threw.code === 'NOT_DISPATCHABLE', 'expected NOT_DISPATCHABLE, got ' + (threw && threw.code));
});

check('councilReview is a review-only path that works on a non-dispatchable harness', () => {
  const reviewers = [{
    review: () => ({
      regressions: [{ file: 'src/a.ts', line: 3, note: 'breaks existing behavior', kind: 'regression' }],
      contractViolations: [{ file: 'src/b.ts', note: 'violates the A->B->C contract path', kind: 'violation' }],
    }),
  }];
  const r = engine.councilReview({ harness: 'omp', diff: '+ a\n- b\n', reviewers: reviewers });
  assert(r.harness === 'omp', 'harness is omp (non-dispatchable), got ' + r.harness);
  assert(Array.isArray(r.findings.regressions) && r.findings.regressions.length === 1, 'one regression finding');
  assert(Array.isArray(r.findings.contractViolations) && r.findings.contractViolations.length === 1, 'one contract-violation finding');
  assert(r.findings.regressions[0].file === 'src/a.ts' && r.findings.regressions[0].line === 3, 'finding keeps file + line refs');
  assert(typeof r.findings.score === 'undefined', 'no numeric score field on the findings');
});

check('councilReview rejects a numeric score field', () => {
  let threw = null;
  try {
    engine.councilReview({ harness: 'omp', diff: '', reviewers: [{ review: () => ({ regressions: [{ file: 'a.ts', score: 7, kind: 'regression' }] }) }] });
  } catch (e) { threw = e; }
  assert(threw && threw.code === 'NUMERIC_SCORE', 'expected NUMERIC_SCORE, got ' + (threw && threw.code));
});

check('runSlice builds the headless launch spec via pi.buildLaunch', () => {
  const hist = mkTmp('rh-engine-hist-');
  const wt = mkTmp('rh-engine-wt-');
  let specSeen = null;
  try {
    const r = engine.runSlice({
      harness: 'pi', sliceId: 'pi1', persona: 'thumb', model: 'some-model', maxIterations: 1,
      launch: (spec, o) => { specSeen = spec; return { status: 0 }; },
      gate: () => true, guard: () => true, historyDir: hist, worktreeDir: wt,
    });
    assert(r.ok === true, 'slice converges');
    assert(specSeen && specSeen.bin === 'pi', 'pi bin threaded into the launch spec');
    assert(specSeen.args.indexOf('--model') !== -1 && specSeen.args.indexOf('some-model') !== -1, 'model threaded into pi args');
    assert(specSeen.env && specSeen.env.RIGHTHAND_PERSONA === 'thumb', 'persona env var present');
  } finally { rmTmp(hist); rmTmp(wt); }
});

check('runSlice does a fresh-context retry (injected summary from attempt 2)', () => {
  const hist = mkTmp('rh-engine-hist-');
  const wt = mkTmp('rh-engine-wt-');
  const injectedByAttempt = {};
  try {
    const r = engine.runSlice({
      harness: 'pi', sliceId: 'inj', persona: 'thumb', maxIterations: 2,
      launch: (spec, o) => { injectedByAttempt[o.attempt] = o.injected; return { status: 0 }; },
      gate: () => false, guard: () => false, historyDir: hist, worktreeDir: wt,
    });
    assert(r.attempts === 2, 'two attempts, got ' + r.attempts);
    assert(r.ok === false && r.reason === 'max-iterations', 'did not converge -> max-iterations');
    assert(injectedByAttempt[1] === undefined, 'attempt 1 has no injected summary');
    assert(typeof injectedByAttempt[2] === 'string' && injectedByAttempt[2].indexOf('slice summary') !== -1,
      'attempt 2 carries an injected slice summary (fresh-context retry)');
  } finally { rmTmp(hist); rmTmp(wt); }
});

check('a 5th dispatchable harness (folder add) is discovered and driven with no core-file change', () => {
  const tmp = mkTmp('rh-engine-fixture-');
  try {
    const fixtureRoot = path.join(tmp, 'harness');
    const fifthDir = path.join(fixtureRoot, 'fifth');
    fs.mkdirSync(fifthDir, { recursive: true });
    fs.writeFileSync(path.join(fifthDir, 'manifest.js'),
      "'use strict';\n" +
      'module.exports = {\n' +
      "  key: 'fifth',\n" +
      "  type: 'spawn',\n" +
      "  bin: 'fifth',\n" +
      "  args: ['run'],\n" +
      '  aliases: [],\n' +
      "  label: 'Fifth',\n" +
      "  pathCheck: ['fifth'],\n" +
      '  dispatchable: true,\n' +
      '  buildLaunch: function (persona, res) { return { bin: \'fifth\', args: [\'run\', persona], env: { RIGHTHAND_PERSONA: persona } }; },\n' +
      '};\n', 'utf8');
    const loaded = registry.loadRegistry(fixtureRoot);
    assert(loaded.HARNESSES.fifth, 'fifth discovered in HARNESSES');
    const m = engine.resolveIn(loaded.manifests, 'fifth');
    assert(m && m.key === 'fifth', 'engine resolves the fixture manifest');
    const r = engine.runSlice({
      manifests: loaded.manifests, harness: 'fifth', sliceId: 'f5', persona: 'thumb', maxIterations: 1,
      launch: (spec) => {
        assert(spec.bin === 'fifth' && spec.args[1] === 'thumb', 'launch spec built from the fixture buildLaunch');
        return { status: 0 };
      },
      gate: () => true, guard: () => true, historyDir: path.join(tmp, 'h'), worktreeDir: path.join(tmp, 'w'),
    });
    assert(r.ok === true, 'fixture slice converges');
    assert(r.final && r.final.spec.bin === 'fifth', 'result driven by the fixture harness');
  } finally { rmTmp(tmp); }
});

check('built-in dispatchable set is unchanged (pi + cmdc)', () => {
  assert(JSON.stringify(registry.dispatchable()) === JSON.stringify(['commandcode', 'pi']),
    'dispatchable=' + registry.dispatchable());
});

if (failed > 0) {
  console.error('\nEngine-capabilities validation FAILED with ' + failed + ' errors.');
  process.exit(1);
}
console.log('\nALL engine-capabilities checks PASSED (' + passed + ').');
