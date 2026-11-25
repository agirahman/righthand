import { evaluateToolGuard } from '../../guard/engine.js';
import { getPackageProfilesDir, loadAllPersonas, type PersonaMetadata } from '../common/index.js';
import { readActivePersona, writeActivePersona } from '../common/state.js';
import { buildPersonaPrompt } from '../common/prompt.js';
import { buildStatusLabel } from '../common/status.js';
import { completionCandidates } from '../common/commands.js';
import { ompGuardMap } from './guard-map.js';

const packageProfilesDir = getPackageProfilesDir();
const loadOmpPersonas = (cwd: string): Map<string, PersonaMetadata> =>
  loadAllPersonas(cwd, { packageDir: packageProfilesDir });

export default function righthandOmpExtension(omp: any) {
  const syncStatus = (ctx: { cwd: string; ui: any }) => {
    const active = readActivePersona(ctx.cwd);
    if (active) {
      const persona = loadOmpPersonas(ctx.cwd).get(active);
      if (ctx.ui?.setStatus) {
        ctx.ui.setStatus('righthand', persona ? buildStatusLabel(persona) : `RightHand: ${active}`);
      }
    } else if (ctx.ui?.setStatus) {
      ctx.ui.setStatus('righthand', buildStatusLabel(null));
    }
  };

  if (typeof omp?.on === 'function') {
    omp.on('session_start', (_event: any, ctx: any) => {
      syncStatus(ctx);
    });

    omp.on('session_shutdown', (_event: any, ctx: any) => {
      if (ctx.ui?.setStatus) {
        ctx.ui.setStatus('righthand', buildStatusLabel(null));
      }
    });

    omp.on('tool_call', (event: any, ctx: any) => {
      try {
        const active = readActivePersona(ctx.cwd);
        if (!active) return;
        const persona = loadOmpPersonas(ctx.cwd).get(active);
        if (!persona || persona.mode !== 'readonly') return;
        const scratchDirs = process.env.COMMANDCODE_SCRATCHPAD ? [process.env.COMMANDCODE_SCRATCHPAD] : [];
        const decision = evaluateToolGuard(persona.mode, {
          toolName: event.toolName,
          input: event.input,
          cwd: ctx.cwd,
          scratchDirs,
          persona: active,
          harness: {
            ...ompGuardMap,
            shellKind: event.toolName === 'bash' ? 'posix' : event.toolName === 'powershell' ? 'powershell' : ompGuardMap.shellKind,
          },
        });
        if (decision.block) return { block: true, reason: decision.reason };
        return undefined;
      } catch {
        return { block: true, reason: 'Blocked: the readonly guard failed to evaluate this call.' };
      }
    });

    omp.on('before_agent_start', (event: any, ctx: any) => {
      const active = readActivePersona(ctx.cwd);
      if (!active) {
        if (event.systemPromptOptions?.sections) {
          delete event.systemPromptOptions.sections.righthand;
        }
        return;
      }

      const persona = loadOmpPersonas(ctx.cwd).get(active);
      if (!persona) return;

      if (event.systemPromptOptions?.sections) {
        event.systemPromptOptions.sections.righthand = buildPersonaPrompt(persona);
      }
    });
  }

  if (typeof omp?.registerCommand === 'function') {
    omp.registerCommand('righthand', {
      description: 'Manage RightHand active persona (list, off, <name>)',
      getArgumentCompletions: (prefix: string) => completionCandidates(loadOmpPersonas(process.cwd()).keys(), prefix),
      handler: async (args: string, ctx: any) => {
        const arg = (args || '').trim().toLowerCase();
        const personas = loadOmpPersonas(ctx.cwd);
        const active = readActivePersona(ctx.cwd);

        if (!arg || arg === 'list') {
          const names = Array.from(personas.keys()).sort();
          if (names.length === 0) {
            ctx.ui?.notify?.('No RightHand profiles found in profiles/', 'warning');
            return;
          }

          const items = [
            active ? `[Deactivate] off (currently active: ${active})` : '[Deactivate] off',
            ...names.map((name) => {
              const persona = personas.get(name)!;
              const mark = name === active ? '=> ' : '   ';
              return `${mark}${name} (${persona.role}) [${persona.mode}]`;
            }),
          ];

          if (typeof ctx.ui?.select === 'function') {
            const selected = await ctx.ui.select('Select RightHand Persona', items);
            if (!selected) return;

            if (selected.includes('[Deactivate] off')) {
              writeActivePersona(ctx.cwd, null);
              syncStatus(ctx);
              ctx.ui?.notify?.('RightHand persona deactivated', 'info');
              return;
            }

            const matchedName = names.find((name) => selected.includes(`${name} (`));
            if (matchedName) {
              writeActivePersona(ctx.cwd, matchedName);
              syncStatus(ctx);
              const persona = personas.get(matchedName)!;
              ctx.ui?.notify?.(`Switched to RightHand persona: ${matchedName} (${persona.role})`, 'info');
            }
          } else {
            ctx.ui?.notify?.(
              `RightHand Personas:\n` +
                names.map((name) => `  ${name === active ? '* ' : '  '}${name}`).join('\n'),
              'info'
            );
          }
          return;
        }

        if (arg === 'off' || arg === 'none') {
          writeActivePersona(ctx.cwd, null);
          syncStatus(ctx);
          ctx.ui?.notify?.('RightHand persona deactivated', 'info');
          return;
        }

        const persona = personas.get(arg);
        if (!persona) {
          ctx.ui?.notify?.(
            `Unknown persona "${arg}". Available: ${Array.from(personas.keys()).join(', ')}`,
            'error'
          );
          return;
        }

        writeActivePersona(ctx.cwd, arg);
        syncStatus(ctx);
        ctx.ui?.notify?.(`Switched to RightHand persona: ${persona.name} (${persona.role})`, 'info');
      },
    });
  }
}
