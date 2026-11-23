import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const indexPolicy: PersonaGuardPolicy = {name: 'index', ...readonlyBase()};
