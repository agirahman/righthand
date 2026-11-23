import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const pointPolicy: PersonaGuardPolicy = {name: 'point', ...readonlyBase()};
