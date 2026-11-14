import type { ProfileMode } from './personas.js';

export interface PromptPersona { name: string; role: string; mode: ProfileMode; desc: string; body: string; }

export interface PromptOptions {
  heading?: 'Persona' | 'persona';
  label?: string;
  sections?: string[];
  includeDesc?: boolean;
}

export function buildPersonaPrompt(persona: PromptPersona, options?: PromptOptions): string {
  const heading = options?.heading ?? 'Persona';
  const label = options?.label ?? persona.name;
  const lines = [
    heading === 'Persona'
      ? `## Active RightHand Persona: ${label} (${persona.role}) [mode: ${persona.mode}]`
      : `## Active RightHand persona: ${label} (${persona.mode})`,
    ...(options?.sections ?? []),
  ];
  if (options?.includeDesc !== false) lines.push(`> ${persona.desc}`);
  lines.push('', persona.body);
  return lines.join('\n');
}
