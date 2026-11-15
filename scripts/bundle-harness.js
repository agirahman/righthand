'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HEADER = (entry) => [
  '// GENERATED FILE - do not edit.',
  `// Source: ${entry}`,
  '// Regenerate: node scripts/bundle-harness.js',
  '',
].join('\n');

function resolveImport(fromFile, specifier, rootDir) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  if (/\.js$/i.test(base)) candidates.push(base.slice(0, -3) + '.ts');
  else if (/\.jsx$/i.test(base)) candidates.push(base.slice(0, -4) + '.tsx');
  else if (!/\.tsx?$/i.test(base)) candidates.push(`${base}.ts`);
  candidates.push(base);
  if (!path.extname(base)) candidates.push(`${base}.tsx`, path.join(base, 'index.ts'));
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve relative import '${specifier}' from ${path.relative(rootDir, fromFile).replace(/\\/g, '/')}`);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Relative import escapes repository root: ${specifier} from ${fromFile}`);
  return resolved;
}

function maskCommentsAndTemplates(source) {
  const masked = source.split('');
  let state = 'code';
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (character === "'") state = 'single';
      else if (character === '"') state = 'double';
      else if (character === '`') {
        masked[index] = ' ';
        state = 'template';
      } else if (character === '/' && next === '*') {
        masked[index] = ' ';
        masked[index + 1] = ' ';
        index++;
        state = 'block';
      } else if (character === '/' && next === '/') {
        masked[index] = ' ';
        masked[index + 1] = ' ';
        index++;
        state = 'line';
      }
    } else if (state === 'single' || state === 'double') {
      if (character === '\\') index++;
      else if ((state === 'single' && character === "'") || (state === 'double' && character === '"')) state = 'code';
    } else if (state === 'template') {
      if (character !== '\n' && character !== '\r') masked[index] = ' ';
      if (character === '\\') {
        if (source[index + 1] !== '\n' && source[index + 1] !== '\r') masked[index + 1] = ' ';
        index++;
      } else if (character === '`') state = 'code';
    } else {
      if (character !== '\n' && character !== '\r') masked[index] = ' ';
      if (state === 'block' && character === '*' && next === '/') {
        masked[index + 1] = ' ';
        index++;
        state = 'code';
      } else if (state === 'line' && (character === '\n' || character === '\r')) state = 'code';
    }
  }
  return masked.join('');
}

