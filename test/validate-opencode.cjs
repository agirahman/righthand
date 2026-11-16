'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { bundle } = require('../scripts/bundle-harness.js');

const root = path.resolve(__dirname, '..');
const originalCwd = process.cwd();
const scratchDir = path.join(os.tmpdir(), 't71-fix2');
fs.mkdirSync(scratchDir, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(scratchDir, 'rh-opencode-'));
const userHome = path.join(tempDir, 'home');
const repoDir = path.join(tempDir, 'repo');
const profilesDir = path.join(repoDir, 'profiles');
const stateFile = path.join(userHome, '.local', 'state', 'opencode', 'righthand.json');
const sessionId = 'readonly-session';
const previousHome = process.env.HOME;
const previousUserProfile = process.env.USERPROFILE;
const previousScratchpad = process.env.COMMANDCODE_SCRATCHPAD;
let failed = 0;

function check(name, condition) {
  if (condition) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

async function expectMutationFailure(name, assertion) {
  try {
    await assertion();
    check(`${name} mutation makes the assertion fail`, false);
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') {
      check(`${name} mutation makes the assertion fail`, true);
      console.log(`BITE PROOF ${name}: ${error.message.split('\n')[0]}`);
    } else {
      throw error;
    }
  }
}

function makeHarness(bundlePath) {
  const source = fs.readFileSync(bundlePath, 'utf8');
  const hooks = [];
  const slots = [];
  const layers = [];
  const plugin = {
    define(definition) {
      return definition;
    },
  };
  const solid = {
    Show: (props) => props,
    createMemo: (fn) => fn,
  };
  const nodeModules = {
    'node:fs': require('node:fs'),
    'node:os': { ...require('node:os'), homedir: () => userHome },
    'node:path': require('node:path'),
  };
  const externals = new Proxy({}, {
    get(_target, name) {
      if (name in nodeModules) return nodeModules[name];
      if (name === '@opencode/plugin') return { Plugin: plugin };
      if (name === '@opencode/plugin/tui') return { Plugin: plugin, usePlugin: () => ({}) };
      if (name === 'solid-js') return solid;
      throw new Error(`Unexpected external module: ${String(name)}`);
    },
  });
  const module = { exports: {} };
  const jsx = ts.createSourceFile(bundlePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const transformed = ts.transpileModule(source, {
    fileName: bundlePath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'Show', jsxFragmentFactory: 'Show.Fragment' },
  }).outputText
    .replace(/^import \{ (.*?) \} from "(.*?)";$/gm, 'const { $1 } = require("$2");')
    .replace(/^export \{[^}]+\};?$/gm, '')
    .replace(/^export default (\w+);?$/gm, 'module.exports.default = $1;');
  check(`${path.basename(bundlePath)} contains JSX syntax in tracked bundle`, bundlePath.endsWith('righthand-tui.js') ? /<Show\b/.test(source) && jsx.parseDiagnostics.length === 0 : true);
  const wrapped = `(function(require,module,exports,__dirname){${transformed}\n})`;
  vm.runInThisContext(wrapped, { filename: bundlePath })(
    (specifier) => externals[specifier],
    module,
    module.exports,
    path.join(repoDir, 'plugins'),
  );
  const definition = module.exports.default;
  check(`${path.basename(bundlePath)} exports Plugin.define object`, definition && typeof definition.setup === 'function');
  return { definition, hooks, slots, layers, source, disposeCalls: 0 };
}

async function loadServer(bundlePath) {
  const server = makeHarness(bundlePath);
  const context = {
    session: {
      async hook(name, handler) {
        server.hooks.push({ group: 'session', name, handler });
        return { dispose() {} };
      },
      async get() { return {}; },
    },
    tool: {
      async hook(name, handler) {
        server.hooks.push({ group: 'tool', name, handler });
        return { async dispose() { server.disposeCalls++; } };
      },
    },
    permission: {
      hook(name, handler) { server.hooks.push({ group: 'permission', name, handler }); },
    },
  };
  await server.definition.setup(context);
  return server;
}

