export type ProfileMode = 'writer' | 'readonly';

export interface GuardContext {
  toolName: string;
  input: unknown;
  cwd: string;
  scratchDirs?: string[];
  persona?: string;
  harness?: HarnessGuardMap;
}

export interface GuardDecision {
  block: boolean;
  reason?: string;
}

export type ShellKind = 'powershell' | 'posix';

export type ShellVars = Map<string, string>;

export interface SubstitutionScan {
  inner: string[];
  masked: string;
}

export interface ShellRedirectScan {
  targets: string[];
  body: string;
}

export interface PersonaGuardPolicy {
  name: string;
  git: {
    allowIntegration: boolean;
    allowCommit: boolean;
    allowTag: boolean;
  };
  gh: {
    allowPrEdit: boolean;
    allowRelease: boolean;
  };
  release: {
    allowVersionWrite: boolean;
  };
  scripts: {
    allowRepoRoot: boolean;
  };
}

export interface HarnessGuardMap {
  toolAliases: Record<string, string>;
  shellTools: string[];
  shellKind: ShellKind;
}
