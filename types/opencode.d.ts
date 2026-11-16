declare module '@opencode/plugin' {
  export interface OpenCodeSessionContext {
    hook(name: 'context', handler: (event: { sessionID: string; system: Array<{ type: string; text: string }> }) => void | Promise<void>): Promise<{ dispose(): void | Promise<void> }>;
    get(input: { sessionID: string }): Promise<{ parentID?: string }>;
  }

  export interface OpenCodeToolContext {
    hook(name: 'execute.before', handler: (event: {
      tool: string;
      sessionID: string;
      agent: string;
      messageID: string;
      id: string;
      input: Record<string, unknown>;
    }) => void | Promise<void>): { dispose?(): void | Promise<void> } | void;
  }

  export interface OpenCodePermissionContext {
    hook(name: 'evaluate', handler: (event: { action: string; resources: string[]; effect?: 'allow' | 'deny' | 'ask'; message?: string }) => void | Promise<void>): void;
  }

  export interface OpenCodeSetupContext {
    session: OpenCodeSessionContext;
    tool: OpenCodeToolContext;
    permission: OpenCodePermissionContext;
  }

  export interface PluginDefinition {
    id: string;
    setup(context: OpenCodeSetupContext): unknown | Promise<unknown>;
  }

  export const Plugin: {
    define<T extends PluginDefinition>(definition: T): T;
  };
}

declare module '@opencode/plugin/tui' {
  export const Plugin: {
    define<T extends { id: string; setup(context: any): unknown }>(definition: T): T;
  };
  export function usePlugin(): unknown;
}

declare module 'solid-js' {
  export function Show(props: { when: unknown; children?: unknown }): unknown;
  export function createMemo<T>(fn: () => T): () => T;
}

declare namespace JSX {
  interface IntrinsicElements {
    text: { fg?: unknown; children?: unknown };
  }
}
