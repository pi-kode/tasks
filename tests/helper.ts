import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export async function harness(install: (pi: ExtensionAPI) => void) {
  const root = await mkdtemp(join(tmpdir(), 'pi-feature-'));
  const handlers = new Map<string, any[]>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const listeners = new Map<string, any[]>();
  const entries: any[] = [];
  const answers: any[] = [];
  const pi: any = {
    events: {
      emit: (name: string, data: any) => {
        for (const fn of listeners.get(name) ?? []) fn(data);
      },
      on: (name: string, fn: any) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        return () => {};
      },
    },
    on: (name: string, fn: any) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      return () => {};
    },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, value: any) => commands.set(name, value),
    appendEntry: (customType: string, data: any) =>
      entries.push({ type: 'custom', customType, data: structuredClone(data) }),
    sendMessage: () => {},
    getActiveTools: () => ['read', 'bash'],
    getAllTools: () => [],
  };
  install(pi);
  let runtime: any;
  pi.events.emit('pi-ko:tasks:v1', { accept: (s: any) => (runtime = s) });
  const ctx: any = {
    model: { provider: 'mock', id: 'mock' },
    cwd: root,
    hasUI: true,
    mode: 'tui',
    isProjectTrusted: () => true,
    getSystemPrompt: () => 'Test assistant',
    sessionManager: { getBranch: () => entries, getSessionId: () => 'test' },
    ui: { select: async () => answers.shift() ?? 'Allow once', setStatus: () => {}, notify: () => {} },
  };
  runtime.store = join(root, '.runtime');
  runtime.ready = true;
  return {
    root,
    tools,
    commands,
    runtime,
    ctx,
    entries,
    handlers,
    answers,
    pi,
    call: (name: string, input: any, signal?: AbortSignal) => tools.get(name).execute('call', input, signal, undefined, ctx),
    async emit(name: string, event: any = {}) {
      const results = [];
      for (const fn of handlers.get(name) ?? []) results.push(await fn(event, ctx));
      return results;
    },
    async close() {
      for (const fn of handlers.get('session_shutdown') ?? []) await fn({ reason: 'quit' }, ctx);
      await rm(root, { recursive: true, force: true });
    },
  };
}
