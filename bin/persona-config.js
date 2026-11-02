'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG_REL = '.righthand/persona.json';
const SUPPORTED_DISPATCH_HARNESSES = ['commandcode'];

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function configPath(cwd = process.cwd()) {
  return path.join(cwd, CONFIG_REL);
}

function validateConfig(input, file) {
  let data = input;
  let fileLabel = file;
  if (typeof input === 'string') {
    if (fs.existsSync(input)) {
      fileLabel = fileLabel || input;
      try {
        data = fs.readFileSync(input, 'utf8');
      } catch (e) {
        throw new ConfigError(`Unable to read ${fileLabel || input}: ${e.message}`);
      }
    }
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new ConfigError(`Invalid JSON in ${fileLabel || CONFIG_REL}: ${e.message}`);
      }
    }
  }
  if (!fileLabel) fileLabel = CONFIG_REL;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ConfigError(`${fileLabel}: root must be a JSON object`);
  }

  for (const key of Object.keys(data)) {
    if (key !== 'personas') {
      throw new ConfigError(`${fileLabel}: unknown top-level key "${key}"`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'personas')) {
    const personas = data.personas;
    if (typeof personas !== 'object' || personas === null || Array.isArray(personas)) {
      throw new ConfigError(`${fileLabel}: "personas" must be an object`);
    }
    for (const [name, entry] of Object.entries(personas)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new ConfigError(`${fileLabel}: persona "${name}" entry must be an object`);
      }
      for (const field of Object.keys(entry)) {
        if (field !== 'model' && field !== 'harness') {
          throw new ConfigError(`${fileLabel}: unknown field "${field}" in persona "${name}"`);
        }
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'model')) {
        const m = entry.model;
        if (typeof m !== 'string' || m.trim() === '') {
          throw new ConfigError(`${fileLabel}: "model" must be a non-empty string for persona "${name}"`);
        }
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'harness')) {
        const h = entry.harness;
        if (typeof h !== 'string' || h.trim() === '') {
          throw new ConfigError(`${fileLabel}: "harness" must be a non-empty string for persona "${name}"`);
        }
        if (h !== 'commandcode') {
          throw new ConfigError(`${fileLabel}: unsupported harness "${h}" for persona "${name}"; supported harnesses: ${SUPPORTED_DISPATCH_HARNESSES.join(', ')}`);
        }
      }
    }
  }

  return data;
}

function readConfig(cwd = process.cwd()) {
  const p = configPath(cwd);
  if (!fs.existsSync(p)) return {};
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    throw new ConfigError(`Unable to read ${p}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(`Invalid JSON in ${p}: ${e.message}`);
  }
  return validateConfig(data, p);
}

function orchestratorModel() {
  const paneId = process.env.HERDR_PANE_ID;
  if (!paneId) return null;
  const bin = process.env.HERDR_BIN_PATH || 'herdr';
  let r;
  try {
    r = spawnSync(bin, ['agent', 'list'], { encoding: 'utf8', timeout: 5000 });
  } catch (e) {
    return null;
  }
  if (!r || r.error || r.status !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    return null;
  }
  const agents = parsed && parsed.result && Array.isArray(parsed.result.agents)
    ? parsed.result.agents
    : null;
  if (!agents) return null;
  const match = agents.find((a) => a && a.pane_id === paneId);
  if (!match) return null;
  const model = match.tokens && typeof match.tokens.model === 'string' ? match.tokens.model : null;
  if (!model || model.trim() === '') return null;
  return model;
}

function resolvePersona(cwd, name, options) {
  options = options || {};
  const config = readConfig(cwd);
  const personas = (config && config.personas) || {};
  const entry = Object.prototype.hasOwnProperty.call(personas, name) ? personas[name] : null;

  let harness;
  let harnessSource;
  if (entry && typeof entry.harness === 'string' && entry.harness !== '') {
    harness = entry.harness;
    harnessSource = 'persona';
  } else {
    harness = 'commandcode';
    harnessSource = 'orchestrator';
  }

  let model;
  let modelSource;
  if (entry && typeof entry.model === 'string' && entry.model !== '') {
    model = entry.model;
    modelSource = 'persona';
  } else {
    let om;
    if (Object.prototype.hasOwnProperty.call(options, 'orchestratorModel')) {
      om = options.orchestratorModel;
    } else {
      om = orchestratorModel();
    }
    if (typeof om === 'string' && om.trim() !== '') {
      model = om;
      modelSource = 'orchestrator';
    } else {
      model = '';
      modelSource = 'harness-default';
    }
  }

  const result = {
    persona: name,
    name: name,
    harness: harness,
    harness_source: harnessSource,
    harnessSource: harnessSource,
    model: model,
    model_source: modelSource,
    modelSource: modelSource,
  };
  return result;
}

function formatResolution(...args) {
  let res;
  if (typeof args[0] === 'string') {
    res = resolvePersona(args[0], args[1], args[2] || {});
  } else {
    res = args[0] || {};
  }
  const persona = res.persona || res.name || '';
  const harness = res.harness || '';
  const harnessSource = res.harness_source || res.harnessSource || '';
  const model = res.model == null ? '' : res.model;
  const modelSource = res.model_source || res.modelSource || '';
  return `persona=${persona} harness=${harness} harness_source=${harnessSource} model=${model} model_source=${modelSource}`;
}

module.exports = {
  CONFIG_REL,
  ConfigError,
  SUPPORTED_DISPATCH_HARNESSES,
  configPath,
  readConfig,
  orchestratorModel,
  resolvePersona,
  formatResolution,
  validateConfig,
};