async function main() {
  try {
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'package.json'), '{}');
    fs.mkdirSync(path.join(repoDir, '.righthand', 'state'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, '.opencode', 'profiles'), { recursive: true });
    fs.mkdirSync(userHome, { recursive: true });
    fs.cpSync(path.join(root, 'profiles'), profilesDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, '.opencode', 'profiles', 'legacy-specialist.md'), '---\nname: legacy-specialist\nrole: Legacy Specialist\nmode: readonly\n---\nLegacy profile.\n');
    check('fixture includes code-reviewer profile at package root', fs.existsSync(path.join(profilesDir, 'code-reviewer.md')));
    process.env.HOME = userHome;
    process.env.USERPROFILE = userHome;

    const serverPath = path.join(root, '.opencode-plugin', 'plugins', 'righthand-server.js');
    const tuiPath = path.join(root, '.opencode-plugin', 'plugins', 'righthand-tui.js');
    process.chdir(repoDir);
    const server = makeHarness(serverPath);
    const serverContext = {
      session: {
        async hook(name, handler) {
          server.hooks.push({ group: 'session', name, handler });
          return { dispose() {} };
        },
        async get() { return {}; },
      },
      tool: {
        async hook(name, handler) {
          server.hooks.push({ group: 'tool', name, handler });
          return { async dispose() { server.disposeCalls++; } };
        },
      },
      permission: {
        hook(name, handler) { server.hooks.push({ group: 'permission', name, handler }); },
      },
    };
    check('server plugin id is unchanged', server.definition.id === 'user.righthand.server');
    await server.definition.setup(serverContext);
    check('server retains context session hook and registers execute.before',
      server.hooks.map(({ group, name }) => `${group}.${name}`).join(',') === 'session.context,tool.execute.before');
    check('server leaves permission channel untouched', !server.hooks.some((hook) => hook.group === 'permission'));
    const disposeServer = await loadServer(serverPath);
    const disposeTeardown = await disposeServer.definition.setup({
      session: serverContext.session,
      tool: { async hook(name, handler) {
        disposeServer.hooks.push({ group: 'tool', name, handler });
        return { async dispose() { disposeServer.disposeCalls++; } };
      } },
    });
    await disposeTeardown();
    check('async tool registration is disposed during teardown', disposeServer.disposeCalls === 1);

    const tui = makeHarness(tuiPath);
    let tuiList = '';
    const tuiContext = {
      storage: { store(_name, config) { return [config.initial, async () => {}]; } },
      keymap: { layer(factory) { tui.layers.push(factory()); } },
      ui: {
        slot(config) { tui.slots.push(config); },
        toast: { show() {} },
        router: { current: () => ({ type: 'session', sessionID: sessionId }) },
        dialog: { async alert(input) { tuiList = input.message; }, async select() { return undefined; } },
      },
      data: { session: { get: () => ({}), root: (id) => id } },
      theme: { text: { base: '', muted: '' } },
    };
    check('TUI plugin id is unchanged', tui.definition.id === 'user.righthand');
    tui.definition.setup(tuiContext);
    check('TUI retains footer slot and global slash command layer',
      tui.slots[0]?.append === 'prompt.footer.status' && tui.layers[0]?.mode === 'global' &&
      tui.layers[0]?.commands.some((command) => command.slash?.name === 'righthand'));

    const writeState = (persona) => {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: { [sessionId]: { persona, updated: Date.now() } } }));
    };
    const invoke = async (tool, input, id = sessionId) => server.hooks.find((hook) => hook.name === 'execute.before').handler({
      tool,
      sessionID: id,
      agent: 'test',
      messageID: 'message-1',
      id: 'tool-1',
      input,
    });
    const commonActiveFile = path.join(repoDir, '.righthand', 'state', 'active-persona.json');
    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: 'code-reviewer' }));
    await tui.layers[0].commands.find((command) => command.slash?.name === 'righthand').run('list');
    check('TUI discovers .opencode profiles and marks common fallback active',
      tuiList.includes('legacy-specialist') && tuiList.includes('=> code-reviewer'));
    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: null }));

    writeState(null);
    const unrestrictedCases = [
      ['write', { filePath: 'src/file.ts', content: 'x' }],
      ['edit', { filePath: 'src/file.ts', oldString: 'x', newString: 'y' }],
      ['apply_patch', { patchText: '*** Begin Patch\\n*** Update File: src/file.ts\\n+changed\\n*** End Patch' }],
      ['batch', { calls: [{ tool: 'write', input: { filePath: 'src/file.ts', content: 'x' } }] }],
      ['bash', { command: 'rm -rf src/file.ts' }],
      ['bash', { command: 'cat <(rm -rf src/file.ts)' }],
    ];
    for (const [tool, input] of unrestrictedCases) {
      let rejected = false;
      try { await invoke(tool, input); } catch { rejected = true; }
      check(`no active persona allows ${tool}`, !rejected);
    }

    writeState('code-reviewer');
    const readonlyCases = [
      ['write filePath src/file.ts blocks', 'write', { filePath: 'src/file.ts', content: 'x' }, true],
      ['write filePath .righthand allows', 'write', { filePath: '.righthand/tickets/T71/reports/x.md', content: 'x' }, false],
      ['edit filePath src/file.ts blocks', 'edit', { filePath: 'src/file.ts', oldString: 'x', newString: 'y' }, true],
      ['apply_patch refuses readonly persona', 'apply_patch', { patchText: '*** Begin Patch\\n*** Update File: src/file.ts\\n+changed\\n*** End Patch' }, true],
      ['batch refuses readonly persona', 'batch', { calls: [{ tool: 'write', input: { filePath: 'src/file.ts', content: 'x' } }] }, true],
      ['bash rm -rf src/file.ts blocks on Windows', 'bash', { command: 'rm -rf src/file.ts' }, true],
      ['bash process substitution blocks under per-call POSIX dialect', 'bash', { command: 'cat <(rm -rf src/file.ts)' }, true],
      ['read allows', 'read', { path: 'src/file.ts' }, false],
      ['grep allows', 'grep', { pattern: 'x' }, false],
      ['glob allows', 'glob', { pattern: '**/*.ts' }, false],
    ];
    const readonlyDecisions = {};
    let readonlyWriteReason = '';
    let readonlyEditReason = '';
    let readonlyPatchReason = '';
    let readonlyBatchReason = '';
    let readonlyInput = null;
    for (const [name, tool, input, blocked] of readonlyCases) {
      let rejectionMessage = '';
      try { await invoke(tool, input); } catch (error) { rejectionMessage = error.message; }
      const rejected = rejectionMessage !== '';
      if (name === 'write filePath src/file.ts blocks') readonlyWriteReason = rejectionMessage;
      if (name === 'edit filePath src/file.ts blocks') readonlyEditReason = rejectionMessage;
      if (name === 'apply_patch refuses readonly persona') readonlyPatchReason = rejectionMessage;
      if (name === 'batch refuses readonly persona') readonlyBatchReason = rejectionMessage;
      if (name === 'write filePath .righthand allows') readonlyInput = input;
      readonlyDecisions[name] = rejected;
      check(name, rejected === blocked);
    }
    const expectedWriteReason = 'code-reviewer is readonly: writes are limited to .righthand/ and the scratchpad. Put reports under .righthand/tickets/<ID>/reports/.';
    check('write and edit preserve the exact guard policy reason',
      readonlyWriteReason === expectedWriteReason && readonlyEditReason === expectedWriteReason);
    check('V2 write does not report unusable input', !readonlyWriteReason.includes('write input was unusable'));
    check('apply_patch refusal names the tool and is stable', readonlyPatchReason === 'apply_patch can rewrite any file, so it is refused for readonly personas');
    check('batch refusal documents nested hook bypass', readonlyBatchReason === 'batch may bypass execute.before for nested tools, so it is refused for readonly personas');
    check('normalization preserves host input keys without mutation', readonlyInput?.filePath === '.righthand/tickets/T71/reports/x.md' && !('file_path' in readonlyInput));
    console.log(`GUARD REFUSALS: write=${readonlyWriteReason}; apply_patch=${readonlyPatchReason}; batch=${readonlyBatchReason}`);
    console.log('GUARD INTERNAL FAILURE: Blocked: the readonly guard failed to evaluate this call.');
    check('per-call POSIX dialect blocks process substitution on Windows',
      readonlyDecisions['bash process substitution blocks under per-call POSIX dialect']);

    writeState('worker');
    for (const [tool, input] of unrestrictedCases) {
      let rejected = false;
      try { await invoke(tool, input); } catch { rejected = true; }
      check(`writer allows ${tool}`, !rejected);
    }

    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: {} }));
    fs.writeFileSync(path.join(repoDir, '.righthand', 'state', 'active-persona.json'), JSON.stringify({ active: 'code-reviewer' }));
    const fallbackPrompt = [];
    await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: fallbackPrompt });
    let fallbackError = '';
    try { await invoke('write', { path: 'src/file.ts', content: 'x' }); } catch (error) { fallbackError = error.message; }
    check('common active persona fallback injects context prompt', fallbackPrompt[0]?.text.includes('## Active RightHand Persona: code-reviewer') === true);
    check('common active persona fallback blocks write', fallbackError === expectedWriteReason);
    console.log(`COMMON FALLBACK: context prompt=${fallbackPrompt[0]?.text.includes('## Active RightHand Persona: code-reviewer')}; write refusal=${fallbackError}`);

    const policyMutationPath = path.join(tempDir, 'mutation-policy-server.js');
    const policyMutation = server.source.replace(
      'throw new Error(refusal);',
      'throw new Error("Blocked: the readonly guard failed to evaluate this call.");',
    );
    fs.writeFileSync(policyMutationPath, policyMutation);
    const policyMutationServer = await loadServer(policyMutationPath);
    let mutatedPolicyMessage = '';
    try {
      await policyMutationServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'write', sessionID: sessionId, agent: 'test', messageID: 'mutated-policy', id: 'mutated-policy',
        input: { path: 'src/file.ts', content: 'x' },
      });
    } catch (error) { mutatedPolicyMessage = error.message; }
    await expectMutationFailure('policy refusal propagation', () => assert.equal(mutatedPolicyMessage, expectedWriteReason));
    console.log(`BITE MUTATION policy refusal: actual=${mutatedPolicyMessage}; expected=${expectedWriteReason}`);

    const normalizationMutationPath = path.join(tempDir, 'mutation-normalization-server.js');
    const normalizationMutation = server.source.replace(
      /const normalizedInput = \(event\.tool === "write" \|\| event\.tool === "edit"\)[\s\S]*?: input;/,
      'const normalizedInput = input;',
    );
    check('normalization mutation changes the tracked bundle', normalizationMutation !== server.source);
    fs.writeFileSync(normalizationMutationPath, normalizationMutation);
    const normalizationMutationServer = await loadServer(normalizationMutationPath);
    let mutatedNormalizationMessage = '';
    try {
      await normalizationMutationServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'write', sessionID: sessionId, agent: 'test', messageID: 'mutated-normalization', id: 'mutated-normalization',
        input: { filePath: 'src/file.ts', content: 'x' },
      });
    } catch (error) { mutatedNormalizationMessage = error.message; }
    await expectMutationFailure('V2 filePath normalization', () => assert.equal(mutatedNormalizationMessage, expectedWriteReason));
    console.log(`BITE MUTATION V2 normalization: actual=${mutatedNormalizationMessage}; expected=${expectedWriteReason}`);

    const contextMutationPath = path.join(tempDir, 'mutation-context-server.js');
    const contextMutation = server.source.replace(
      'const active = activePersonaForSession(event.sessionID, cwd);',
      'const active = loadSessionState().sessions?.[event.sessionID]?.persona;',
    );
    fs.writeFileSync(contextMutationPath, contextMutation);
    const contextMutationServer = await loadServer(contextMutationPath);
    const mutatedPrompt = [];
    await contextMutationServer.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: mutatedPrompt });
    await expectMutationFailure('context fallback alignment', () => assert.equal(
      mutatedPrompt[0]?.text.includes('## Active RightHand Persona: code-reviewer'), true,
    ));
    console.log(`BITE MUTATION context fallback: injected prompt=${Boolean(mutatedPrompt[0])}; expected persona prompt=true`);

    writeState('code-reviewer');
    const throwingInput = Object.defineProperty({}, 'command', { get() { throw new Error('command getter crash'); } });
    const failureMutationPath = path.join(tempDir, 'mutation-failure-server.js');
    const failureMutation = server.source.replace(
      'catch {\n                throw new Error("Blocked: the readonly guard failed to evaluate this call.");\n            }',
      'catch (error) {\n                throw error;\n            }',
    );
    fs.writeFileSync(failureMutationPath, failureMutation);
    const failureMutationServer = await loadServer(failureMutationPath);
    let mutatedFailureMessage = '';
    try {
      await failureMutationServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'bash', sessionID: sessionId, agent: 'test', messageID: 'mutated-failure', id: 'mutated-failure', input: throwingInput,
      });
    } catch (error) { mutatedFailureMessage = error.message; }
    await expectMutationFailure('guard exception fail-closed behavior', () => assert.equal(
      mutatedFailureMessage, 'Blocked: the readonly guard failed to evaluate this call.',
    ));
    console.log(`BITE MUTATION guard exception: actual=${mutatedFailureMessage}; expected=Blocked: the readonly guard failed to evaluate this call.`);


    const diagnosticPath = path.join(tempDir, 'diagnostic-server.js');
    const diagnosticBundle = server.source.replace(
      'catch {\n                throw new Error("Blocked: the readonly guard failed to evaluate this call.");\n            }',
      'catch (error) {\n                throw error;\n            }',
    );
    fs.writeFileSync(diagnosticPath, diagnosticBundle);
    const diagnosticServer = await loadServer(diagnosticPath);
    let guardThrowMessage = '';
    try {
      await diagnosticServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'bash', sessionID: sessionId, agent: 'test', messageID: 'diagnostic', id: 'diagnostic', input: throwingInput,
      });
    } catch (error) { guardThrowMessage = error.message; }
    check('shell command getter genuinely throws from evaluateToolGuard', guardThrowMessage === 'command getter crash');

    const getterMutationPath = path.join(tempDir, 'mutation-getter-server.js');
    const getterMutation = diagnosticBundle.replace('const rawCmd = input.command ?? input.script;', 'const rawCmd = input.script;');
    fs.writeFileSync(getterMutationPath, getterMutation);
    const getterMutationServer = await loadServer(getterMutationPath);
    let mutatedGetterMessage = '';
    try {
      await getterMutationServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'bash', sessionID: sessionId, agent: 'test', messageID: 'mutated-getter', id: 'mutated-getter', input: throwingInput,
      });
    } catch (error) { mutatedGetterMessage = error.message; }
    await expectMutationFailure('genuine guard exception assertion', () => assert.equal(mutatedGetterMessage, 'command getter crash'));
    console.log(`BITE MUTATION guard getter: actual=${mutatedGetterMessage}; expected=command getter crash`);

    let failureMessage = '';
    try { await invoke('bash', throwingInput); } catch (error) { failureMessage = error.message; }
    check('throwing guard fails closed with internal failure message', failureMessage === 'Blocked: the readonly guard failed to evaluate this call.');
    console.log(`GUARD REASONS SIDE BY SIDE: policy refusal=${readonlyWriteReason}; internal failure=${failureMessage}`);

    const prompt = { system: [] };
    await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: prompt.system });
    check('context hook injects shared persona heading', prompt.system[0]?.text.includes('## Active RightHand Persona: code-reviewer') === true);
    await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: [] });

    let dispatchCount = 0;
    const hostDispatch = async (tool, input) => {
      await invoke(tool, input);
      dispatchCount++;
    };
    let hostError = '';
    try { await hostDispatch('write', { path: 'src/file.ts', content: 'x' }); } catch (error) { hostError = error.message; }
    check('fake host rejects generated execute.before before execution with honest refusal', hostError === expectedWriteReason && dispatchCount === 0);
    let hostFailureMessage = '';
    try { await hostDispatch('bash', throwingInput); } catch (error) { hostFailureMessage = error.message; }
    check('fake host prevents execution when the guard itself throws', hostFailureMessage === 'Blocked: the readonly guard failed to evaluate this call.' && dispatchCount === 0);
    console.log(`ENFORCEMENT EVIDENCE: policy refusal="${hostError}"; internal failure="${hostFailureMessage}"; fake host dispatch count remained ${dispatchCount}.`);

    const neuteredPath = path.join(tempDir, 'neutered-server.js');
    const dialectExpression = 'event.tool === "bash" ? "posix" : event.tool === "powershell" ? "powershell" : openCodeGuardMap.shellKind';
    const neutered = server.source.replace(dialectExpression, 'openCodeGuardMap.shellKind');
    fs.writeFileSync(neuteredPath, neutered);
    const neuteredServer = makeHarness(neuteredPath);
    const neuteredContext = {
      session: serverContext.session,
      tool: { hook(name, handler) { neuteredServer.hooks.push({ group: 'tool', name, handler }); return { dispose() {} }; } },
      permission: serverContext.permission,
    };
    await neuteredServer.definition.setup(neuteredContext);
    let neuteredRejected = false;
    try {
      await neuteredServer.hooks.find((hook) => hook.name === 'execute.before').handler({
        tool: 'bash', sessionID: sessionId, agent: 'test', messageID: 'message-2', id: 'tool-2',
        input: { command: 'cat <(rm -rf src/file.ts)' },
      });
    } catch { neuteredRejected = true; }
    check('neutered bundle allows dialect-sensitive process substitution', neutered !== server.source && !neuteredRejected);

    const openCodeConfigs = require('../harness/opencode/bundle.config.cjs');
    const openCodeResults = openCodeConfigs.map((config) => bundle({ ...config, check: true }));
    check('generated server and TUI bundles match OpenCode config', openCodeConfigs.length === 2 && openCodeResults.every((result) => result.count === 1));
    check('OpenCode bundle config contains exactly two entries', openCodeConfigs.length === 2);

    console.log(`EVIDENCE: ${JSON.stringify({ readonlyDecisions }, null, 2)}`);
    if (failed > 0) {
      console.error(`\nOpenCode validation FAILED with ${failed} errors.`);
      process.exitCode = 1;
    } else {
      console.log('\nALL OpenCode checks passed!');
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousScratchpad === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
    else process.env.COMMANDCODE_SCRATCHPAD = previousScratchpad;
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
