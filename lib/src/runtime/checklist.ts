import type { Task } from './tasks.ts';

export interface ChecklistComponent {
  render(width: number): string[];
  invalidate(): void;
}

export function checklistHeader(tasks: Task[], theme: any): string {
  const completed = tasks.filter(task => task.status === 'completed').length;
  const done = tasks.length > 0 && completed === tasks.length;
  return `${theme.fg('toolTitle', theme.bold('Tasks'))} ${theme.fg(done ? 'success' : 'muted', `${completed}/${tasks.length}`)}`;
}

export function checklistLines(tasks: Task[], theme: any, opts: { maxRows?: number } = {}): string[] {
  const shown = opts.maxRows !== undefined ? tasks.slice(0, opts.maxRows) : tasks;
  const rows = shown.map(task => {
    const suffix = `${task.owner ? theme.fg('dim', ` · ${task.owner}`) : ''}${
      task.blockedBy.length ? theme.fg('dim', ` · deps: ${task.blockedBy.map(dep => '#' + dep).join(', ')}`) : ''
    }`;
    if (task.status === 'completed') return `${theme.fg('success', '✔')} ${theme.fg('muted', task.subject)}${suffix}`;
    if (task.status === 'in_progress') return `${theme.fg('accent', '▶')} ${theme.fg('text', task.subject)}${suffix}`;
    return `${theme.fg('dim', '○')} ${theme.fg('muted', task.subject)}${suffix}`;
  });
  if (tasks.length > shown.length) rows.push(theme.fg('dim', `… +${tasks.length - shown.length} more (TaskList)`));
  return rows;
}

export function checklistComponent(
  theme: any,
  tasks: Task[],
  opts: { header?: string; footer?: string; maxRows?: number } = {},
): ChecklistComponent {
  const lines = [
    opts.header ?? checklistHeader(tasks, theme),
    ...checklistLines(tasks, theme, opts),
    ...(opts.footer ? [theme.fg('dim', opts.footer)] : []),
  ];
  return { render: () => lines, invalidate: () => {} };
}
