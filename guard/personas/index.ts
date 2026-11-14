import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';
import {architectPolicy} from './architect.guard';
import {backendPolicy} from './backend.guard';
import {codeReviewerPolicy} from './code-reviewer.guard';
import {devopsPolicy} from './devops.guard';
import {frontendPolicy} from './frontend.guard';
import {orchestratorPolicy} from './orchestrator.guard';
import {productManagerPolicy} from './product-manager.guard';
import {securityAuditorPolicy} from './security-auditor.guard';
import {testEngineerPolicy} from './test-engineer.guard';
import {webPerformanceAuditorPolicy} from './web-performance-auditor.guard';
import {workerPolicy} from './worker.guard';

export {readonlyBase};

export const PERSONA_POLICIES: Record<string, PersonaGuardPolicy> = {
  architect: architectPolicy,
  backend: backendPolicy,
  'code-reviewer': codeReviewerPolicy,
  devops: devopsPolicy,
  frontend: frontendPolicy,
  orchestrator: orchestratorPolicy,
  'product-manager': productManagerPolicy,
  'security-auditor': securityAuditorPolicy,
  'test-engineer': testEngineerPolicy,
  'web-performance-auditor': webPerformanceAuditorPolicy,
  worker: workerPolicy,
};

export function resolvePersonaPolicy(name?: string): PersonaGuardPolicy {
  const normalizedName = name?.toLowerCase();
  return normalizedName && Object.hasOwn(PERSONA_POLICIES, normalizedName)
    ? PERSONA_POLICIES[normalizedName]
    : {name: normalizedName ?? '', ...readonlyBase()};
}
