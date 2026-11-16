module.exports = [
  { entry: 'harness/opencode/extension.ts', dest: '.opencode-plugin/plugins/righthand-server.js', format: 'js', defaultExport: 'righthandOpenCodePlugin' },
  { entry: 'harness/opencode/tui.tsx', dest: '.opencode-plugin/plugins/righthand-tui.js', format: 'js', defaultExport: 'righthandOpenCodeTui' },
];
