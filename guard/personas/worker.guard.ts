import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const workerPolicy: PersonaGuardPolicy = {name: 'worker', ...readonlyBase()};
