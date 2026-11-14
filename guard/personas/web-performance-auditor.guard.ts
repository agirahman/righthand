import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const webPerformanceAuditorPolicy: PersonaGuardPolicy = {name: 'web-performance-auditor', ...readonlyBase()};
