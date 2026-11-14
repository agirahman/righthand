import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const securityAuditorPolicy: PersonaGuardPolicy = {name: 'security-auditor', ...readonlyBase()};
