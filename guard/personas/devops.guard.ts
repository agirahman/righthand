import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const devopsPolicy: PersonaGuardPolicy = {name: 'devops', ...readonlyBase()};