function parseImports(source) {
  const imports = [];
  const scanned = maskCommentsAndTemplates(source);
  const clause = '((?:(?:[\\w$]+[ \\t]*,[ \\t]*)?\\{[^}]*\\}|(?:[\\w$]+[ \\t]*,[ \\t]*)?\\*(?:[ \\t]+as[ \\t]+[\\w$]+)?)|[\\w$]+)';
  const pattern = new RegExp(`^[ \\t]*(import|export)\\s+(?:(type)\\s+)?${clause}[ \\t\\r\\n]*from[ \\t\\r\\n]*(['"])([^'"\\r\\n]+)\\4[ \\t]*;?[ \\t]*$`, 'gm');
  let match;
  while ((match = pattern.exec(scanned))) {
    imports.push({ start: match.index, end: pattern.lastIndex, typeOnly: Boolean(match[2]), clause: match[3].trim(), specifier: match[5], reexport: match[1] === 'export' });
  }
  const sideEffectPattern = /^[ \t]*import\s+(['"])([^'"\r\n]+)\1\s*;?[ \t]*$/gm;
  while ((match = sideEffectPattern.exec(scanned))) {
    if (imports.some((item) => item.start <= match.index && item.end >= sideEffectPattern.lastIndex)) continue;
    imports.push({ start: match.index, end: sideEffectPattern.lastIndex, typeOnly: false, clause: '', specifier: match[2], sideEffect: true });
  }
  return imports.sort((a, b) => a.start - b.start);
}

function parseBindings(clause) {
  const result = { defaultName: null, namespaceName: null, named: [] };
  let rest = clause.trim();
  if (!rest) return result;
  const brace = rest.indexOf('{');
  if (brace >= 0) {
    const close = rest.lastIndexOf('}');
    if (close < brace) throw new Error(`Unsupported import clause: ${clause}`);
    const before = rest.slice(0, brace).replace(/,$/, '').trim();
    const inside = rest.slice(brace + 1, close).trim();
    if (before) result.defaultName = before;
    if (inside) {
      for (const part of inside.split(',')) {
        const item = /^\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
        if (!item) throw new Error(`Unsupported named import '${part}' in ${clause}`);
        result.named.push({ imported: item[2], local: item[3] || item[2], typeOnly: Boolean(item[1]) });
      }
    }
    return result;
  }
  const namespace = /^([\w$]+)\s*,\s*\*\s+as\s+([\w$]+)$/.exec(rest);
  if (namespace) {
    result.defaultName = namespace[1];
    result.namespaceName = namespace[2];
    return result;
  }
  const star = /^\*\s+as\s+([\w$]+)$/.exec(rest);
  if (star) {
    result.namespaceName = star[1];
    return result;
  }
  if (/^[\w$]+$/.test(rest)) {
    result.defaultName = rest;
    return result;
  }
  throw new Error(`Unsupported import clause: ${clause}`);
}

function addImport(groups, imported, typeAliases) {
  let group = groups.get(imported.specifier);
  if (!group) {
    group = { specifier: imported.specifier, sideEffect: false, defaultName: null, namespaceName: null, named: new Map() };
    groups.set(imported.specifier, group);
  }
  if (imported.sideEffect) group.sideEffect = true;
  if (!imported.clause) return;
  const bindings = parseBindings(imported.clause);
  const addRuntime = (local, importedName) => {
    const previous = group.named.get(local);
    if (previous && previous !== importedName) throw new Error(`Conflicting external import '${local}' from '${imported.specifier}'`);
    group.named.set(local, importedName);
  };
  if (bindings.defaultName) {
    if (imported.typeOnly) typeAliases.add(bindings.defaultName);
    else {
      if (group.defaultName && group.defaultName !== bindings.defaultName) throw new Error(`Multiple default imports from '${imported.specifier}' cannot be merged`);
      group.defaultName = bindings.defaultName;
    }
  }
  if (bindings.namespaceName) {
    if (imported.typeOnly) typeAliases.add(bindings.namespaceName);
    else {
      if (group.namespaceName && group.namespaceName !== bindings.namespaceName) throw new Error(`Multiple namespace imports from '${imported.specifier}' cannot be merged`);
      group.namespaceName = bindings.namespaceName;
    }
  }
  for (const binding of bindings.named) {
    if (imported.typeOnly || binding.typeOnly) typeAliases.add(binding.local);
    else addRuntime(binding.local, binding.imported);
  }
}

function declarationMatches(source) {
  const declarations = [];
  const scanned = maskCommentsAndTemplates(source);
  const pattern = /^(?:export\s+)?(?:(?:declare|abstract|async)\s+)*(const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)\b/gm;
  let match;
  while ((match = pattern.exec(scanned))) {
    let end = source.indexOf('\n', match.index);
    if (end < 0) end = source.length;
    if (match[1] === 'type') {
      const semicolon = scanned.indexOf(';', match.index);
      if (semicolon >= 0) end = semicolon + 1;
    }
    declarations.push({ name: match[2], kind: match[1], start: match.index, end, text: source.slice(match.index, end).trim() });
  }
  return declarations;
}

function removeRange(source, start, end) {
  return source.slice(0, start) + source.slice(end);
}

function stripExports(source, file, isEntry, defaults) {
  let output = source;
  const defaultFunction = /^export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/m.exec(output);
  if (defaultFunction) {
    if (!isEntry) throw new Error(`Default export is only supported in the entry file: ${file}`);
    defaults.push(defaultFunction[1]);
    output = output.replace(/^export\s+default\s+(?=(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\()/m, '');
  }
  const defaultIdentifier = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;\s*$/m.exec(output);
  if (defaultIdentifier) {
    if (!isEntry) throw new Error(`Default export is only supported in the entry file: ${file}`);
    defaults.push(defaultIdentifier[1]);
    output = output.replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;\s*$/m, '');
  }
  const unsupported = /^\s*export\s+default\b/m.exec(output);
  if (unsupported) throw new Error(`Unsupported default export form in ${file}; use a named function or identifier`);
  output = output.replace(/^(\s*)export\s+(?=(?:(?:declare|abstract|async)\s+)*(?:const|let|var|function|class|interface|type|enum|namespace)\b)/gm, '$1');
  return output;
}

function mergeExternalImports(groups) {
  const output = [];
  for (const group of groups.values()) {
    if (group.namespaceName && group.named.size) throw new Error(`Cannot merge namespace and named imports from '${group.specifier}'`);
    const clauses = [];
    if (group.defaultName) clauses.push(group.defaultName);
    if (group.namespaceName) clauses.push(`* as ${group.namespaceName}`);
    if (group.named.size) clauses.push(`{ ${Array.from(group.named, ([local, imported]) => local === imported ? imported : `${imported} as ${local}`).join(', ')} }`);
    if (clauses.length) output.push(`import ${clauses.join(', ')} from ${JSON.stringify(group.specifier)};`);
    else if (group.sideEffect) output.push(`import ${JSON.stringify(group.specifier)};`);
  }
  return output;
}

function ambientTypeStubs(external, rootDir) {
  const missing = Array.from(external.keys()).filter((specifier) => {
    if (specifier.startsWith('node:')) return false;
    try {
      require.resolve(specifier, { paths: [rootDir] });
      return false;
    } catch {
      return true;
    }
  });
  return missing.length ? `${missing.map((specifier) => `declare module '${specifier}';`).join('\n')}\n` : '';
}

function buildBundle(config, rootDir) {
  if (!config || typeof config.entry !== 'string' || typeof config.dest !== 'string' || !['ts', 'js'].includes(config.format) || typeof config.defaultExport !== 'string') {
    throw new Error('Bundle config must define entry, dest, format (ts|js), and defaultExport');
  }
  const entry = path.resolve(rootDir, config.entry);
  const files = [];
  const visited = new Set();
  const visiting = new Set();
  const external = new Map();
  const typeAliases = new Set();
  const importRanges = new Map();

  function visit(file) {
    if (visited.has(file)) return;
    if (visiting.has(file)) throw new Error(`Circular relative import involving ${path.relative(rootDir, file).replace(/\\/g, '/')}`);
    visiting.add(file);
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const imports = parseImports(source);
    importRanges.set(file, []);
    for (const imported of imports) {
      importRanges.get(file).push({ start: imported.start, end: imported.end });
      if (imported.specifier.startsWith('.')) {
        const resolved = resolveImport(file, imported.specifier, rootDir);
        visit(resolved);
      } else if (!imported.reexport) {
        addImport(external, imported, typeAliases);
      }
    }
    visiting.delete(file);
    visited.add(file);
    files.push({ file, source });
  }

  visit(entry);
  const names = new Map();
  const duplicateDrops = [];
  const defaults = [];
  const emitted = [];

  for (const item of files) {
    let source = item.source;
    for (const range of importRanges.get(item.file).slice().reverse()) source = removeRange(source, range.start, range.end);
    const declarations = declarationMatches(source);
    const rangesToRemove = [];
    for (const declaration of declarations) {
      const previous = names.get(declaration.name);
      if (!previous) {
        names.set(declaration.name, { ...declaration, file: item.file });
        continue;
      }
      if (declaration.kind === 'type' && previous.kind === 'type' && declaration.text.replace(/^export\s+/, '') === previous.text.replace(/^export\s+/, '')) {
        rangesToRemove.push({ start: declaration.start, end: declaration.end });
        duplicateDrops.push({ name: declaration.name, first: path.relative(rootDir, previous.file).replace(/\\/g, '/'), duplicate: path.relative(rootDir, item.file).replace(/\\/g, '/') });
        continue;
      }
      throw new Error(`Duplicate top-level declaration '${declaration.name}' in ${path.relative(rootDir, previous.file).replace(/\\/g, '/')} and ${path.relative(rootDir, item.file).replace(/\\/g, '/')}`);
    }
    for (const range of rangesToRemove.sort((a, b) => b.start - a.start)) source = removeRange(source, range.start, range.end);
    source = stripExports(source, path.relative(rootDir, item.file).replace(/\\/g, '/'), item.file === entry, defaults);
    emitted.push(source.trim());
  }

  if (defaults.length !== 1 || defaults[0] !== config.defaultExport) {
    throw new Error(`Expected exactly one default export '${config.defaultExport}' in ${config.entry}, found ${defaults.join(', ') || 'none'}`);
  }
  const intermediateExt = files.some((item) => path.extname(item.file).toLowerCase() === '.tsx') ? '.tsx' : '.ts';
  const imports = mergeExternalImports(external);
  const body = [HEADER(config.entry), ...imports, ...Array.from(typeAliases, (name) => `type ${name} = any;`), ...emitted, `export default ${defaults[0]};`, ''].join('\n');
  return { body, imports, external, duplicateDrops, files, intermediateExt };
}

function transpileJavaScript(body, info, rootDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-bundle-tsc-'));
  try {
    const inputPath = path.join(tempDir, `bundle${info.intermediateExt}`);
    const stubPath = path.join(tempDir, 'bundle-external-types.d.ts');
    fs.writeFileSync(inputPath, body, 'utf8');
    const stubs = ambientTypeStubs(info.external, rootDir);
    if (stubs) fs.writeFileSync(stubPath, stubs, 'utf8');
    const outputDir = path.join(tempDir, 'out');
    const compiler = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
    const args = [compiler, inputPath, ...(stubs ? [stubPath] : []), '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'node', '--skipLibCheck', '--outDir', outputDir, '--typeRoots', path.join(rootDir, 'node_modules', '@types')];
    if (info.intermediateExt === '.tsx') args.push('--jsx', 'preserve');
    const result = spawnSync(process.execPath, args, { cwd: rootDir, encoding: 'utf8', shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Local TypeScript compiler failed:\n${result.stdout || ''}${result.stderr || ''}`.trim());
    const outputPath = path.join(outputDir, `bundle${info.intermediateExt === '.tsx' ? '.jsx' : '.js'}`);
    if (!fs.existsSync(outputPath)) throw new Error('Local TypeScript compiler did not emit JavaScript');
    return fs.readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function normalizeEol(content) {
  return content.replace(/\r\n/g, '\n');
}

function checkImportHygiene(output, config) {
  const imports = parseImports(output);
  if (imports.some((item) => item.specifier.startsWith('.'))) {
    throw new Error(`Relative import survived in generated output for ${config.entry}`);
  }
  const specifiers = imports.filter((item) => !item.reexport).map((item) => item.specifier);
  for (const specifier of new Set(specifiers)) {
    const count = specifiers.filter((item) => item === specifier).length;
    if (count !== 1) throw new Error(`External import '${specifier}' appears in ${count} statements for ${config.entry}`);
  }
}

function discoverConfigs(rootDir) {
  const harnessDir = path.join(rootDir, 'harness');
  if (!fs.existsSync(harnessDir)) return [];
  const configs = [];
  for (const entry of fs.readdirSync(harnessDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const configPath = path.join(harnessDir, entry.name, 'bundle.config.cjs');
    if (!fs.existsSync(configPath)) continue;
    delete require.cache[require.resolve(configPath)];
    const loaded = require(configPath);
    for (const config of Array.isArray(loaded) ? loaded : [loaded]) configs.push(config);
  }
  return configs;
}

function bundleOne(config, options) {
  const rootDir = options.rootDir;
  const info = buildBundle(config, rootDir);
  let output = info.body;
  if (config.format === 'js') output = transpileJavaScript(output, info, rootDir);
  output = normalizeEol(output);
  checkImportHygiene(output, config);
  const destRoot = options.outputDir || rootDir;
  const destination = path.resolve(destRoot, config.dest);
  if (options.check) {
    const trackedPath = path.resolve(rootDir, config.dest);
    if (!fs.existsSync(trackedPath)) throw new Error(`Missing tracked bundle: ${config.dest}`);
    if (normalizeEol(fs.readFileSync(trackedPath, 'utf8')) !== output) throw new Error(`Bundle drift: ${config.dest}`);
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const tempPath = `${destination}.tmp-${process.pid}`;
    fs.writeFileSync(tempPath, output.replace(/\r\n/g, '\n'), 'utf8');
    fs.renameSync(tempPath, destination);
  }
  return { config, output, info };
}

function bundle(options = {}) {
  const rootDir = path.resolve(options.rootDir || ROOT);
  const single = typeof options.entry === 'string';
  const configs = single ? [options] : discoverConfigs(rootDir);
  const results = [];
  for (const config of configs) {
    results.push(bundleOne(config, {
      rootDir,
      check: Boolean(options.check),
      outputDir: options.outputDir,
    }));
  }
  return { count: results.length, results };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check') || args.filter((arg) => arg === '--check').length > 1) throw new Error('Usage: node scripts/bundle-harness.js [--check]');
  const result = bundle({ check: args.includes('--check') });
  for (const item of result.results) {
    for (const duplicate of item.info.duplicateDrops) console.log(`Dropped identical duplicate type ${duplicate.name}: ${duplicate.first} and ${duplicate.duplicate}`);
    console.log(`${args.includes('--check') ? 'Checked' : 'Wrote'} ${item.config.dest}`);
  }
  console.log(`Summary: ${result.count} discovered config${result.count === 1 ? '' : 's'} (${result.count} bundle${result.count === 1 ? '' : 's'}).`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { bundle };
