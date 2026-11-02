const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modPath = path.join(root, '.commandcode-mod', 'mods', 'righthand.ts');
const src = fs.readFileSync(modPath, 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', js)(mod.exports, require, mod, modPath, path.dirname(modPath));
const { evaluateToolGuard } = mod.exports;

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

const rootPath = 'C:\\repo';
const scratchDir = 'C:\\scratch';

function ctx(toolName, filePath, cwd = rootPath, extra = {}) {
  return {
    toolName,
    input: toolName === 'shell_command' ? { command: filePath } : { file_path: filePath },
    cwd,
    scratchDirs: [scratchDir],
    ...extra,
  };
}

// readonly persona
check('readonly write_file to src/x.js blocked', evaluateToolGuard('readonly', ctx('write_file', path.join(rootPath, 'src', 'x.js'))).block === true);
check('readonly write_file to .righthand reports allowed', evaluateToolGuard('readonly', ctx('write_file', path.join(rootPath, '.righthand', 'tickets', 'T18', 'reports', 'a.md'))).block === false);
check('readonly edit_file to .righthand reviews allowed', evaluateToolGuard('readonly', ctx('edit_file', path.join(rootPath, '.righthand', 'tickets', 'T18', 'reviews', 'r.md'))).block === false);
check('readonly write_file traversal blocked', evaluateToolGuard('readonly', ctx('write_file', rootPath + '\\.righthand\\tickets\\T18\\..\\..\\src\\x.js')).block === true);
check('readonly write_file home .commandcode blocked', evaluateToolGuard('readonly', ctx('write_file', 'C:\\Users\\someone\\.commandcode\\mods\\righthand.ts')).block === true);
check('readonly write_file scratch allowed', evaluateToolGuard('readonly', ctx('write_file', path.join(scratchDir, 'probe.js'))).block === false);
check('readonly shell echo redirect blocked', evaluateToolGuard('readonly', ctx('shell_command', 'echo hi > src/x.js')).block === true);
check('readonly shell rm blocked', evaluateToolGuard('readonly', ctx('shell_command', 'rm -rf src')).block === true);
check('readonly shell npm test allowed', evaluateToolGuard('readonly', ctx('shell_command', 'npm test')).block === false);
check('readonly shell node scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `node ${scratchDir}\\probe.js`)).block === false);
// fix: expect blocked
check('readonly shell node src/x.js blocked', evaluateToolGuard('readonly', ctx('shell_command', 'node src/x.js')).block === true);
check('readonly read_file allowed', evaluateToolGuard('readonly', { toolName: 'read_file', input: { file_path: path.join(rootPath, 'src', 'x.js') }, cwd: rootPath, scratchDirs: [scratchDir] }).block === false);
check('readonly grep allowed', evaluateToolGuard('readonly', { toolName: 'grep', input: { pattern: 'x' }, cwd: rootPath, scratchDirs: [scratchDir] }).block === false);
check('writer write_file allowed', evaluateToolGuard('writer', ctx('write_file', path.join(rootPath, 'src', 'x.js'))).block === false);
check('null write_file allowed', evaluateToolGuard(null, ctx('write_file', path.join(rootPath, 'src', 'x.js'))).block === false);
check('relative path resolution blocked', evaluateToolGuard('readonly', { toolName: 'write_file', input: { file_path: 'src/x.js' }, cwd: rootPath, scratchDirs: [scratchDir] }).block === true);

if (failed > 0) {
  console.error(`\nValidation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log('\nALL readonly checks passed!');