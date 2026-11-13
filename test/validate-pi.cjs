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

  const activePersona = 'worker';
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ active: activePersona }));
  const activeEvent = { systemPromptOptions: { sections: {} } };
  handlers.get('before_agent_start')(activeEvent, ctx);
  const section = activeEvent.systemPromptOptions.sections.righthand;
  const workerBody = fs.readFileSync(path.join(profilesDir, 'worker.md'), 'utf8').split(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m)[1].trim();
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

  (async () => {
    await command.config.handler('off', ctx);
    const inactiveState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    await command.config.handler(activePersona, ctx);
    const activeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    check('state round-trip persists off then persona', inactiveState.active === null && activeState.active === activePersona);

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
