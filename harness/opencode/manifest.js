'use strict';

module.exports = {
  key: 'opencode',
  type: 'copy',
  aliases: [],
  label: 'OpenCode',
  pathCheck: ['opencode'],
  destBase: 'home',
  legacyFiles: [
    '.opencode/plugins/righthand-server.js',
    '.opencode/plugins/righthand-tui.js',
  ],
  files: [
    { src: '.opencode-plugin/plugins/righthand-server.js', dest: 'opencode/plugins/righthand-server.js' },
    { src: '.opencode-plugin/plugins/righthand-tui.js',    dest: 'opencode/plugins/righthand-tui.js' },
  ],
};