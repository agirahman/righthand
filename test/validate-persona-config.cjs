const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pc = require(path.join(root, 'bin', 'persona-config.js'));

let failed = 0;
let passed = 0;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-pc-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
}

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

function expectThrow(label, fn) {
  try {
    fn();
    console.error(`FAIL: ${label} -> expected throw`);
    failed++;
  } catch (e) {
    if (e instanceof pc.ConfigError) {
      console.log(`OK: ${label}`);
      passed++;
    } else {
      console.error(`FAIL: ${label} -> threw non-ConfigError: ${e && e.message ? e.message : e}`);
      failed++;
    }
  }
}

// 1. missing file inherits
check('missing file inherits harness and model', () => {
  const d = mkTmp();
  try {
    const r = pc.resolvePersona(d, 'backend', { orchestratorModel: 'deepseek/deepseek-v4.1-flash' });
    if (r.harness !== 'commandcode') throw new Error('harness');
    if (r.harness_source !== 'orchestrator') throw new Error('harness_source');
    if (r.model !== 'deepseek/deepseek-v4.1-flash') throw new Error('model');
    if (r.model_source !== 'orchestrator') throw new Error('model_source');
  } finally { rmTmp(d); }
});

// 2. model-only entry
check('model-only entry gives model_source=persona', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { 'code-reviewer': { model: 'ag/gemini-3.8-flash-medium' } } }));
    const r = pc.resolvePersona(d, 'code-reviewer', { orchestratorModel: 'orch/model' });
    if (r.model !== 'ag/gemini-3.8-flash-medium') throw new Error('model');
    if (r.model_source !== 'persona') throw new Error('model_source');
    if (r.harness !== 'commandcode') throw new Error('harness');
    if (r.harness_source !== 'orchestrator') throw new Error('harness_source');
  } finally { rmTmp(d); }
});

// 3. harness-only entry inherits model from override
check('harness-only entry gives harness_source=persona and inherits model', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { harness: 'commandcode' } } }));
    const r = pc.resolvePersona(d, 'backend', { orchestratorModel: 'deepseek/deepseek-v4.1-flash' });
    if (r.harness !== 'commandcode') throw new Error('harness');
    if (r.harness_source !== 'persona') throw new Error('harness_source');
    if (r.model !== 'deepseek/deepseek-v4.1-flash') throw new Error('model');
    if (r.model_source !== 'orchestrator') throw new Error('model_source');
  } finally { rmTmp(d); }
});

// 4. unsupported harness
expectThrow('unsupported harness throws ConfigError', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { harness: 'pi' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 5. invalid JSON
expectThrow('invalid JSON throws ConfigError', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), '{ not json');
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 6. unknown field
expectThrow('unknown field throws ConfigError', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { foo: 'bar' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 7. unknown top-level key
expectThrow('unknown top-level key throws ConfigError', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ foo: {} }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 8. empty model
expectThrow('empty model throws ConfigError', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { model: '' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 9. formatResolution nothing resolves
check('formatResolution empty model', () => {
  const line = pc.formatResolution({ persona: 'x', harness: 'commandcode', harness_source: 'orchestrator', model: '', model_source: 'harness-default' });
  if (line !== 'persona=x harness=commandcode harness_source=orchestrator model= model_source=harness-default') throw new Error(line);
});

if (failed > 0) {
  console.error(`\nPersona config validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL persona config checks PASSED (${passed}).`);
