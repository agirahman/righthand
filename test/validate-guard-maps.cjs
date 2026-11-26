'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const maps = {
  cmdc: require(path.join(root, 'dist', 'harness', 'cmdc', 'guard-map.js')).cmdcGuardMap,
  omp: require(path.join(root, 'dist', 'harness', 'omp', 'guard-map.js')).ompGuardMap,
  opencode: require(path.join(root, 'dist', 'harness', 'opencode', 'guard-map.js')).openCodeGuardMap,
  pi: require(path.join(root, 'dist', 'harness', 'pi', 'guard-map.js')).piGuardMap,
};

for (const [name, map] of Object.entries(maps)) {
  assert.ok(Array.isArray(map.shellTools), name + ' shellTools must be an array');
  assert.ok(map.shellTools.includes('shell'), name + ' must recognize the shell tool emitted by harness agents');
  assert.ok(map.shellTools.includes('powershell'), name + ' must recognize the powershell tool');
  assert.ok(map.shellTools.includes('bash'), name + ' must recognize the bash tool');
  console.log('OK ' + name + ' guard map recognizes shell, powershell, and bash');
}
