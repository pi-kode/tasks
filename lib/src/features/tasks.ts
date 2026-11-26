import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { join } from 'node:path';
import { TasksRuntime } from '../runtime/tasks.ts';
import { registerTasks } from '../extensions/tasks.ts';
import { Jobs } from '../backends/jobs.ts';
import { textResult, humanReadable } from '../runtime/utils.ts';

const CHANNEL = 'pi-ko:tasks:v1';

export default function (pi: ExtensionAPI): void {
  let existing: TasksRuntime | undefined;
  pi.events.emit(CHANNEL, { accept: (value: TasksRuntime) => { existing = value; } });
  if (existing) {
    existing.pi = pi;
    return;
  }

  const r = new TasksRuntime(pi);
  const unsubscribe = pi.events.on(CHANNEL, (request: any) => request.accept(r));

  registerTasks(r);

  let jobs: Jobs | undefined;
  pi.on('session_start', async (_e, ctx) => {
    r.start(ctx);
    await jobs?.close();
    jobs = new Jobs(join(r.store, 'jobs'), job => r.message(`Background job ${job.id}: ${job.status}`));
    await jobs.reconcile();
  });
  pi.on('session_tree', (_e, ctx) => r.start(ctx));
  pi.on('session_shutdown', async e => {
    await jobs?.close();
    r.ready = false;
    if (e.reason === 'reload' || e.reason === 'quit') unsubscribe();
  });
  pi.on('agent_settled', (_e, ctx) => r.status(ctx));

  pi.on('before_agent_start', () => {
    if (!r.ready) return;
    const tasks = Object.values(r.state.tasks);
    if (!tasks.length) return;
    return {
      message: {
        customType: 'code-compat:tasks',
        content: `Active tasks:\n${JSON.stringify(tasks)}`,
        display: false,
      },
    };
  });

  const registry = () => {
    if (!jobs) throw Error('Job supervisor is unavailable');
    return jobs;
  };
  const jobId = Type.String({ pattern: '^[0-9a-f-]{36}$' });

  r.register(
    Type.Object({ command: Type.String({ minLength: 1 }), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600000 })) }, { additionalProperties: false }),
    'TaskRun',
    'Start a background shell job. Requires permission. Returns a stable job ID; use TaskOutput and TaskStop. Jobs are stopped on graceful shutdown; crash leftovers are marked interrupted on restart.',
    true,
    async (input, ctx) => {
      const job = await registry().start(input.command, ctx.cwd, input.timeout);
      return textResult(humanReadable(job), { job });
    },
  );

  r.register(
    Type.Object(
      { task_id: jobId, block: Type.Optional(Type.Boolean()), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 30000 })) },
      { additionalProperties: false },
    ),
    'TaskOutput',
    'Retrieve retained background job output/status. Optional block waits up to timeout milliseconds (default 1000, maximum 30000).',
    false,
    async (input, _ctx, signal) => {
      const deadline = Date.now() + (input.block ? input.timeout ?? 1000 : 0);
      let result;
      do {
        signal?.throwIfAborted();
        result = await registry().output(input.task_id);
        if (result.job.status !== 'running' || Date.now() >= deadline) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(100, deadline - Date.now())));
      } while (true);
      return textResult(`${humanReadable(result.job)}\n\n${result.output || 'No output yet.'}`, result);
    },
  );

  r.register(
    Type.Object({ task_id: jobId }, { additionalProperties: false }),
    'TaskStop',
    'Stop a running background shell job and retain its output.',
    true,
    async input => {
      const job = await registry().stop(input.task_id);
      return textResult(humanReadable(job), { job });
    },
  );
}
