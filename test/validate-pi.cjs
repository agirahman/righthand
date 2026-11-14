const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionPath = path.join(root, 'dist', '.pi-plugin', 'extensions', 'righthand.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-pi-'));
const repoDir = path.join(base, 'repo');
const profilesDir = path.join(repoDir, 'profiles');
const skillsDir = path.join(repoDir, 'skills');
const statePath = path.join(repoDir, '.righthand', 'state', 'active-persona.json');

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}

try {
  for (const entry of pkg.pi.extensions) {
    const resolved = path.resolve(root, entry);
    check(`Pi extension entry resolves: ${entry}`, fs.existsSync(resolved));
  }

  check('Pi skills entry resolves to ./skills', pkg.pi.skills.length === 1 && pkg.pi.skills[0] === './skills');
  const skillFiles = fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'skills', entry.name, 'SKILL.md')));
  check('Pi skills contains 9 SKILL.md files', skillFiles.length === 9);

  let imagePath;
  try {
    const imageUrl = new URL(pkg.pi.image);
    const relativeImage = imageUrl.pathname.replace(/^\/agirahman\/righthand\/main\//, '');
    imagePath = path.join(root, relativeImage);
    check('Pi image is HTTPS and maps to a tracked file', imageUrl.protocol === 'https:' && fs.existsSync(imagePath));
  } catch {
    check('Pi image is HTTPS and maps to a tracked file', false);
  }
  if (imagePath && fs.existsSync(imagePath)) {
    const tracked = require('node:child_process').spawnSync('git', ['ls-files', '--error-unmatch', path.relative(root, imagePath)], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    });
    check('Pi image is tracked by git', tracked.status === 0);
  }

  const extensionModule = require(extensionPath);
  const extension = extensionModule.default;
  check('default export is a function', typeof extension === 'function');

  fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  copyDirectory(path.join(root, 'profiles'), profilesDir);
  copyDirectory(path.join(root, 'skills'), skillsDir);

  const handlers = new Map();
  let command;
  const statuses = [];
  const notifications = [];
  const pi = {
    on(event, handler) {
      handlers.set(event, handler);
    },
    registerCommand(name, config) {
      command = { name, config };
    },
  };
  const ctx = {
    cwd: repoDir,
    ui: {
      setStatus(key, value) {
        statuses.push({ key, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
      select: undefined,
    },
  };

  extension(pi);
  check('righthand command registered with completions', command?.name === 'righthand' && typeof command.config.getArgumentCompletions === 'function');

  const previousCwd = process.cwd();
  let completions;
  try {
    process.chdir(repoDir);
    completions = command.config.getArgumentCompletions('');
  } finally {
    process.chdir(previousCwd);
  }
  const completionNames = completions?.map((item) => item.value) || [];
  check('completions include 11 personas, list, and off', completionNames.length === 13 && ['list', 'off'].every((name) => completionNames.includes(name)) && completionNames.filter((name) => name !== 'list' && name !== 'off').length === 11);

  const isolatedCwd = path.join(base, 'isolated-cwd');
  fs.mkdirSync(isolatedCwd, { recursive: true });
  const packageLayout = path.join(base, 'simulated-package');
  fs.mkdirSync(path.join(packageLayout, '.pi-plugin', 'extensions'), { recursive: true });
  fs.mkdirSync(path.join(packageLayout, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(packageLayout, 'package.json'), '{}');
  copyDirectory(path.join(root, 'profiles'), path.join(packageLayout, 'profiles'));
  copyDirectory(path.join(root, 'dist', 'shared'), path.join(packageLayout, 'shared'));
  fs.copyFileSync(extensionPath, path.join(packageLayout, '.pi-plugin', 'extensions', 'righthand.js'));
  const packageHandlers = new Map();
  let packageCommand;
  require(path.join(packageLayout, '.pi-plugin', 'extensions', 'righthand.js')).default({
    on(event, handler) { packageHandlers.set(event, handler); },
    registerCommand(name, config) { packageCommand = { name, config }; },
  });
  const packagePreviousCwd = process.cwd();
  let packageCompletions;
  try {
    process.chdir(isolatedCwd);
    packageCompletions = packageCommand.config.getArgumentCompletions('');
  } finally {
    process.chdir(packagePreviousCwd);
  }
  const packagePersonaCount = packageCompletions?.filter((item) => item.value !== 'list' && item.value !== 'off').length;
  check('simulated package layout discovers all 11 shipped personas', packagePersonaCount === 11);

  let distCompletions;
  try {
    process.chdir(isolatedCwd);
    distCompletions = command.config.getArgumentCompletions('');
  } finally {
    process.chdir(packagePreviousCwd);
  }
  const distPersonaCount = distCompletions?.filter((item) => item.value !== 'list' && item.value !== 'off').length;
  check('compiled dist extension walks to the repo and discovers all 11 shipped personas', distPersonaCount === 11);

  const activePersona = 'worker';
  const workerBody = fs.readFileSync(path.join(profilesDir, 'worker.md'), 'utf8').split(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m)[1].trim();
  const legacyStatePath = path.join(repoDir, '.righthand', 'active-persona.json');
  fs.mkdirSync(path.dirname(legacyStatePath), { recursive: true });
  fs.writeFileSync(legacyStatePath, JSON.stringify({ active: activePersona }));
  const legacyEvent = { systemPromptOptions: { sections: {} } };
  handlers.get('before_agent_start')(legacyEvent, ctx);
  check('legacy state fallback resolves the existing worker persona', typeof legacyEvent.systemPromptOptions.sections.righthand === 'string' && legacyEvent.systemPromptOptions.sections.righthand.includes(workerBody));

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, '{"active":');
  const truncatedEvent = { systemPromptOptions: { sections: { righthand: 'stale' } } };
  handlers.get('before_agent_start')(truncatedEvent, ctx);
  check('truncated state JSON returns null without activating a persona', !Object.hasOwn(truncatedEvent.systemPromptOptions.sections, 'righthand'));

  fs.writeFileSync(statePath, JSON.stringify({ active: activePersona }));
  const activeEvent = { systemPromptOptions: { sections: {} } };
  handlers.get('before_agent_start')(activeEvent, ctx);
  const section = activeEvent.systemPromptOptions.sections.righthand;
  check('active persona populates righthand section', typeof section === 'string' && section.includes('worker') && section.includes(workerBody));

  handlers.get('session_start')({}, ctx);
  const startStatus = statuses.at(-1);
  check('session_start sets status through ctx.ui.setStatus', startStatus?.key === 'righthand' && typeof startStatus.value === 'string' && startStatus.value.includes('worker'));

  const inactiveEvent = { systemPromptOptions: { sections: { righthand: 'stale' } } };
  fs.writeFileSync(statePath, JSON.stringify({ active: null }));
  handlers.get('before_agent_start')(inactiveEvent, ctx);
  check('no active persona deletes righthand section', !Object.hasOwn(inactiveEvent.systemPromptOptions.sections, 'righthand'));

  handlers.get('session_shutdown')({}, ctx);
  const shutdownStatus = statuses.at(-1);
  check('session_shutdown clears status through ctx.ui.setStatus', shutdownStatus?.key === 'righthand' && shutdownStatus.value === undefined);

  const toolCallHandler = handlers.get('tool_call');
  check('tool_call handler registered', typeof toolCallHandler === 'function');
  const scratchDir = path.join(base, 'scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  const previousScratchpad = process.env.COMMANDCODE_SCRATCHPAD;
  process.env.COMMANDCODE_SCRATCHPAD = scratchDir;
  const toolCall = (toolName, input) => toolCallHandler({ type: 'tool_call', toolCallId: 'test', toolName, input }, ctx);

  fs.writeFileSync(statePath, JSON.stringify({ active: 'security-auditor' }));
  check('readonly write to src blocked', toolCall('write', { path: 'src/x.js', content: 'x' })?.block === true);
  check('readonly edit to src blocked', toolCall('edit', { path: 'src/x.js', edits: [{ oldText: 'x', newText: 'y' }] })?.block === true);
  check('readonly bash rm blocked', toolCall('bash', { command: 'rm -rf src' })?.block === true);
  check('readonly bash git status allowed', toolCall('bash', { command: 'git status' })?.block !== true);
  check('readonly write to .righthand reports allowed', toolCall('write', { path: '.righthand/tickets/T1/reports/r.md', content: 'report' })?.block !== true);
  check('readonly write to COMMANDCODE_SCRATCHPAD allowed', toolCall('write', { path: path.join(scratchDir, 'r.md'), content: 'report' })?.block !== true);
  check('readonly read allowed', toolCall('read', { path: 'src/x.js' })?.block !== true);
  check('readonly grep allowed', toolCall('grep', { pattern: 'x' })?.block !== true);
  check('readonly find allowed', toolCall('find', { pattern: '**/*.js' })?.block !== true);
  check('readonly ls allowed', toolCall('ls', {})?.block !== true);

  fs.writeFileSync(statePath, JSON.stringify({ active: 'worker' }));
  check('writer write to src allowed', toolCall('write', { path: 'src/x.js', content: 'x' })?.block !== true);
  fs.writeFileSync(statePath, JSON.stringify({ active: null }));
  check('no active persona write to src allowed', toolCall('write', { path: 'src/x.js', content: 'x' })?.block !== true);
  if (previousScratchpad === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
  else process.env.COMMANDCODE_SCRATCHPAD = previousScratchpad;

  const extensionSource = fs.readFileSync(path.join(root, '.pi-plugin', 'extensions', 'righthand.ts'), 'utf8');
  check('guard exceptions fail closed structurally', extensionSource.includes('return { block: true, reason: "Blocked: the readonly guard failed to evaluate this call." };'));

  (async () => {
    await command.config.handler('off', ctx);
    const inactiveState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    await command.config.handler(activePersona, ctx);
    const activeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    check('state round-trip persists off then persona', inactiveState.active === null && activeState.active === activePersona);
    check('atomic write/read round-trip preserves persona state', JSON.parse(fs.readFileSync(statePath, 'utf8')).active === activePersona);
    const stateDirectoryEntries = fs.readdirSync(path.dirname(statePath));
    check('atomic write leaves only active-persona.json and no temp residue', stateDirectoryEntries.length === 1 && stateDirectoryEntries[0] === 'active-persona.json');

    if (failed > 0) {
      console.error(`\nPi validation FAILED with ${failed} errors.`);
      process.exitCode = 1;
    } else {
      console.log('\nALL Pi checks passed!');
    }
    fs.rmSync(base, { recursive: true, force: true });
  })().catch((error) => {
    console.error(error);
    fs.rmSync(base, { recursive: true, force: true });
    process.exitCode = 1;
  });
} catch (error) {
  fs.rmSync(base, { recursive: true, force: true });
  throw error;
}
