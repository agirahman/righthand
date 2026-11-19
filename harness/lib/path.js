'use strict';

const { spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';

function isInPath(bin) {
  const cmd = IS_WIN ? `where ${bin}` : `which ${bin}`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

module.exports = { isInPath };
