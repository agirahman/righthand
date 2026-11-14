import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const frontendPolicy: PersonaGuardPolicy = {name: 'frontend', ...readonlyBase()};
