import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const shapePolicy: PersonaGuardPolicy = {name: 'shape', ...readonlyBase()};
