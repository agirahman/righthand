const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {PERSONA_POLICIES, resolvePersonaPolicy} = require(path.join(root, 'dist', 'guard', 'personas'));
const profileNames = fs.readdirSync(path.join(root, 'profiles'))
  .filter((file) => file.endsWith('.md'))
  .map((file) => path.basename(file, '.md'))
  .sort();
const policyNames = fs.readdirSync(path.join(root, 'guard', 'personas'))
  .filter((file) => file.endsWith('.guard.ts'))
  .map((file) => path.basename(file, '.guard.ts'))
  .sort();
const permissions = (policy) => [
  policy.git.allowIntegration,
  policy.git.allowCommit,
  policy.git.allowTag,
  policy.gh.allowPrEdit,
  policy.gh.allowRelease,
  policy.release.allowVersionWrite,
  policy.scripts.allowRepoRoot,
];
let failed = 0;
function check(name, condition) {
  if (condition) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

check('policy modules match shipped profile basenames', JSON.stringify(policyNames) === JSON.stringify(profileNames));
check('registry contains exactly 11 personas', Object.keys(PERSONA_POLICIES).length === 11);
for (const name of profileNames) {
  check(`${name} policy name matches its filename`, PERSONA_POLICIES[name]?.name === name);
}
check('orchestrator has all seven declared permissions', JSON.stringify(permissions(PERSONA_POLICIES.orchestrator)) === JSON.stringify(Array(7).fill(true)));
for (const name of profileNames.filter((name) => name !== 'orchestrator')) {
  check(`${name} remains fully readonly`, JSON.stringify(permissions(PERSONA_POLICIES[name])) === JSON.stringify(Array(7).fill(false)));
}
check('missing persona resolves to a fully readonly policy', JSON.stringify(permissions(resolvePersonaPolicy(undefined))) === JSON.stringify(Array(7).fill(false)));
check('unknown persona resolves to a fully readonly policy', JSON.stringify(permissions(resolvePersonaPolicy('nope'))) === JSON.stringify(Array(7).fill(false)));
check('persona lookup is case-insensitive', resolvePersonaPolicy('Orchestrator') === PERSONA_POLICIES.orchestrator);
if (failed > 0) {
  console.error(`\nGuard persona validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log('\nALL guard persona policy checks passed.');
