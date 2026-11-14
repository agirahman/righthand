import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const backendPolicy: PersonaGuardPolicy = {name: 'backend', ...readonlyBase()};
