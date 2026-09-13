// 固定收支补账触发：启动 / 从后台回前台 / App 开着跨过 05:00 时各检查一次。
//
// 「补哪些天」由纯逻辑 `recurring.logic.ts` 算出（含 05:00 边界与本地时区），
// 这里只负责触发、去重与结果提示。

import { useEffect, useRef, useState } from 'react';
import {
    dueOccurrences,
    RECURRING_HOUR,
} from '../../modules/settings/feature/recurring.logic';
import { pushInfoBar } from '../ui/globalInfoBarStore';
import { useRecurringRules, useRunRecurringEntries } from './useLedgerRecurring';

/** 距下一个本地 05:00 的毫秒数（+1s 余量，避免边界抖动）。 */
function msUntilNextFive(now: Date): number {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), RECURRING_HOUR, 0, 5, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
}

export function useRecurringCatchUp() {
    const rules = useRecurringRules();
    const run = useRunRecurringEntries();
    const runRef = useRef(run);
    runRef.current = run;
    const runningRef = useRef(false);
    const [tick, setTick] = useState(0);

    // App 保持前台跨过 05:00 时也要补一次。
    useEffect(() => {
        const timer = setTimeout(() => setTick((value) => value + 1), msUntilNextFive(new Date()));
        return () => clearTimeout(timer);
    }, [tick]);

    // 从后台回到前台。
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'visible') setTick((value) => value + 1);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    useEffect(() => {
        const list = rules.data;
        if (runningRef.current || !list || list.length === 0) return;
        const occurrences = dueOccurrences(list, new Date());
        if (occurrences.length === 0) return;
        runningRef.current = true;
        runRef.current.mutate(occurrences, {
            onSuccess: (result) => {
                if (result.createdCount > 0) {
                    pushInfoBar({
                        key: 'recurring-catch-up',
                        tone: 'success',
                        title: `已自动记入 ${result.createdCount} 笔固定收支`,
                    });
                }
            },
            onSettled: () => {
                runningRef.current = false;
            },
        });
    }, [rules.data, tick]);
}
