const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const TEXT_EXTENSIONS = new Set(['.json', '.ts', '.mts', '.js', '.mjs', '.cjs', '.md']);
const SHIPPED_DIRS = [
  '.commandcode-mod',
  '.pi-plugin',
  '.opencode-plugin',
  '.omp',
  'bin',
  'dist',
  'profiles',
  'rules',
  'scripts',
  'skills',
  'types',
];
const SHIPPED_FILES = ['package.json', 'plugin.json', 'README.md', 'GUIDE.md', 'CONTRIBUTING.md', 'LICENSE'];

console.log('Checking shipped packaging files for UTF-8 BOM and resolvable manifests...');

let failed = 0;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const candidates = [];
for (const file of SHIPPED_FILES) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`FAIL: [packaging] Missing shipped file: ${file}`);
    failed++;
    continue;
  }
  candidates.push(full);
}
for (const dir of SHIPPED_DIRS) {
  walk(path.join(root, dir), candidates);
}

// A leading UTF-8 BOM is invisible to editors but breaks JSON.parse consumers such as cmdc.
for (const file of candidates) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2]) {
    console.error(`FAIL: [packaging] UTF-8 BOM present: ${path.relative(root, file)}`);
    failed++;
  }
}

// cmdc parses package.json without stripping a BOM and reads commandcode.mods from it.
const pkgPath = path.join(root, 'package.json');
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath).toString('utf8'));
  console.log('OK Manifest: package.json parses from raw bytes');
} catch (e) {
  console.error(`FAIL: [packaging] package.json is not parseable as raw UTF-8 JSON: ${e.message}`);
  failed++;
}

if (pkg) {
  const mods = pkg.commandcode && Array.isArray(pkg.commandcode.mods) ? pkg.commandcode.mods : [];
  if (mods.length === 0) {
    console.error('FAIL: [packaging] package.json declares no commandcode.mods entries');
    failed++;
  }
  for (const entry of mods) {
    const abs = path.resolve(root, entry);
    if (!abs.startsWith(root + path.sep)) {
      console.error(`FAIL: [packaging] commandcode.mods entry escapes package root: ${entry}`);
      failed++;
    } else if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.error(`FAIL: [packaging] commandcode.mods entry does not resolve to a file: ${entry}`);
      failed++;
    } else {
      console.log(`OK Mod entry: ${entry}`);
    }
  }
}

if (failed > 0) {
  console.error(`\nPackaging validation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log('\nALL packaging checks passed.');
