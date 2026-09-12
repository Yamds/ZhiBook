import { listen } from '../ipc/transport';
import type { DomainEvent } from '../domain/events/domain-event';

export const EVENT_NAMES = ['task_progress', 'desktop_log_appended'] as const;
export type EventName = typeof EVENT_NAMES[number];
export async function subscribeToDomainEvents(handler: (event: DomainEvent) => void): Promise<() => void> {
    const unsubs = await Promise.all(EVENT_NAMES.map((name) => listen<DomainEvent>(name, handler)));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
}
