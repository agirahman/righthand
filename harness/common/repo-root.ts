import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function getRepoRoot(): string {
  try {
    if (typeof __dirname !== 'undefined') {
      let directory = resolve(__dirname);
      for (let depth = 0; depth < 10; depth++) {
        if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'profiles'))) {
          return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
      return resolve(__dirname, '../..');
    }
  } catch {}
  return process.cwd();
}

// Package profiles dir for a deployed bundle. Setup copies the package's
// profiles/ next to copy-harness artifacts as `righthand-profiles`, so a
// bundle loaded from an installed location finds its personas without the
// source checkout. Otherwise fall back to the checkout's profiles/ resolved
// by getRepoRoot(). Pure and deterministic: __dirname + filesystem only.
export function getPackageProfilesDir(): string {
  if (typeof __dirname !== 'undefined') {
    const bundled = join(__dirname, 'righthand-profiles');
    if (existsSync(bundled)) return bundled;
  }
  return join(getRepoRoot(), 'profiles');
}
