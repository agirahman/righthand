declare module '@earendil-works/pi-coding-agent' {
  export interface ExtensionContext {
    ui: unknown;
    mode: "tui" | "rpc" | "json" | "print";
    hasUI: boolean;
    cwd: string;
  }

  interface ToolCallEventBase {
    type: "tool_call";
    toolCallId: string;
    parentToolCallId?: string;
  }

  export interface BashToolCallEvent extends ToolCallEventBase {
    toolName: "bash";
    input: { command: string; timeout?: number };
  }

  export interface PowerShellToolCallEvent extends ToolCallEventBase {
    toolName: "powershell";
    input: { command: string; timeout?: number };
  }

  export interface ReadToolCallEvent extends ToolCallEventBase {
    toolName: "read";
    input: { path: string; offset?: number; limit?: number };
  }

  export interface EditToolCallEvent extends ToolCallEventBase {
    toolName: "edit";
    input: { path: string; edits: Array<{ oldText: string; newText: string }> };
  }

  export interface WriteToolCallEvent extends ToolCallEventBase {
    toolName: "write";
    input: { path: string; content: string };
  }

  export interface GrepToolCallEvent extends ToolCallEventBase {
    toolName: "grep";
    input: {
      pattern: string;
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      limit?: number;
    };
  }

  export interface FindToolCallEvent extends ToolCallEventBase {
    toolName: "find";
    input: { pattern: string; path?: string; limit?: number };
  }

  export interface LsToolCallEvent extends ToolCallEventBase {
    toolName: "ls";
    input: { path?: string; limit?: number };
  }

  export interface CustomToolCallEvent extends ToolCallEventBase {
    toolName: string;
    input: Record<string, unknown>;
  }

  export type ToolCallEvent =
    | BashToolCallEvent
    | PowerShellToolCallEvent
    | ReadToolCallEvent
    | EditToolCallEvent
    | WriteToolCallEvent
    | GrepToolCallEvent
    | FindToolCallEvent
    | LsToolCallEvent
    | CustomToolCallEvent;

  export interface ToolCallEventResult {
    block?: boolean;
    reason?: string;
    terminate?: boolean;
  }

  export interface ExtensionAPI {
    on(
      event: "tool_call",
      handler: (event: ToolCallEvent, ctx: ExtensionContext) => ToolCallEventResult | void | Promise<ToolCallEventResult | void>
    ): () => void;
    on(event: string, handler: (event: any, ctx: any) => any): void;
    registerCommand(
      name: string,
      config: {
        description?: string;
        getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
        handler: (args: string, ctx: any) => Promise<void> | void;
      }
    ): void;
  }
}
