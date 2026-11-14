import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const testEngineerPolicy: PersonaGuardPolicy = {name: 'test-engineer', ...readonlyBase()};
