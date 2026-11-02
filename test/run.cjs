const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDir = __dirname;
const rootDir = path.join(testDir, '..');

const validators = fs.readdirSync(testDir)
  .filter((f) => f.startsWith('validate-') && f.endsWith('.cjs'))
  .sort();

console.log(`Discovered ${validators.length} validators: ${validators.join(', ')}\n`);

let failed = [];

for (const validator of validators) {
  const scriptPath = path.join(testDir, validator);
  console.log(`\n=== ${validator} ===`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    shell: false,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    const signal = result.signal;
    const code = result.status;
    failed.push({
      name: validator,
      status: signal ? `signal ${signal}` : `exit ${code}`,
    });
  }
}

if (failed.length > 0) {
  console.error('\n=== SUMMARY ===');
  console.error(`Failed (${failed.length}/${validators.length}):`);
  for (const f of failed) {
    console.error(`  - ${f.name}: ${f.status}`);
  }
  process.exit(1);
}

console.log(`\n=== ALL ${validators.length} VALIDATORS PASSED ===`);