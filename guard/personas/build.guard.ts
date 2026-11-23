import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const buildPolicy: PersonaGuardPolicy = {name: 'build', ...readonlyBase()};
