import { spawn } from 'node:child_process';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ProcessResult {
  output: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  cancelled: boolean;
  timedOut: boolean;
  truncated: boolean;
  outputPath?: string;
}

export async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    signal?: AbortSignal;
    timeout?: number;
    input?: string;
    outputPath?: string;
    maxBytes?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProcessResult> {
  options.signal?.throwIfAborted();
  const maxBytes = options.maxBytes ?? 64_000;
  let sink: FileHandle | undefined;
  if (options.outputPath) {
    await mkdir(dirname(options.outputPath), { recursive: true });
    sink = await open(options.outputPath, 'wx', 0o600);
  }
  try {
    return await new Promise<ProcessResult>((resolve, reject) => {
      options.signal?.throwIfAborted();
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let output = Buffer.alloc(0);
      let size = 0;
      let diskSize = 0;
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      let diskWrites = Promise.resolve();
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        try { process.kill(-child.pid!, 'SIGTERM'); } catch {}
        killTimer ??= setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} }, 250);
      };
      const onAbort = () => { cancelled = true; stop(); };
      const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeout ?? 120_000);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const receive = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        if (stream === 'stdout' && stdout.length < maxBytes) {
          stdout = Buffer.concat([stdout, chunk.subarray(0, maxBytes - stdout.length)]);
        }
        if (stream === 'stderr' && stderr.length < maxBytes) {
          stderr = Buffer.concat([stderr, chunk.subarray(0, maxBytes - stderr.length)]);
        }
        size += chunk.length;
        if (output.length < maxBytes) {
          output = Buffer.concat([output, chunk.subarray(0, maxBytes - output.length)]);
        }
        if (sink && diskSize < 16_000_000) {
          const bytes = chunk.subarray(0, 16_000_000 - diskSize);
          diskSize += bytes.length;
          diskWrites = diskWrites.then(async () => { await sink!.write(bytes); });
          diskWrites.catch(() => stop());
        }
        if (size > 16_000_000) stop();
      };
      child.stdout.on('data', chunk => receive(chunk, 'stdout'));
      child.stderr.on('data', chunk => receive(chunk, 'stderr'));
      child.stdin.on('error', () => {});
      child.stdin.end(options.input);
      child.on('error', error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      child.on('close', async code => {
        if (settled) return;
        settled = true;
        cleanup();
        if (timedOut || cancelled) stop();
        try {
          await diskWrites;
          resolve({
            output: output.toString('utf8'),
            stdout: stdout.toString('utf8'),
            stderr: stderr.toString('utf8'),
            exitCode: code,
            timedOut,
            cancelled,
            truncated: size > maxBytes,
            outputPath: options.outputPath,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  } finally {
    await sink?.close();
  }
}
