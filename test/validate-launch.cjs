const path = require('node:path');

const root = path.join(__dirname, '..');
const launch = require(path.join(root, 'bin', 'launch.js'));

let failed = 0;
let passed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`OK: ${label}`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${label} -> ${e && e.message ? e.message : e}`);
    failed++;
  }
}

check('model present: -m with exact model in right order', () => {
  const args = launch.buildLaunchArgs('worker', { model: 'reflection/beam:free' });
  const expected = ['-t', '--yolo', '-m', 'reflection/beam:free', '--mod-option', 'default=worker'];
  if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error(JSON.stringify(args));
});

check('model absent: no -m at all', () => {
  const args = launch.buildLaunchArgs('backend', { model: '' });
  if (args.includes('-m')) throw new Error('unexpected -m');
  const expected = ['-t', '--yolo', '--mod-option', 'default=backend'];
  if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error(JSON.stringify(args));
});

check('model absent (null resolution): no -m', () => {
  const args = launch.buildLaunchArgs('backend', null);
  if (JSON.stringify(args) !== JSON.stringify(['-t', '--yolo', '--mod-option', 'default=backend'])) throw new Error(JSON.stringify(args));
});

check('persona with spaces stays single --mod-option arg', () => {
  const args = launch.buildLaunchArgs('my persona', { model: 'm' });
  const idx = args.indexOf('--mod-option');
  if (idx === -1) throw new Error('no --mod-option');
  if (args[idx + 1] !== 'default=my persona') throw new Error('bad mod-option value');
  // ensure it is a single array element
  if (args.filter((a) => a.startsWith('default=')).length !== 1) throw new Error('split');
});

check('formatCommand quotes args with spaces', () => {
  const line = launch.formatCommand('cmdc', ['a', 'b c', 'd']);
  if (line !== 'cmdc a "b c" d') throw new Error(line);
});

check('formatCommand leaves plain args unquoted', () => {
  const line = launch.formatCommand('cmdc', ['-t', '--yolo']);
  if (line !== 'cmdc -t --yolo') throw new Error(line);
});

// ---------------------------------------------------------------------------
// CLI level: cross-harness launch must never forward another harness's model
// ---------------------------------------------------------------------------
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PERSONA = 'worker';
const CMDC_MODEL = '9router-bili/cmc/deepseek/deepseek-v4.1-flash';
const PI_MODEL = '9router/agness/agnes-2.5-flash';

check('CLI-level checks derive the bin from launch.CMDC_BIN', () => {
  if (launch.CMDC_BIN !== 'cmdc' && launch.CMDC_BIN !== 'cmd') {
    throw new Error(`unexpected platform bin: ${launch.CMDC_BIN}`);
  }
  if (process.platform !== 'win32' && launch.CMDC_BIN !== 'cmd') {
    throw new Error(`POSIX bin must be "cmd", got "${launch.CMDC_BIN}"`);
  }
  const source = fs.readFileSync(__filename, 'utf8');
  const cliStart = source.indexOf('// CLI level:');
  if (cliStart === -1) throw new Error('CLI-level section marker missing');
  const hardcoded = source.slice(cliStart).match(/(['"`])cmd[cd]? -t --yolo/g);
  if (hardcoded) throw new Error(`hardcoded harness bin in CLI-level checks: ${hardcoded.join(', ')}`);
});

function mkProject(personas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-launch-'));
  if (personas) {
    const cfg = path.join(dir, '.righthand');
    fs.mkdirSync(cfg, { recursive: true });
    fs.writeFileSync(path.join(cfg, 'persona.json'), JSON.stringify({ personas }));
  }
  return dir;
}

function launchPrint(dir, args) {
  const env = Object.assign({}, process.env);
  // The orchestrator model must not leak in: these checks are about the config.
  delete env.HERDR_PANE_ID;
  delete env.RIGHTHAND_PERSONA;
  const r = spawnSync(process.execPath, [path.join(root, 'bin', 'righthand.js'), 'launch', ...args, '--print'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60000,
    env,
  });
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').replace(/\r\n/g, '\n').trim();
}

check('launch worker --print is byte-identical to the pre-change baseline', () => {
  const dir = mkProject(null);
  try {
    const out = launchPrint(dir, [PERSONA]);
    if (out !== `${launch.CMDC_BIN} -t --yolo --mod-option default=worker`) throw new Error(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('launch pi worker --print never forwards the commandcode model', () => {
  const dir = mkProject({ [PERSONA]: { harness: 'commandcode', model: CMDC_MODEL } });
  try {
    const out = launchPrint(dir, ['pi', PERSONA]);
    if (out.includes(CMDC_MODEL)) throw new Error(`forwarded cmdc model: ${out}`);
    if (out.includes('--model')) throw new Error(`unexpected --model: ${out}`);
    if (out !== `pi --approve\nenv: RIGHTHAND_PERSONA=${PERSONA}`) throw new Error(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('launch pi worker --print emits exactly the pi models entry', () => {
  const dir = mkProject({ [PERSONA]: { harness: 'commandcode', model: CMDC_MODEL, models: { pi: PI_MODEL } } });
  try {
    const out = launchPrint(dir, ['pi', PERSONA]);
    if (out.includes(CMDC_MODEL)) throw new Error(`forwarded cmdc model: ${out}`);
    const models = out.split('\n').filter((line) => line.includes('--model '));
    if (models.length !== 1) throw new Error(`expected one --model: ${out}`);
    if (out !== `pi --approve --model ${PI_MODEL}\nenv: RIGHTHAND_PERSONA=${PERSONA}`) throw new Error(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('launch worker --print keeps the commandcode model when models is present', () => {
  const dir = mkProject({ [PERSONA]: { harness: 'commandcode', model: CMDC_MODEL, models: { pi: PI_MODEL } } });
  try {
    const out = launchPrint(dir, [PERSONA]);
    if (out !== `${launch.CMDC_BIN} -t --yolo -m ${CMDC_MODEL} --mod-option default=worker`) throw new Error(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('BITE PROOF: cross-harness check fails when the models entry is dropped', () => {
  const dir = mkProject({ [PERSONA]: { harness: 'commandcode', model: CMDC_MODEL } });
  try {
    const out = launchPrint(dir, ['pi', PERSONA]);
    if (out === `pi --approve --model ${PI_MODEL}\nenv: RIGHTHAND_PERSONA=${PERSONA}`) {
      throw new Error('dropping models still produced the pi model');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

if (failed > 0) {
  console.error(`\nLaunch validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL launch checks PASSED (${passed}).`);
