// 日历首页（BRD FR-HOME，P7）。
//
// 结构：时间卡片（立绘 + 实时时钟 + 日期，P1 就位）+ 日历面板（本阶段接入）。
// 交互：点某天 → 添加页（带日期）；长按某天 → 明细页（定位该天）；
//       已在日历页再点「日历」页签 → 设置页（壳层处理，见 FR-HOME-7）。

import { useEffect, useMemo, useState } from 'react';
import mascot from '../../assets/mascot.png';
import { toDayKey, todayDate, todayKey, toMonthKey } from '../../core/domain/date';
import { useDaySummaries } from '../../hooks/ledger';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { navigateTo } from '../../app/navigationStore';
import { AppIcon } from '../../shared/ui/AppIcon';
import { UI_ICONS } from '../../core/design/icons';
import { CalendarPanel } from './CalendarPanel';
import { clampDayKeyToMonth, defaultSelectedDayKey } from './homePage.logic';
import styles from './HomePage.module.css';

export function HomePage() {
    const [now, setNow] = useState(() => new Date());
    const today = useMemo(() => todayDate(), []);
    const todayKeyValue = useMemo(() => todayKey(), []);

    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;

    const [year, setYear] = useState(today.year);
    const [month, setMonth] = useState(today.month);
    const [selectedDayKey, setSelectedDayKey] = useState(() =>
        defaultSelectedDayKey(today.year, today.month, todayKeyValue),
    );

    const days = useDaySummaries(bookId, toMonthKey(year, month));

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

    // 换年 / 换月把「高亮日」夹到该月内（保留日号，超界取月末）
    const handleYearChange = (nextYear: number) => {
        setYear(nextYear);
        setSelectedDayKey((current) => clampDayKeyToMonth(nextYear, month, current));
    };
    const handleMonthChange = (nextMonth: number) => {
        setMonth(nextMonth);
        setSelectedDayKey((current) => clampDayKeyToMonth(year, nextMonth, current));
    };
    const handleDayChange = (day: number) => setSelectedDayKey(toDayKey({ year, month, day }));

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
                year={year}
                month={month}
                todayKey={todayKeyValue}
                selectedDayKey={selectedDayKey}
                days={days.data}
                isLoading={days.isLoading}
                onYearChange={handleYearChange}
                onMonthChange={handleMonthChange}
                onDayChange={handleDayChange}
                onPickDay={(dayKey) => navigateTo('add', { date: dayKey })}
                onOpenDayDetails={(dayKey) => navigateTo('details', { date: dayKey })}
            />
        </section>
    );
}

export default HomePage;
