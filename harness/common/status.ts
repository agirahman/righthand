export function buildStatusLabel(persona: { name: string; role: string } | null): string | undefined {
  return persona ? `RightHand: ${persona.name} (${persona.role})` : undefined;
}
