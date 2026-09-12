import { useEffect, useState } from 'react';
import { isTauri } from '../../core/ipc/transport';
import { subscribeToDomainEvents } from '../../core/services/event-stream.service';
import type { DomainEvent } from '../../core/domain/events/domain-event';

export function useDomainEvents(): DomainEvent | null {
    const [latest, setLatest] = useState<DomainEvent | null>(null);
    useEffect(() => {
        if (!isTauri) return;
        let cleanup: (() => void) | undefined;
        void subscribeToDomainEvents(setLatest).then((unsubscribe) => { cleanup = unsubscribe; });
        return () => cleanup?.();
    }, []);
    return latest;
}
