import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const thumbPolicy: PersonaGuardPolicy = {name: 'thumb', ...readonlyBase()};
