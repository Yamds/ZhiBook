export type DomainEventKind = 'task_progress' | 'desktop_log_appended';
export type DomainEvent = { v: number; kind: DomainEventKind; [key: string]: unknown };
