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
