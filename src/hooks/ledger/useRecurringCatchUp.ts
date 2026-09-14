// 固定收支补账触发：启动 / 从后台回前台 / App 开着跨过 05:00 时各检查一次。
//
// 「补哪些天」由纯逻辑 `recurring.logic.ts` 算出（含 05:00 边界与本地时区），
// 这里只负责触发、去重与结果提示。

import { useEffect, useRef, useState } from 'react';
import { msUntilNextHourBoundary } from '../../core/domain/date';
import {
    dueOccurrences,
    RECURRING_HOUR,
} from '../../modules/settings/feature/recurring.logic';
import { pushInfoBar } from '../ui/globalInfoBarStore';
import { useRecurringRules, useRunRecurringEntries } from './useLedgerRecurring';

export function useRecurringCatchUp() {
    const rules = useRecurringRules();
    const run = useRunRecurringEntries();
    const runRef = useRef(run);
    runRef.current = run;
    const runningRef = useRef(false);
    const [tick, setTick] = useState(0);

    // App 保持前台跨过 05:00 时也要补一次（边界计算复用 core/domain/date 的唯一实现）。
    useEffect(() => {
        const timer = setTimeout(
            () => setTick((value) => value + 1),
            msUntilNextHourBoundary(new Date(), RECURRING_HOUR),
        );
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
