import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const guardPolicy: PersonaGuardPolicy = {name: 'guard', ...readonlyBase()};
