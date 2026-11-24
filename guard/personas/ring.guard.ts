import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const ringPolicy: PersonaGuardPolicy = {name: 'ring', ...readonlyBase()};
