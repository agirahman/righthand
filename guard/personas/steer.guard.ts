import type {PersonaGuardPolicy} from '../types';

export const steerPolicy: PersonaGuardPolicy = {
  name: 'steer',
  git: {allowIntegration: true, allowCommit: true, allowTag: true},
  gh: {allowPrEdit: true, allowRelease: true},
  release: {allowVersionWrite: true},
  scripts: {allowRepoRoot: true},
};
