import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';

export const productManagerPolicy: PersonaGuardPolicy = {name: 'product-manager', ...readonlyBase()};
