import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, LayoutGrid } from 'lucide-react';
import catGirl from '../../assets/cat-girl.svg';
import { APP_ROUTES, type AppRoute } from '../../app/navigation';
import styles from './OverviewPage.module.css';

const FEATURE_ROUTES = APP_ROUTES.filter((route) => route.id !== 'overview');

export function OverviewPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
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
                    <span className={styles.eyebrow}><Clock3 size={15} />当前时间</span>
                    <strong>{time}</strong>
                    <span className={styles.date}>{date}</span>
                </div>
                <img src={catGirl} alt="猫娘" draggable={false} />
            </div>

            <div className={styles.featureSection}>
                <div className={styles.sectionHeading}>
                    <div><h1>功能</h1><span>{FEATURE_ROUTES.length} 个模块</span></div>
                </div>
                <div className={styles.featureList}>
                    {FEATURE_ROUTES.map((route) => (
                        <button key={route.id} type="button" onClick={() => onNavigate(route.id)}>
                            <span className={styles.featureIcon}><route.icon size={18} /></span>
                            <span className={styles.featureCopy}><strong>{route.label}</strong><small>{route.id}</small></span>
                            <ArrowRight size={16} />
                        </button>
                    ))}
                    {!FEATURE_ROUTES.length && <div className={styles.empty}><LayoutGrid size={14} />暂无功能模块</div>}
                </div>
            </div>
        </section>
    );
}

export default OverviewPage;
