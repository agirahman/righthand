'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bundle } = require('../scripts/bundle-harness.js');

const root = path.join(__dirname, '..');
const extensionPath = path.join(root, 'dist', '.omp', 'extensions', 'righthand.js');
if (!fs.existsSync(extensionPath)) {
  console.error('Missing dist/.omp/extensions/righthand.js - run npm run build first');
  process.exit(1);
}

let failed = 0;
function check(name, condition) {
  if (condition) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-omp-'));
const repoDir = path.join(base, 'repo');
const profilesDir = path.join(repoDir, 'profiles');
const statePath = path.join(repoDir, '.righthand', 'state', 'active-persona.json');
const userHome = path.join(base, 'user-home');
const previousHome = process.env.USERPROFILE;
const previousHomePosix = process.env.HOME;
const previousCwd = process.cwd();
const previousScratchpad = process.env.COMMANDCODE_SCRATCHPAD;

try {
  fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(path.join(repoDir, '.righthand', 'state'), { recursive: true });
  fs.mkdirSync(path.join(userHome, '.commandcode', 'profiles'), { recursive: true });
  fs.cpSync(path.join(root, 'profiles'), profilesDir, { recursive: true });
  fs.writeFileSync(path.join(statePath), JSON.stringify({ active: null }));
  fs.writeFileSync(path.join(userHome, '.commandcode', 'profiles', 'custom-user-persona.md'),
    '---\nname: custom-user-persona\nrole: User Custom Persona\nmode: readonly\n---\nUser-tier persona');
  process.env.USERPROFILE = userHome;
  process.env.HOME = userHome;

  const handlers = new Map();
  let command;
  const statuses = [];
  const notifications = [];
  const extension = require(extensionPath).default;
  extension({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, config) { command = { name, config }; },
  });
  const ctx = {
    cwd: repoDir,
    ui: {
      setStatus(key, value) { statuses.push({ key, value }); },
      notify(message, level) { notifications.push({ message, level }); },
      select: undefined,
    },
  };

  check('default export is a function', typeof extension === 'function');
  check('lifecycle and tool_call hooks registered',
    ['session_start', 'session_shutdown', 'before_agent_start', 'tool_call'].every((name) => handlers.has(name)));
  check('righthand command registered', command?.name === 'righthand');
  check('command description preserved', command?.config.description === 'Manage RightHand active persona (list, off, <name>)');

  process.chdir(repoDir);
  const completions = command.config.getArgumentCompletions('');
  const completionNames = completions?.map((item) => item.value) || [];
  check('completions include list, off, all shipped personas and user persona',
    ['list', 'off', 'code-reviewer', 'worker', 'custom-user-persona'].every((name) => completionNames.includes(name)) && completionNames.length === 14);
  process.chdir(previousCwd);

  const toolCall = (toolName, input) => handlers.get('tool_call')({ type: 'tool_call', toolCallId: 'test', toolName, input }, ctx);
  fs.writeFileSync(statePath, JSON.stringify({ active: 'code-reviewer' }));
  const readonlyDecisions = {
    'write src/file.ts': toolCall('write', { path: 'src/file.ts', content: 'x' })?.block === true,
    'write report': toolCall('write', { path: '.righthand/tickets/T70/reports/result.md', content: 'x' })?.block === true,
    'bash rm -rf src/file.ts': toolCall('bash', { command: 'rm -rf src/file.ts' })?.block === true,
    'bash process substitution': toolCall('bash', { command: 'cat <(rm -rf src/file.ts)' })?.block === true,
    read: toolCall('read', { path: 'src/file.ts' })?.block === true,
    grep: toolCall('grep', { pattern: 'x' })?.block === true,
    glob: toolCall('glob', { pattern: '**/*.ts' })?.block === true,
  };
  check('readonly write src/file.ts blocks', readonlyDecisions['write src/file.ts']);
  check('readonly write report allows', !readonlyDecisions['write report']);
  check('readonly bash rm -rf src/file.ts blocks', readonlyDecisions['bash rm -rf src/file.ts']);
  check('readonly read allows', !readonlyDecisions.read);
  check('readonly grep allows', !readonlyDecisions.grep);
  check('readonly glob allows', !readonlyDecisions.glob);
  check('Windows bash rm blocks under either dialect',
    process.platform !== 'win32' || readonlyDecisions['bash rm -rf src/file.ts']);
  check('Windows bash process substitution blocks under per-call POSIX dialect',
    process.platform !== 'win32' || readonlyDecisions['bash process substitution']);

  fs.writeFileSync(statePath, JSON.stringify({ active: 'worker' }));
  const writerDecisions = {
    'write src/file.ts': toolCall('write', { path: 'src/file.ts', content: 'x' })?.block === true,
    'write report': toolCall('write', { path: '.righthand/tickets/T70/reports/result.md', content: 'x' })?.block === true,
    'bash rm -rf src/file.ts': toolCall('bash', { command: 'rm -rf src/file.ts' })?.block === true,
    read: toolCall('read', { path: 'src/file.ts' })?.block === true,
    grep: toolCall('grep', { pattern: 'x' })?.block === true,
    glob: toolCall('glob', { pattern: '**/*.ts' })?.block === true,
  };
  for (const [name, blocked] of Object.entries(writerDecisions)) check(`writer ${name} allows`, !blocked);

  fs.writeFileSync(statePath, JSON.stringify({ active: null }));
  check('no active persona allows every tested tool',
    ['write', 'bash', 'read', 'grep', 'glob'].every((toolName) => toolCall(toolName, { path: 'src/file.ts', command: 'rm -rf src/file.ts' })?.block !== true));
  fs.writeFileSync(statePath, JSON.stringify({ active: 'code-reviewer' }));
  check('tool_call fails closed when guard evaluation throws',
    toolCall('write', new Proxy({}, { ownKeys() { throw new Error('forced guard failure'); } }))?.block === true);

  fs.writeFileSync(statePath, JSON.stringify({ active: 'worker' }));
  const promptEvent = { systemPromptOptions: { sections: {} } };
  handlers.get('before_agent_start')(promptEvent, ctx);
  check('before_agent_start populates shared persona prompt',
    promptEvent.systemPromptOptions.sections.righthand?.includes('Active RightHand Persona: worker (General Worker) [mode: writer]') === true);
  handlers.get('session_start')({}, ctx);
  check('session_start sets RightHand status', statuses.at(-1)?.key === 'righthand' && statuses.at(-1).value.includes('worker'));
  handlers.get('session_shutdown')({}, ctx);
  check('session_shutdown clears RightHand status', statuses.at(-1)?.key === 'righthand' && statuses.at(-1).value === undefined);

  const selectItems = [];
  ctx.ui.select = async (title, items) => {
    selectItems.push({ title, items });
    return items.find((item) => item.includes('worker ('));
  };
  (async () => {
    await command.config.handler('list', ctx);
    check('list UI keeps selection title and deactivate entry',
      selectItems[0]?.title === 'Select RightHand Persona' && selectItems[0].items[0].startsWith('[Deactivate] off'));
    check('list flow activates selection and notifies',
      JSON.parse(fs.readFileSync(statePath, 'utf8')).active === 'worker' && notifications.at(-1)?.message.includes('Switched to RightHand persona: worker'));

    await command.config.handler('off', ctx);
    check('off command deactivates and notifies',
      JSON.parse(fs.readFileSync(statePath, 'utf8')).active === null && notifications.at(-1)?.message === 'RightHand persona deactivated');

    const ompConfig = require('../harness/omp/bundle.config.cjs');
    check('generated bundle matches real OMP bundle config', bundle({ ...ompConfig, check: true }).count === 1);
    console.log(`EVIDENCE: ${JSON.stringify({ readonly: readonlyDecisions, writer: writerDecisions }, null, 2)}`);
    if (failed > 0) {
      console.error(`\nOMP validation FAILED with ${failed} errors.`);
      process.exitCode = 1;
    } else {
      console.log('\nALL OMP checks passed!');
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  }).finally(() => {
    process.chdir(previousCwd);
    if (previousHome === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousHome;
    if (previousHomePosix === undefined) delete process.env.HOME;
    else process.env.HOME = previousHomePosix;
    if (previousScratchpad === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
    else process.env.COMMANDCODE_SCRATCHPAD = previousScratchpad;
    fs.rmSync(base, { recursive: true, force: true });
  });
} catch (error) {
  process.chdir(previousCwd);
  if (previousHome === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousHome;
  if (previousHomePosix === undefined) delete process.env.HOME;
  else process.env.HOME = previousHomePosix;
  if (previousScratchpad === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
  else process.env.COMMANDCODE_SCRATCHPAD = previousScratchpad;
  fs.rmSync(base, { recursive: true, force: true });
  throw error;
}
