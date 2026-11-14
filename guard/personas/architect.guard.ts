import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const architectPolicy: PersonaGuardPolicy = {name: 'architect', ...readonlyBase()};
