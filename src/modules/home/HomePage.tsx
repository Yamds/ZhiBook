// 日历首页：时间卡片 + 日历（日历本体在 P7 接入）。
//
// 日历是默认首页：启动进入这里；首页按返回键弹退出确认。

import { useEffect, useState } from 'react';
import mascot from '../../assets/mascot.png';
import { AppIcon } from '../../shared/ui/AppIcon';
import { UI_ICONS } from '../../core/design/icons';
import styles from './HomePage.module.css';

export function HomePage() {
    const [now, setNow] = useState(() => new Date());

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

            <div className={styles.calendarSlot}>
                <p className={styles.slotTitle}>日历</p>
                <p className={styles.slotHint}>每日收支、点击记账、长按看明细将在 P7 阶段接入</p>
            </div>
        </section>
    );
}

export default HomePage;
