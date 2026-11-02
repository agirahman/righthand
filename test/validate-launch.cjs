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

if (failed > 0) {
  console.error(`\nLaunch validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL launch checks PASSED (${passed}).`);
