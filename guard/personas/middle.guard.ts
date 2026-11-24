import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const middlePolicy: PersonaGuardPolicy = {name: 'middle', ...readonlyBase()};
