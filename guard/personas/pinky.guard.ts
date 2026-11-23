import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const pinkyPolicy: PersonaGuardPolicy = {name: 'pinky', ...readonlyBase()};
