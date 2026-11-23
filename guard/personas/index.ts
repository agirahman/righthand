import type {PersonaGuardPolicy} from '../types';
import {readonlyBase} from './readonly-base';
import {palmPolicy} from './palm.guard';
import {indexPolicy} from './index.guard';
import {pinkyPolicy} from './pinky.guard';
import {thumbPolicy} from './thumb.guard';
import {ringPolicy} from './ring.guard';
import {middlePolicy} from './middle.guard';

export {readonlyBase};

export const PERSONA_POLICIES: Record<string, PersonaGuardPolicy> = {
  palm: palmPolicy,
  index: indexPolicy,
  pinky: pinkyPolicy,
  thumb: thumbPolicy,
  ring: ringPolicy,
  middle: middlePolicy,
};

export function resolvePersonaPolicy(name?: string): PersonaGuardPolicy {
  const normalizedName = name?.toLowerCase();
  return normalizedName && Object.hasOwn(PERSONA_POLICIES, normalizedName)
    ? PERSONA_POLICIES[normalizedName]
    : {name: normalizedName ?? '', ...readonlyBase()};
}
