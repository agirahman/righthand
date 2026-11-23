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
const scratchDir = path.join(os.tmpdir(), 't71-fix4');
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
  const source = fs.readFileSync(bundlePath, 'utf8').replace(/\r\n/g, '\n');
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
    check('fixture includes middle profile at package root', fs.existsSync(path.join(profilesDir, 'middle.md')));
    process.env.HOME = userHome;
    process.env.USERPROFILE = userHome;

    const serverPath = path.join(root, '.opencode-plugin', 'plugins', 'righthand-server.js');
    const tuiPath = process.env.RH_OPENCODE_TUI_BUNDLE || path.join(root, '.opencode-plugin', 'plugins', 'righthand-tui.js');
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

    const commonActiveFile = path.join(repoDir, '.righthand', 'state', 'active-persona.json');

    // F1: the plugin must resolve the project root from the host context, never
    // from the opencode service process cwd. The session state is deliberately
    // empty so only the project state file can name the persona.
    const serviceCwd = path.join(tempDir, 'service-cwd');
    fs.mkdirSync(serviceCwd, { recursive: true });
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: {} }));
    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: 'middle' }));
    const scopedServer = makeHarness(serverPath);
    const scopedContextFor = (harness) => ({
      location: { directory: repoDir },
      session: {
        async hook(name, handler) {
          harness.hooks.push({ group: 'session', name, handler });
          return { dispose() {} };
        },
        async get() { return {}; },
      },
      tool: {
        async hook(name, handler) {
          harness.hooks.push({ group: 'tool', name, handler });
          return { async dispose() {} };
        },
      },
      permission: {
        hook(name, handler) { harness.hooks.push({ group: 'permission', name, handler }); },
      },
    });
    const probeScoped = async (harness) => {
      process.chdir(serviceCwd);
      await harness.definition.setup(harness.context);
      const system = [];
      await harness.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system });
      let writeError = '';
      try {
        await harness.hooks.find((hook) => hook.name === 'execute.before').handler({
          tool: 'write', sessionID: sessionId, agent: 'test', messageID: 'scoped', id: 'scoped',
          input: { filePath: 'src/file.ts', content: 'x' },
        });
      } catch (error) { writeError = error.message; }
      process.chdir(repoDir);
      return { system, writeError };
    };
    scopedServer.context = scopedContextFor(scopedServer);
    const scoped = await probeScoped(scopedServer);
    check('project root comes from context.location.directory, not the service cwd',
      scoped.system[0]?.text.includes('## Active RightHand Persona: middle') === true);
    check('readonly enforcement takes its cwd from context.location.directory',
      scoped.writeError.startsWith('middle is readonly: writes are limited to .righthand/ and the scratchpad.'));
    console.log(`PROJECT ROOT PROBE: service cwd=${path.basename(serviceCwd)}; project=${path.basename(repoDir)}; prompt=${Boolean(scoped.system[0])}; write refusal="${scoped.writeError.slice(0, 60)}..."`);

    const projectRootMutation = server.source.replace(
      'const cwd = resolveProjectDirectory(context);',
      'const cwd = process.cwd();',
    );
    check('project root mutation changes the tracked bundle', projectRootMutation !== server.source);
    const projectRootMutationPath = path.join(tempDir, 'mutation-project-root-server.js');
    fs.writeFileSync(projectRootMutationPath, projectRootMutation);
    const projectRootMutationServer = makeHarness(projectRootMutationPath);
    projectRootMutationServer.context = scopedContextFor(projectRootMutationServer);
    const mutatedScoped = await probeScoped(projectRootMutationServer);
    await expectMutationFailure('project root from host context', async () => {
      assert.equal(mutatedScoped.system[0]?.text.includes('## Active RightHand Persona: middle'), true);
      assert.equal(mutatedScoped.writeError.startsWith('middle is readonly: writes are limited to .righthand/ and the scratchpad.'), true);
    });
    console.log(`BITE MUTATION project root: prompt=${Boolean(mutatedScoped.system[0])}; write refusal="${mutatedScoped.writeError.slice(0, 60)}..."`);
    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: {} }));

    const tui = makeHarness(tuiPath);
    let tuiList = '';
    const tuiToasts = [];
    const tuiContext = {
      storage: { store(_name, config) { return [config.initial, async () => {}]; } },
      keymap: { layer(factory) { tui.layers.push(factory()); } },
      ui: {
        slot(config) { tui.slots.push(config); },
        toast: { show(input) { tuiToasts.push(input.message); } },
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
    const runTui = tui.layers[0].commands.find((command) => command.slash?.name === 'righthand').run;
    const readGlobalActive = () => JSON.parse(fs.readFileSync(commonActiveFile, 'utf8'));
    const isWriteBlocked = async () => {
      try {
        await invoke('write', { filePath: 'src/file.ts', content: 'x' });
        return false;
      } catch {
        return true;
      }
    };
    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: 'middle' }));
    await runTui('list');
    check('TUI discovers .opencode profiles and marks common fallback active',
      tuiList.includes('legacy-specialist') && tuiList.includes('=> middle'));
    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: null }));
    writeState(null);
    await runTui('middle');
    const blockedBeforeSessionOff = await isWriteBlocked();
    await runTui('off');
    const allowedAfterSessionOff = !(await isWriteBlocked());
    const globalAfterSessionOff = readGlobalActive();
    const sessionAfterSessionOff = JSON.parse(fs.readFileSync(stateFile, 'utf8')).sessions;
    check('TUI activation blocks writes before off', blockedBeforeSessionOff);
    check('TUI off allows writes after session activation', allowedAfterSessionOff);
    check('TUI off clears global persona after session activation', globalAfterSessionOff.active === null);
    check('TUI off clears session persona after session activation', !sessionAfterSessionOff[sessionId]);
    console.log(`OFF PROBE session: toast=${tuiToasts.at(-1)}; global=${JSON.stringify(globalAfterSessionOff)}; session=${JSON.stringify(sessionAfterSessionOff)}; writeBlocked=${!allowedAfterSessionOff}`);

    fs.writeFileSync(commonActiveFile, JSON.stringify({ active: 'middle' }));
    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: {} }));
    const freshServer = await loadServer(serverPath);
    const invokeFresh = async () => {
      try {
        await freshServer.hooks.find((hook) => hook.name === 'execute.before').handler({
          tool: 'write', sessionID: sessionId, agent: 'test', messageID: 'after-global-off', id: 'after-global-off',
          input: { filePath: 'src/file.ts', content: 'x' },
        });
        return true;
      } catch {
        return false;
      }
    };
    await runTui('off');
    const allowedAfterGlobalOff = await invokeFresh();
    const globalAfterGlobalOff = readGlobalActive();
    check('TUI off allows writes when persona existed only globally', allowedAfterGlobalOff);
    check('TUI off clears global-only persona', globalAfterGlobalOff.active === null);
    console.log(`OFF PROBE global-only: toast=${tuiToasts.at(-1)}; global=${JSON.stringify(globalAfterGlobalOff)}; writeBlocked=${!allowedAfterGlobalOff}`);

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

    writeState('middle');
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
    const expectedWriteReason = 'middle is readonly: writes are limited to .righthand/ and the scratchpad. Put reports under .righthand/tickets/<ID>/reports/.';
    check('write and edit preserve the exact guard policy reason',
      readonlyWriteReason === expectedWriteReason && readonlyEditReason === expectedWriteReason);
    check('V2 write does not report unusable input', !readonlyWriteReason.includes('write input was unusable'));
    check('apply_patch refusal names the tool and is stable', readonlyPatchReason === 'apply_patch can rewrite any file, so it is refused for readonly personas');
    check('batch refusal explains static classification limits', readonlyBatchReason === 'batch wraps nested tool calls the guard cannot statically classify, so it is refused for readonly personas');
    check('normalization preserves host input keys without mutation', readonlyInput?.filePath === '.righthand/tickets/T71/reports/x.md' && !('file_path' in readonlyInput));
    console.log(`GUARD REFUSALS: write=${readonlyWriteReason}; apply_patch=${readonlyPatchReason}; batch=${readonlyBatchReason}`);
    console.log('GUARD INTERNAL FAILURE: Blocked: the readonly guard failed to evaluate this call.');
    check('per-call POSIX dialect blocks process substitution on Windows',
      readonlyDecisions['bash process substitution blocks under per-call POSIX dialect']);

    writeState('thumb');
    for (const [tool, input] of unrestrictedCases) {
      let rejected = false;
      try { await invoke(tool, input); } catch { rejected = true; }
      check(`writer allows ${tool}`, !rejected);
    }

    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: {} }));
    fs.writeFileSync(path.join(repoDir, '.righthand', 'state', 'active-persona.json'), JSON.stringify({ active: 'middle' }));
    const fallbackPrompt = [];
    await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: fallbackPrompt });
    let fallbackError = '';
    try { await invoke('write', { path: 'src/file.ts', content: 'x' }); } catch (error) { fallbackError = error.message; }
    check('common active persona fallback injects context prompt', fallbackPrompt[0]?.text.includes('## Active RightHand Persona: middle') === true);
    check('common active persona fallback blocks write', fallbackError === expectedWriteReason);
    console.log(`COMMON FALLBACK: context prompt=${fallbackPrompt[0]?.text.includes('## Active RightHand Persona: middle')}; write refusal=${fallbackError}`);

    const previousPersonaEnv = process.env.RIGHTHAND_PERSONA;
    try {
      process.env.RIGHTHAND_PERSONA = 'thumb';
      const envPrompt = [];
      await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: envPrompt });
      let envError = '';
      try { await invoke('write', { path: 'src/file.ts', content: 'x' }); } catch (error) { envError = error.message; }
      check('env channel overrides the file persona in the session context prompt', envPrompt[0]?.text.includes('## Active RightHand Persona: thumb') === true);
      check('env channel writer persona allows a src write while the file says readonly', envError === '');

      delete process.env.RIGHTHAND_PERSONA;
      const filePrompt = [];
      await server.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: filePrompt });
      let fileError = '';
      try { await invoke('write', { path: 'src/file.ts', content: 'x' }); } catch (error) { fileError = error.message; }
      check('unset env falls back to the file readonly persona', filePrompt[0]?.text.includes('## Active RightHand Persona: middle') === true && fileError === expectedWriteReason);
    } finally {
      if (previousPersonaEnv === undefined) delete process.env.RIGHTHAND_PERSONA;
      else process.env.RIGHTHAND_PERSONA = previousPersonaEnv;
    }

    const policyMutationPath = path.join(tempDir, 'mutation-policy-server.js');
    const policyMutation = server.source.replace(
      'throw new Error(refusal);',
      'throw new Error("Blocked: the readonly guard failed to evaluate this call.");',
    );
    check('policy refusal mutation changes the tracked bundle', policyMutation !== server.source);
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
    check('context fallback mutation changes the tracked bundle', contextMutation !== server.source);
    fs.writeFileSync(contextMutationPath, contextMutation);
    const contextMutationServer = await loadServer(contextMutationPath);
    const mutatedPrompt = [];
    await contextMutationServer.hooks.find((hook) => hook.group === 'session' && hook.name === 'context').handler({ sessionID: sessionId, system: mutatedPrompt });
    await expectMutationFailure('context fallback alignment', () => assert.equal(
      mutatedPrompt[0]?.text.includes('## Active RightHand Persona: middle'), true,
    ));
    console.log(`BITE MUTATION context fallback: injected prompt=${Boolean(mutatedPrompt[0])}; expected persona prompt=true`);

    writeState('middle');
    const throwingInput = Object.defineProperty({}, 'command', { get() { throw new Error('command getter crash'); } });
    const failureMutationPath = path.join(tempDir, 'mutation-failure-server.js');
    const failureMutation = server.source.replace(
      'catch {\n                throw new Error("Blocked: the readonly guard failed to evaluate this call.");\n            }',
      'catch (error) {\n                throw error;\n            }',
    );
    check('guard exception mutation changes the tracked bundle', failureMutation !== server.source);
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
    check('diagnostic mutation changes the tracked bundle', diagnosticBundle !== server.source);
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
    check('getter mutation changes the diagnostic bundle', getterMutation !== diagnosticBundle);
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
    check('context hook injects shared persona heading', prompt.system[0]?.text.includes('## Active RightHand Persona: middle') === true);
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
    const neutered = server.source.replace(dialectExpression, '"powershell"');
    check('dialect mutation changes the tracked bundle', neutered !== server.source);
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
