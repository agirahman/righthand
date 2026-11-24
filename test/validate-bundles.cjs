'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { bundle } = require('../scripts/bundle-harness.js');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-bundles-'));
let failed = 0;
function check(name, condition) {
  if (condition) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

function createFixture(name, files) {
  const fixtureRoot = path.join(tempDir, name);
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(fixtureRoot, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return fixtureRoot;
}

function capture(name, action, verify) {
  try {
    const result = action();
    check(name, verify(result));
  } catch (error) {
    check(name, false);
    console.error(`  ${error.message}`);
  }
}

function expectFailure(name, action, pattern) {
  let error;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  check(name, Boolean(error && pattern.test(error.message)));
}

function makeHost(extension, persona, profilesDir) {
  const cwd = fs.mkdtempSync(path.join(tempDir, `host-${persona}-`));
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.righthand', 'state'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.righthand', 'state', 'active-persona.json'), JSON.stringify({ active: persona }));
  fs.cpSync(profilesDir, path.join(cwd, 'profiles'), { recursive: true });
  const hooks = [];
  const commands = [];
  extension({
    on(name, handler) { hooks.push({ name, handler }); },
    registerCommand(name, config) { commands.push({ name, config }); },
  });
  const ctx = { cwd, ui: { setStatus() {}, notify() {} } };
  const corpus = [
    { name: 'write-blocked', toolName: 'write', input: { path: 'src/file.ts', content: 'x' } },
    { name: 'righthand-allowed', toolName: 'write', input: { path: '.righthand/tickets/T69/reports/result.md', content: 'x' } },
    { name: 'shell-blocked', toolName: 'bash', input: { command: 'rm -rf src/file.ts' } },
    { name: 'read-source', toolName: 'read', input: { path: 'src/file.ts' } },
    { name: 'edit-source', toolName: 'edit', input: { file_path: 'src/file.ts', old_string: 'x', new_string: 'y' } },
    { name: 'shell-safe', toolName: 'bash', input: { command: 'git status --short' } },
  ];
  const toolCall = hooks.find((hook) => hook.name === 'tool_call');
  const decisions = corpus.map((item) => ({
    name: item.name,
    block: toolCall.handler({ toolName: item.toolName, input: item.input }, ctx)?.block === true,
  }));
  return { cwd, hooks: hooks.map((hook) => hook.name), commands: commands.map((command) => command.name), decisions };
}

