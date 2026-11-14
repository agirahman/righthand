export type RighthandAction =
  | { action: 'pick' }
  | { action: 'list' }
  | { action: 'off' }
  | { action: 'activate'; name: string };

export function parseRighthandArgs(args: string): RighthandAction {
  const arg = args.trim().toLowerCase();
  if (!arg || arg === 'pick') return { action: 'pick' };
  if (arg === 'list') return { action: 'list' };
  if (arg === 'off' || arg === 'none' || arg === 'default') return { action: 'off' };
  return { action: 'activate', name: arg };
}

export function completionCandidates(personas: Iterable<string>, prefix: string): { value: string; label: string }[] | null {
  const all = ['list', 'off', ...personas];
  const matches = all.filter((name) => name.startsWith(prefix.toLowerCase()));
  return matches.length > 0 ? matches.map((name) => ({ value: name, label: name })) : null;
}
