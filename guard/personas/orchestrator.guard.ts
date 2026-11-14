import type {PersonaGuardPolicy} from '../types';

export const orchestratorPolicy: PersonaGuardPolicy = {
  name: 'orchestrator',
  git: {allowIntegration: true, allowCommit: true, allowTag: true},
  gh: {allowPrEdit: true, allowRelease: true},
  release: {allowVersionWrite: true},
  scripts: {allowRepoRoot: true},
};
