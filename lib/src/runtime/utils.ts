import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export async function atomicWrite(file: string, contents: string | Buffer): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  let mode = 0o600;
  try {
    mode = (await stat(file)).mode & 0o777;
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(temp, contents, { mode, flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export const textResult = (text: string, details: Record<string, unknown> = {}) => ({
  content: [{ type: 'text' as const, text }],
  details,
});

export function humanReadable(value: unknown, indent = ''): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'object') return String(value);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item] as const)
    : Object.entries(value);
  if (!entries.length) return 'None';
  return entries
    .map(([key, item]) => {
      const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
      return item !== null && typeof item === 'object'
        ? `${indent}${label}:\n${humanReadable(item, indent + '  ')}`
        : `${indent}${label}: ${humanReadable(item)}`;
    })
    .join('\n');
}

export function taskSummary(
  tasks: { id: string; subject: string; status: string; blockedBy: string[]; owner?: string; description?: string }[],
): string {
  if (!tasks.length) return 'No tasks.';
  const completed = tasks.filter(task => task.status === 'completed').length;
  return [
    `Tasks — ${completed}/${tasks.length} completed`,
    ...tasks.map(task => {
      const marker = task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '→' : '○';
      return `${marker} #${task.id} ${task.subject} (${task.status.replace(/_/g, ' ')})${task.owner ? ` · ${task.owner}` : ''}${
        task.blockedBy.length ? ` · dependencies: ${task.blockedBy.map(id => '#' + id).join(', ')}` : ''
      }${task.description && task.description !== task.subject ? `\n  ${task.description}` : ''}`;
    }),
  ].join('\n');
}
