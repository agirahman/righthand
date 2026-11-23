import type {PersonaGuardPolicy} from '../types';

export const palmPolicy: PersonaGuardPolicy = {
  name: 'palm',
  git: {allowIntegration: true, allowCommit: true, allowTag: true},
  gh: {allowPrEdit: true, allowRelease: true},
  release: {allowVersionWrite: true},
  scripts: {allowRepoRoot: true},
};
