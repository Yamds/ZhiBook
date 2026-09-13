// 日历首页（BRD FR-HOME，P7）。
//
// 结构：时间卡片（立绘 + 实时时钟 + 日期，P1 就位）+ 日历面板（P7 接入，可上下滑翻月）。
// 交互：点某天 → 添加页（带日期）；长按某天 → 明细页（定位该天）；
//       已在日历页再点「日历」页签 → 设置页（壳层处理，见 FR-HOME-7）。

import { useCallback, useEffect, useMemo, useState } from 'react';
import mascot from '../../assets/mascot.png';
import { shiftMonth, toMonthKey, todayDate, todayKey } from '../../core/domain/date';
import { useDaySummaries } from '../../hooks/ledger';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { navigateTo } from '../../app/navigationStore';
import { AppIcon } from '../../shared/ui/AppIcon';
import { UI_ICONS } from '../../core/design/icons';
import { CalendarPanel, type CalendarPeriod } from './CalendarPanel';
import styles from './HomePage.module.css';

export function HomePage() {
    const [now, setNow] = useState(() => new Date());
    const today = useMemo(() => todayDate(), []);
    const todayKeyValue = useMemo(() => todayKey(), []);

    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;

    const [period, setPeriod] = useState<CalendarPeriod>(() => ({
        year: today.year,
        month: today.month,
    }));

    // 竖向翻月要即时看到相邻月的收支，所以三个月一起拉；
    // 查询按「账本 + 月份」缓存，来回翻月命中缓存不重复请求。
    const previousMonth = shiftMonth(period.year, period.month, -1);
    const nextMonth = shiftMonth(period.year, period.month, 1);
    const previousDays = useDaySummaries(bookId, toMonthKey(previousMonth.year, previousMonth.month));
    const currentDays = useDaySummaries(bookId, toMonthKey(period.year, period.month));
    const nextDays = useDaySummaries(bookId, toMonthKey(nextMonth.year, nextMonth.month));
    const days = useMemo(
        () => [previousDays.data, currentDays.data, nextDays.data] as const,
        [currentDays.data, nextDays.data, previousDays.data],
    );

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const time = new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(now);
    const date = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(now);

    const handlePeriodChange = useCallback((next: CalendarPeriod) => setPeriod(next), []);

    return (
        <section className={styles.page}>
            <div className={styles.clockPanel}>
                <div className={styles.clockCopy}>
                    <span className={styles.eyebrow}><AppIcon name={UI_ICONS.calendarToday} size={15} />当前时间</span>
                    <strong>{time}</strong>
                    <span className={styles.date}>{date}</span>
                </div>
                <img src={mascot} alt="制账形象" draggable={false} />
            </div>

            <CalendarPanel
                year={period.year}
                month={period.month}
                todayKey={todayKeyValue}
                days={days}
                isLoading={currentDays.isLoading}
                onPeriodChange={handlePeriodChange}
                onPickDay={(dayKey) => navigateTo('add', { date: dayKey })}
                onOpenDayDetails={(dayKey) => navigateTo('details', { date: dayKey })}
            />
        </section>
    );
}

export default HomePage;
