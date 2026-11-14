import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const codeReviewerPolicy: PersonaGuardPolicy = {name: 'code-reviewer', ...readonlyBase()};
