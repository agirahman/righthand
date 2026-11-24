'use strict';

const ompLaunch = require('./launch');

module.exports = {
  key: 'omp',
  type: 'copy',
  aliases: [],
  label: 'Oh-My-Pi (OMP)',
  pathCheck: [],
  dispatchable: true,
  buildLaunch: ompLaunch.buildLaunch,
  files: [
    { src: '.omp/extensions/righthand.ts', dest: '.omp/extensions/righthand.ts' },
  ],
};