async function main() {
try {
  const config = {
    entry: 'harness/pi/extension.ts',
    dest: 'bundled.mjs',
    format: 'js',
    defaultExport: 'righthandExtension',
  };
  const tempPackage = path.join(tempDir, 'bundle-package');
  fs.mkdirSync(path.join(tempPackage, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tempPackage, 'package.json'), '{}\n');
  fs.cpSync(path.join(root, 'profiles'), path.join(tempPackage, 'profiles'), { recursive: true });

  const first = bundle({ ...config, outputDir: tempPackage });
  const firstPath = path.join(tempPackage, config.dest);
  const firstOutput = fs.readFileSync(firstPath, 'utf8').replace(/\r\n/g, '\n');
  const secondDir = path.join(tempDir, 'determinism');
  fs.mkdirSync(secondDir, { recursive: true });
  bundle({ ...config, outputDir: secondDir });
  const secondOutput = fs.readFileSync(path.join(secondDir, config.dest), 'utf8').replace(/\r\n/g, '\n');
  check('deterministic output is byte-identical', firstOutput === secondOutput);

  const relativeImports = Array.from(firstOutput.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g), (match) => match[1]).filter((specifier) => specifier.startsWith('.'));
  const externalImports = Array.from(firstOutput.matchAll(/\bimport\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g), (match) => match[1]);
  const importCounts = Object.fromEntries([...new Set(externalImports)].map((specifier) => [specifier, externalImports.filter((item) => item === specifier).length]));
  check('no relative import specifier survives', relativeImports.length === 0);
  check('each external specifier appears in one import statement', externalImports.length > 0 && Object.values(importCounts).every((count) => count === 1));

  const profileModes = new Map(fs.readdirSync(path.join(root, 'profiles')).filter((file) => file.endsWith('.md')).map((file) => {
    const content = fs.readFileSync(path.join(root, 'profiles', file), 'utf8');
    return [path.basename(file, '.md'), (/^mode:\s*(writer|readonly)\s*$/m.exec(content) || [])[1]];
  }));
  const sourcePath = path.join(root, 'dist', 'harness', 'pi', 'extension.js');
  if (!fs.existsSync(sourcePath)) throw new Error('dist/harness/pi/extension.js missing - run npm run build first');
  const sourceExtension = require(sourcePath).default;
  const bundledExtension = (await import(pathToFileURL(firstPath).href)).default;
  const parity = [];
  const scratchDir = path.join(tempDir, 'scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  const previousScratchpad = process.env.COMMANDCODE_SCRATCHPAD;
  process.env.COMMANDCODE_SCRATCHPAD = scratchDir;
  try {
    for (const [persona, mode] of profileModes) {
      const sourceRecord = makeHost(sourceExtension, persona, path.join(root, 'profiles'));
      const bundledRecord = makeHost(bundledExtension, persona, path.join(tempPackage, 'profiles'));
      parity.push({ persona, mode, source: sourceRecord, bundled: bundledRecord });
      assert.deepEqual(bundledRecord.hooks, sourceRecord.hooks);
      assert.deepEqual(bundledRecord.commands, sourceRecord.commands);
      assert.deepEqual(bundledRecord.decisions, sourceRecord.decisions);
      fs.rmSync(sourceRecord.cwd, { recursive: true, force: true });
      fs.rmSync(bundledRecord.cwd, { recursive: true, force: true });
    }
  } finally {
    if (previousScratchpad === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
    else process.env.COMMANDCODE_SCRATCHPAD = previousScratchpad;
  }
  check('round-trip deep-equal: bundled Pi and source adapter for all 6 personas', parity.length === 6);
  const readonlyRecord = parity.find((item) => item.persona === 'middle');
  const writerRecord = parity.find((item) => item.persona === 'thumb');
  check('readonly corpus blocks writes and shell mutation, allows .righthand/, and matches all six source/bundle calls', readonlyRecord?.source.decisions.map((item) => item.block).join(',') === 'true,false,true,false,true,false' && assert.deepEqual(readonlyRecord.bundled.decisions, readonlyRecord.source.decisions) === undefined);
  check('writer corpus allows all six calls and matches source/bundle', writerRecord?.source.decisions.map((item) => item.block).join(',') === 'false,false,false,false,false,false' && assert.deepEqual(writerRecord.bundled.decisions, writerRecord.source.decisions) === undefined);
  console.log(`EVIDENCE: ${JSON.stringify({ readonly: readonlyRecord, writer: writerRecord }, null, 2)}`);

  const bundleInfo = first.results[0].info;
  const profileModeCount = bundleInfo.files.flatMap((item) => Array.from(item.source.matchAll(/^(?:export\s+)?type\s+ProfileMode\s*=/gm))).length - bundleInfo.duplicateDrops.filter((item) => item.name === 'ProfileMode').length;
  check('ProfileMode collision resolves to exactly one emitted declaration', profileModeCount === 1 && bundleInfo.duplicateDrops.some((item) => item.name === 'ProfileMode'));
  const fixtureRoot = path.join(tempDir, 'drift-fixture');
  const fixtureConfigDir = path.join(fixtureRoot, 'harness', 'demo');
  const fixtureDest = path.join(fixtureRoot, 'generated', 'demo.txt');
  fs.mkdirSync(fixtureConfigDir, { recursive: true });
  fs.mkdirSync(path.dirname(fixtureDest), { recursive: true });
  fs.writeFileSync(path.join(fixtureConfigDir, 'bundle.config.cjs'), "module.exports = { entry: 'harness/demo/extension.ts', dest: 'generated/demo.txt', format: 'ts', defaultExport: 'demoExtension' };\n");
  fs.writeFileSync(path.join(fixtureConfigDir, 'extension.ts'), "export default function demoExtension(api) { api.on('x', () => {}); }\n");
  const driftContent = 'deliberately stale tracked output\n';
  fs.writeFileSync(fixtureDest, driftContent);
  assert.throws(() => bundle({ rootDir: fixtureRoot, check: true }), /Bundle drift: generated\/demo\.txt/);
  check('drift check fails without changing tracked output', fs.readFileSync(fixtureDest, 'utf8') === driftContent);
  const fixtureOutput = bundle({ rootDir: fixtureRoot }).results[0].output;
  fs.writeFileSync(fixtureDest, fixtureOutput);
  assert.doesNotThrow(() => bundle({ rootDir: fixtureRoot, check: true }));
  check('drift check passes when tracked output matches', fs.readFileSync(fixtureDest, 'utf8') === fixtureOutput);

  const reexportRoot = path.join(tempDir, 'reexport-fixture');
  const reexportDir = path.join(reexportRoot, 'harness', 'demo');
  fs.mkdirSync(reexportDir, { recursive: true });
  fs.writeFileSync(path.join(reexportDir, 'extension.ts'), "import { helper } from './index';\nexport default function demoExtension() { return helper(); }\n");
  fs.writeFileSync(path.join(reexportDir, 'index.ts'), "export { helper } from './helper';\nexport type {\n  HelperType\n} from './types';\n");
  fs.writeFileSync(path.join(reexportDir, 'helper.ts'), 'export function helper() { return 1; }\n');
  fs.writeFileSync(path.join(reexportDir, 'types.ts'), 'export type HelperType = string;\n');
  const reexport = bundle({ rootDir: reexportRoot, entry: 'harness/demo/extension.ts', dest: 'demo.mjs', format: 'ts', defaultExport: 'demoExtension' });
  check('re-export-only modules are included in the graph', reexport.results[0].output.includes('function helper() { return 1; }') && reexport.results[0].output.includes('type HelperType = string;') && !reexport.results[0].output.includes('export type { HelperType }'));

  const multiImportRoot = createFixture('multiline-import-fixture', {
    'harness/demo/extension.ts': "import {\n  helper\n} from './helper.js';\nexport default function demoExtension() { return helper(); }\n",
    'harness/demo/helper.ts': 'export function helper() { return 42; }\n',
  });
  const multiImport = bundle({ rootDir: multiImportRoot, entry: 'harness/demo/extension.ts', dest: 'demo.ts', format: 'ts', defaultExport: 'demoExtension' }).results[0].output;
  check('multi-line imports inline dependencies and leave no relative specifier', multiImport.includes('function helper() { return 42; }') && !/from\s+['"]\./.test(multiImport));

  const duplicateOffsetRoot = createFixture('duplicate-offset-fixture', {
    'harness/demo/extension.ts': "type Repeated = 'same';\ntype Repeated = 'same';\ntype Repeated = 'same';\nconst survivor = 'SURVIVE_AFTER_DUPLICATES';\nexport default function demoExtension() { return survivor; }\n",
  });
  const duplicateOffset = bundle({ rootDir: duplicateOffsetRoot, entry: 'harness/demo/extension.ts', dest: 'demo.ts', format: 'ts', defaultExport: 'demoExtension' }).results[0];
  check('multiple duplicate ranges are removed without corrupting adjacent source', duplicateOffset.output.includes("const survivor = 'SURVIVE_AFTER_DUPLICATES';") && (duplicateOffset.output.match(/type Repeated/g) || []).length === 1 && duplicateOffset.info.duplicateDrops.length === 2);

  const multilineTypeRoot = createFixture('multiline-type-fixture', {
    'harness/demo/extension.ts': "import { first } from './first';\nimport './second';\nexport default function demoExtension() { return first; }\n",
    'harness/demo/first.ts': "export type Shared =\n  | 'first';\nexport const first = 1;\n",
    'harness/demo/second.ts': "export type Shared =\n  | 'second';\n",
  });
  expectFailure('different multi-line types are not treated as identical duplicates', () => bundle({ rootDir: multilineTypeRoot, entry: 'harness/demo/extension.ts', dest: 'demo.ts', format: 'ts', defaultExport: 'demoExtension' }), /Duplicate top-level declaration 'Shared'/);

  const externalRoot = createFixture('ambient-stub-fixture', {
    'harness/demo/extension.ts': "import { externalValue } from '@righthand-fixture/missing-package';\nexport default function demoExtension() { return externalValue(); }\n",
  });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(externalRoot, 'node_modules'), 'junction');
  capture('uninstalled external runtime imports compile with ambient stubs', () => bundle({ rootDir: externalRoot, entry: 'harness/demo/extension.ts', dest: 'demo.mjs', format: 'js', defaultExport: 'demoExtension' }).results[0].output, (output) => /@righthand-fixture\/missing-package/.test(output));

  const maskedSyntaxRoot = createFixture('masked-syntax-fixture', {
    'harness/demo/extension.ts': "const template = `\nimport { phantom } from './template-missing';\ntype Ghost = 'template';\n`;\n/*\nimport { phantom } from './comment-missing';\ntype Ghost = 'comment';\n*/\ntype Ghost = 'real';\nexport default function demoExtension() { return template; }\n",
  });
  capture('comments and template contents are ignored by scanners', () => bundle({ rootDir: maskedSyntaxRoot, entry: 'harness/demo/extension.ts', dest: 'demo.ts', format: 'ts', defaultExport: 'demoExtension' }).results[0].output, (output) => output.includes("type Ghost = 'real';") && output.includes("type Ghost = 'template';") && output.includes("type Ghost = 'comment';"));

  const arrayConfigRoot = createFixture('array-config-fixture', {
    'harness/demo/bundle.config.cjs': "module.exports = [{ entry: 'harness/demo/one.ts', dest: 'one.ts', format: 'ts', defaultExport: 'one' }, { entry: 'harness/demo/two.ts', dest: 'two.ts', format: 'ts', defaultExport: 'two' }];\n",
    'harness/demo/one.ts': 'export default function one() {}\n',
    'harness/demo/two.ts': 'export default function two() {}\n',
  });
  check('array bundle configs produce every configured bundle', bundle({ rootDir: arrayConfigRoot }).count === 2);

  const negativeRoot = createFixture('negative-fixtures', {
    'harness/demo/extension.ts': "import { first } from './first';\nexport default function demoExtension() { return first; }\n",
    'harness/demo/first.ts': "import { second } from './second';\nexport const first = second;\n",
    'harness/demo/second.ts': "import { first } from './first';\nexport const second = first;\n",
    'harness/demo/unresolved.ts': "import { missing } from './missing';\nexport default function demoExtension() { return missing; }\n",
    'harness/demo/unsupported.ts': 'export default () => 1;\n',
    'harness/demo/escaping.ts': "import { outside } from '../../../outside.js';\nexport default function demoExtension() { return outside; }\n",
  });
  fs.writeFileSync(path.join(tempDir, 'outside.ts'), 'export const outside = 1;\n');
  const negativeConfig = (entry) => ({ rootDir: negativeRoot, entry, dest: 'out.ts', format: 'ts', defaultExport: entry === 'harness/demo/unsupported.ts' ? 'unsupported' : 'demoExtension' });
  expectFailure('circular imports are refused', () => bundle(negativeConfig('harness/demo/extension.ts')), /Circular relative import/);
  expectFailure('unresolvable relative imports are refused', () => bundle(negativeConfig('harness/demo/unresolved.ts')), /Cannot resolve relative import/);
  expectFailure('unsupported default exports are refused', () => bundle(negativeConfig('harness/demo/unsupported.ts')), /Unsupported default export form/);
  expectFailure('imports escaping the repository are refused', () => bundle(negativeConfig('harness/demo/escaping.ts')), /Relative import escapes repository root/);

  const drift = spawnSync(process.execPath, [path.join(root, 'scripts', 'bundle-harness.js'), '--check'], { cwd: root, encoding: 'utf8', shell: false });
  const driftOutput = `${drift.stdout || ''}${drift.stderr || ''}`;
  const bundleCount = require('../scripts/bundle-harness.js').bundle({ check: true }).count;
  check('CLI check reports the expected repository bundle total',
    drift.status === 0 && /Summary: 3 discovered configs? \(3 bundles?\)\./.test(driftOutput));
  check('CLI bundle count agrees with the independent repository total', bundleCount === 3);
  if (drift.stdout) process.stdout.write(drift.stdout);
  if (drift.stderr) process.stderr.write(drift.stderr);

  if (failed > 0) {
    console.error(`\nBundle validation FAILED with ${failed} errors.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`FAIL: bundle validation threw: ${error.stack || error.message}`);
  failed++;
  console.error(`\nBundle validation FAILED with ${failed} errors.`);
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
}

main().catch((error) => {
  console.error(`FAIL: bundle validation threw: ${error.stack || error.message}`);
  console.error('\nBundle validation FAILED with 1 errors.');
  process.exitCode = 1;
});
