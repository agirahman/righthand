#!/usr/bin/env node
'use strict';
/* validate-council-findings.cjs
 * Fase 4 council checks. The council is the harness-agnostic review path: it
 * merges structured findings (regressions + contract violations) from a
 * multi-model fan-out, synthesizes a one-screen report, and refuses any
 * numeric score field. The CLI "righthand council --print" must exit 0 and
 * list the per-model guard launch commands without spawning a model.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const engine = require('../harness/engine');

let ok = true;
function check(name, cond, detail) {
  if (cond) {
    console.log('PASS ' + name);
  } else {
    ok = false;
    console.log('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
}

// 1. synthesizeCouncilReport renders structured findings, no numeric score.
const findings = {
  regressions: [{ file: 'src/a.ts', line: 10, note: 'gate now skips the readonly check' }],
  contractViolations: [{ file: 'src/b.ts', line: 3, note: 'throws on null input, contract said undefined' }],
};
const report = engine.synthesizeCouncilReport(findings, { models: ['pi', 'cmdc'], diff: 'diff...x' });
check('report has a Regressions section', report.includes('## Regressions'), report);
check('report has a Contract violations section', report.includes('## Contract violations'), report);
check('report shows file:line refs', report.includes('src/a.ts:10') && report.includes('src/b.ts:3'), report);
check('report has a Verdict line', report.includes('Verdict'), report);
check('report carries no numeric score', !/score/i.test(report), report);
check('empty findings still yields a verdict', engine.synthesizeCouncilReport({ regressions: [], contractViolations: [] }, {}).includes('Verdict'));

// 2-5 async council + numeric-score rejection + CLI + persisted body.
(async () => {
  const merged = await engine.councilReviewAsync({
    harness: 'pi',
    diff: 'diff',
    models: ['pi', 'cmdc', 'omp'],
    chairman: 'palm',
    reviewers: [
      {
        review: () => {
          return { regressions: [{ file: 'f.ts', line: 1, note: 'r-a' }], contractViolations: [] };
        },
      },
      {
        review: () => {
          return { regressions: [], contractViolations: [{ file: 'g.ts', line: 2, note: 'c-b' }] };
        },
      },
    ],
  });
  check('async council merges regressions across models', merged.findings.regressions.length === 1 && merged.findings.regressions[0].note === 'r-a', JSON.stringify(merged.findings));
  check('async council merges contract violations across models', merged.findings.contractViolations.length === 1 && merged.findings.contractViolations[0].note === 'c-b', JSON.stringify(merged.findings));
  check('async council returns a one-screen report', typeof merged.report === 'string' && merged.report.includes('Verdict'));

  let scoreErr = null;
  try {
    await engine.councilReviewAsync({
      harness: 'pi',
      diff: 'd',
      models: ['pi'],
      chairman: 'palm',
      reviewers: [{ review: () => ({ score: 7, regressions: [], contractViolations: [] }) }],
    });
  } catch (e) {
    scoreErr = e;
  }
  check('council rejects a numeric score field', scoreErr && String(scoreErr.code || '').indexOf('NUMERIC_SCORE') !== -1, scoreErr ? scoreErr.code : 'no throw');

  const cli = spawnSync('node', [path.join(root, 'bin', 'righthand.js'), 'council', '--models', 'pi,cmdc', '--print'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  check('righthand council --print exits 0', cli.status === 0, 'exit ' + cli.status + ' stderr ' + String(cli.stderr).slice(0, 200));
  check('council --print lists the per-model guard launch commands', String(cli.stdout).includes('pi ->') && String(cli.stdout).includes('cmdc ->'), String(cli.stdout).slice(0, 200));
  check('council --print is review-only (names palm as chairman)', String(cli.stdout).includes('Chairman: palm'), String(cli.stdout).slice(0, 200));

  const sampleReport = engine.synthesizeCouncilReport(
    { regressions: [{ file: 'x.ts', line: 1, note: 'n' }], contractViolations: [] },
    { models: ['pi'], diff: 'd' }
  );
  check('persisted council body has no score token', !/\bscore\b/i.test(sampleReport), sampleReport);

  if (ok) {
    console.log('OK: council-findings (findings are structured, no numeric scores, council --print is safe)');
    process.exit(0);
  }
  console.log('FAIL council-findings');
  process.exit(1);
})();
