import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const scanPolicy: PersonaGuardPolicy = {name: 'scan', ...readonlyBase()};
