import type {PersonaGuardPolicy} from '../types';

export function readonlyBase(): Omit<PersonaGuardPolicy, 'name'> {
  return {
    git: {allowIntegration: false, allowCommit: false, allowTag: false},
    gh: {allowPrEdit: false, allowRelease: false},
    release: {allowVersionWrite: false},
    scripts: {allowRepoRoot: false},
  };
}
