'use strict';
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..', '..');
const { evaluateToolGuard } = require(path.join(root, 'dist', 'guard', 'engine.js'));
const { piGuardMap } = require(path.join(root, 'dist', 'harness', 'pi', 'guard-map.js'));

const corpus = [
  { toolName: 'bash', command: 'echo `rm -rf src`', block: true },
  { toolName: 'bash', command: 'echo `rm -rf src`', block: true },
  { toolName: 'bash', command: 'echo $(rm -rf src)', block: true },
  { toolName: 'bash', command: 'rm -rf src', block: true },
  { toolName: 'bash', command: 'git status', block: false },
  { toolName: 'powershell', command: 'echo `rm -rf src`', block: false },
  { toolName: 'powershell', command: 'rm -rf src', block: true },
];

for (const test of corpus) {
  const decision = evaluateToolGuard('readonly', {
    toolName: test.toolName,
    input: { command: test.command },
    cwd: root,
    scratchDirs: [],
    persona: 'worker',
    harness: {
      ...piGuardMap,
      shellKind: test.toolName === 'bash' ? 'posix' : test.toolName === 'powershell' ? 'powershell' : piGuardMap.shellKind,
    },
  });
  const actual = decision.block;
  console.log(`${test.toolName}\t${test.command}\t${actual ? 'BLOCK' : 'allow'}`);
  if (actual !== test.block) {
    console.error(`Expected ${test.block ? 'BLOCK' : 'allow'}${decision.reason ? `: ${decision.reason}` : ''}`);
    process.exitCode = 1;
  }
}
