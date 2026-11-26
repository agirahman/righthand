import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// A generated ESM bundle has no CommonJS __dirname. The bundler inlines this
// marker with the directory of the generated file, which is where setup copies
// the righthand-profiles/ tree. Keep the other branches for source builds and
// VM-based validators that provide a CommonJS __dirname.
const { __dirname: runtimeDirname } = { __dirname: typeof __dirname !== 'undefined' ? __dirname : undefined };
declare const __RH_BUNDLE_DIR__: string | undefined;
function bundleDir(): string | undefined {
  if (typeof __RH_BUNDLE_DIR__ === 'string' && __RH_BUNDLE_DIR__.length > 0) return __RH_BUNDLE_DIR__;
  return runtimeDirname;
}

export function getRepoRoot(): string {
  try {
    const directory = bundleDir();
    if (directory) {
      let current = resolve(directory);
      for (let depth = 0; depth < 10; depth++) {
        if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'profiles'))) {
          return current;
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return resolve(directory, '../..');
    }
  } catch {}
  return process.cwd();
}

// Package profiles dir for a deployed bundle. Setup copies the package's
// profiles/ next to copy-harness artifacts as `righthand-profiles`, so a
// bundle loaded from an installed location finds its personas without the
// source checkout. Otherwise fall back to the checkout's profiles/ resolved
// by getRepoRoot(). Pure and deterministic: bundle directory + filesystem only.
export function getPackageProfilesDir(): string {
  try {
    const directory = bundleDir();
    if (directory) {
      const bundled = join(directory, 'righthand-profiles');
      if (existsSync(bundled)) return bundled;
    }
  } catch {}
  return join(getRepoRoot(), 'profiles');
}