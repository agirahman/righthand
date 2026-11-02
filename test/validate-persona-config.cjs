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

function expectThrow(label, fragment, fn) {
  try {
    fn();
    console.error(`FAIL: ${label} -> expected throw`);
    failed++;
  } catch (e) {
    if (!(e instanceof pc.ConfigError)) {
      console.error(`FAIL: ${label} -> threw non-ConfigError: ${e && e.message ? e.message : e}`);
      failed++;
      return;
    }
    if (!String(e.message).includes('.righthand/persona.json')) {
      console.error(`FAIL: ${label} -> message missing file path: ${e.message}`);
      failed++;
      return;
    }
    if (fragment && !String(e.message).includes(fragment)) {
      console.error(`FAIL: ${label} -> message missing "${fragment}": ${e.message}`);
      failed++;
      return;
    }
    console.log(`OK: ${label}`);
    passed++;
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

// 2. no config and no orchestrator model -> harness-default
check('no config and no orchestrator model resolves to harness-default', () => {
  const d = mkTmp();
  try {
    const r = pc.resolvePersona(d, 'backend', { orchestratorModel: null });
    if (r.harness !== 'commandcode') throw new Error('harness');
    if (r.harness_source !== 'orchestrator') throw new Error('harness_source');
    if (r.model !== '') throw new Error('model');
    if (r.model_source !== 'harness-default') throw new Error('model_source');
  } finally { rmTmp(d); }
});

// 3. model-only entry
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

// 4. harness-only entry inherits model from override
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

// 5. empty entry resolves (inherits)
check('empty persona entry resolves with inheritance', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: {} } }));
    const r = pc.resolvePersona(d, 'backend', { orchestratorModel: 'deepseek/deepseek-v4.1-flash' });
    if (r.harness !== 'commandcode') throw new Error('harness');
    if (r.harness_source !== 'orchestrator') throw new Error('harness_source');
    if (r.model !== 'deepseek/deepseek-v4.1-flash') throw new Error('model');
    if (r.model_source !== 'orchestrator') throw new Error('model_source');
  } finally { rmTmp(d); }
});

// 6. unsupported harness
expectThrow('unsupported harness throws ConfigError', 'not supported for dispatch', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { harness: 'pi' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 7. invalid JSON
expectThrow('invalid JSON throws ConfigError', 'invalid JSON', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), '{ not json');
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 8. unknown field
expectThrow('unknown field throws ConfigError', 'unknown field', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { foo: 'bar' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 9. unknown top-level key
expectThrow('unknown top-level key throws ConfigError', 'unknown top-level key', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ foo: {} }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 10. empty model
expectThrow('empty model throws ConfigError', 'must be a non-empty string', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { model: '' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 11. empty harness
expectThrow('empty harness throws ConfigError', 'must be a non-empty string', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { harness: '' } } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 12. root null
expectThrow('root null throws ConfigError', 'root must be a JSON object', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), 'null');
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 13. root array
expectThrow('root array throws ConfigError', 'root must be a JSON object', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), '[]');
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 14. non-object persona entry
expectThrow('non-object persona entry throws ConfigError', 'entry must be an object', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: 42 } }));
    pc.resolvePersona(d, 'backend', { orchestratorModel: 'm' });
  } finally { rmTmp(d); }
});

// 15. formatResolution empty model
check('formatResolution empty model', () => {
  const line = pc.formatResolution({ persona: 'x', harness: 'commandcode', harness_source: 'orchestrator', model: '', model_source: 'harness-default' });
  if (line !== 'persona=x harness=commandcode harness_source=orchestrator model= model_source=harness-default') throw new Error(line);
});

if (failed > 0) {
  console.error(`\nPersona config validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL persona config checks PASSED (${passed}).`);
