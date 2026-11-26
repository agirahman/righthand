'use strict';

const os = require('os');
const path = require('path');
const opencodeLaunch = require('./launch');

function skillsTarget(opts) {
  opts = opts || {};
  const candidates = [opts.dest, opts.destination, opts.target, opts.targetDir, opts.destDir];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  const home = opts.home || os.homedir();
  return path.join(home, '.config', 'opencode', 'skills');
}

module.exports = {
  key: 'opencode',
  type: 'copy',
  aliases: [],
  label: 'OpenCode',
  pathCheck: ['opencode'],
  destBase: 'home',
  dispatchable: true,
  buildLaunch: opencodeLaunch.buildLaunch,
  skillsTarget: skillsTarget,
  legacyFiles: [
    'opencode/plugins/righthand-server.js',
    'opencode/plugins/righthand-tui.js',
  ],
  files: [
    { src: '.opencode-plugin/plugins/righthand', dest: 'opencode/plugins/righthand' },
  ],
};