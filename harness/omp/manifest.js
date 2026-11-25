'use strict';

const os = require('os');
const path = require('path');

const ompLaunch = require('./launch');

module.exports = {
  key: 'omp',
  type: 'copy',
  aliases: [],
  label: 'Oh-My-Pi (OMP)',
  pathCheck: [],
  destBase: 'omp',
  dispatchable: true,
  buildLaunch: ompLaunch.buildLaunch,
  files: [
    { src: '.omp/extensions/righthand.ts', dest: 'agent/extensions/righthand.ts' },
  ],
  skillsTarget(opts) {
    opts = opts || {};
    const candidates = [
      opts.dest,
      opts.destination,
      opts.target,
      opts.targetDir,
      opts.destDir,
    ];
    for (const candidate of candidates) {
      if (candidate) return candidate;
    }
    // OMP keeps its tree under $PI_CONFIG_DIR when that override is set,
    // otherwise ~/.omp; both match where resolveDestBase() places files.
    const base = process.env.PI_CONFIG_DIR || path.join(opts.home || os.homedir(), '.omp');
    return path.join(base, 'agent', 'skills');
  },
};
