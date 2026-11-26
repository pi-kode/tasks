import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import { Check } from 'typebox/value';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { hash, textResult } from './utils.ts';
import { checklistComponent } from './checklist.ts';

export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy: string[];
  blocks: string[];
  owner?: string;
  metadata?: Record<string, unknown>;
}

export interface TasksState {
  tasks: Record<string, Task>;
  nextTask: number;
}

export const initialTasksState = (): TasksState => ({ tasks: {}, nextTask: 1 });

export function restoreTasksState(entries: readonly any[]): TasksState {
  let state = initialTasksState();
  for (const entry of entries) {
    if (entry.type === 'custom' && (entry.customType === 'pk:tasks' || entry.customType === 'cc:tasks') && entry.data) {
      state = {
        tasks: structuredClone(entry.data.tasks ?? {}),
        nextTask: typeof entry.data.nextTask === 'number' ? entry.data.nextTask : 1,
      };
    } else if (entry.type === 'custom' && entry.customType === 'code-compat:state' && entry.data?.tasks) {
      state = {
        tasks: structuredClone(entry.data.tasks),
        nextTask: typeof entry.data.nextTask === 'number' ? entry.data.nextTask : 1,
      };
    }
  }
  return state;
}

export class TasksRuntime {
  pi: ExtensionAPI;
  state: TasksState = initialTasksState();
  store = '';
  ready = false;
  private uiContext?: ExtensionContext;

  constructor(pi: ExtensionAPI) {
    this.pi = pi;
  }

  start(ctx: ExtensionContext): void {
    this.state = restoreTasksState(ctx.sessionManager.getBranch());
    this.store = join(
      homedir(),
      '.local/share/pi-code-compat',
      hash(ctx.cwd).slice(0, 24),
      hash(ctx.sessionManager.getSessionId()).slice(0, 24),
    );
    this.ready = true;
    this.status(ctx);
  }

  persist(): void {
    this.pi.appendEntry('pk:tasks', structuredClone(this.state));
    if (this.uiContext) this.status(this.uiContext);
  }

  status(ctx: ExtensionContext): void {
    this.uiContext = ctx;
    const tasks = Object.values(this.state.tasks);
    const open = tasks.filter(t => t.status !== 'completed').length;
    ctx.ui.setStatus('compat-tasks', tasks.length ? `${open} open tasks` : undefined);
    if (ctx.hasUI) {
      const ordered = [
        ...tasks.filter(task => task.status === 'in_progress'),
        ...tasks.filter(task => task.status === 'pending'),
        ...tasks.filter(task => task.status === 'completed'),
      ];
      ctx.ui.setWidget?.(
        'compat-todos',
        tasks.length ? (_tui: any, theme: any) => checklistComponent(theme, ordered, { maxRows: 8 }) : undefined,
      );
    }
  }

  message(content: string): void {
    this.pi.sendMessage({ customType: 'code-compat', content, display: true });
  }

  register(
    schema: TSchema,
    name: string,
    description: string,
    write: boolean,
    backend: (input: any, ctx: ExtensionContext, signal?: AbortSignal) => Promise<ReturnType<typeof textResult>>,
  ): void {
    const tool: ToolDefinition<any, any> = {
      name,
      label: name,
      description,
      parameters: schema,
      executionMode: write ? 'sequential' : 'parallel',
      execute: async (_id, raw, signal, _update, ctx) => {
        if (!this.ready) throw new Error('Tasks runtime is unavailable');
        const input: any = structuredClone(raw);
        if (!Check(schema, input)) throw new Error(`Invalid ${name} input`);
        const result = await backend(input, ctx, signal);
        this.status(ctx);
        return result;
      },
    };
    if (['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'].includes(name)) {
      tool.renderCall = (args: any, theme: any) => {
        const summary =
          name === 'TodoWrite'
            ? `${args?.todos?.length ?? 0} items`
            : typeof args?.taskId === 'string'
              ? `#${args.taskId}`
              : typeof args?.subject === 'string'
                ? args.subject
                : '';
        return {
          render: () => [`${theme.fg('toolTitle', theme.bold(name))}${summary ? ` ${theme.fg('muted', summary)}` : ''}`],
          invalidate: () => {},
        };
      };
      tool.renderResult = (result: any, options: any, theme: any) => {
        const tasks: Task[] = result?.details?.tasks ?? (result?.details?.task ? [result.details.task] : []);
        if (tasks.length) return checklistComponent(theme, tasks, { maxRows: options?.expanded ? undefined : 10 });
        const text = (result?.content ?? [])
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
          .trim();
        return {
          render: () => (text ? text.split('\n').map((line: string) => theme.fg('toolOutput', line)) : []),
          invalidate: () => {},
        };
      };
    }
    this.pi.registerTool(tool);
  }
}
