'use strict';

const opencodeLaunch = require('./launch');

module.exports = {
  key: 'opencode',
  type: 'copy',
  aliases: [],
  label: 'OpenCode',
  pathCheck: ['opencode'],
  destBase: 'home',
  dispatchable: true,
  buildLaunch: opencodeLaunch.buildLaunch,
  legacyFiles: [
    'opencode/plugins/righthand-server.js',
    'opencode/plugins/righthand-tui.js',
  ],
  files: [
    { src: '.opencode-plugin/plugins/righthand', dest: 'opencode/plugins/righthand' },
  ],
};