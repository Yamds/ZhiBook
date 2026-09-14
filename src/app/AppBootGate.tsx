// 首屏闸门：磁盘 UI 偏好就绪 → StartupSplash → AppNext。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import { StartupSplash } from './StartupSplash';
import { AppNext } from './AppNext';
import { hydrateAppUiPreferencesFromDisk } from '../hooks/preferences/useAppUiPreferencesBootstrap';
import { applySideEffects, preferencesStore, usePreferences } from '../hooks/preferences/preferencesStore';
import { useMotion } from '../hooks/preferences/useMotion';
import { refreshPinConfigured, useLockState } from '../hooks/security/usePinLock';
import { PinLockScreen } from '../modules/security/PinLockScreen';
import { supportsCircleReveal } from '../core/design/circleReveal';
import { normalizeStartupTab } from '../core/domain/ui/startupTab';
import { applyStartupScreen } from './navigationStore';
import { syncRootChromeBackground } from '../core/design/surfaceCanvas';
import { RouteErrorBoundary } from '../shared/ui/RouteErrorBoundary';
import { perfMark, perfMeasure } from '../core/domain/performance/perfMarks';

export const AppBootGate: React.FC = () => {
    const [prefsReady, setPrefsReady] = useState(false);
    const [pinReady, setPinReady] = useState(false);
    const [shellReady, setShellReady] = useState(false);
    const [splashDone, setSplashDone] = useState(false);
    // 主界面壳的入场动画（顶部栏/主区）押到 splash 开始揭示时才播，
    // 否则它们在 splash 底下就播完了，用户永远看不到。
    const [revealed, setRevealed] = useState(false);
    const lock = useLockState();
    const prevLockedRef = useRef(false);
    const motion = useMotion();
    const { splashEnabled } = usePreferences();
    // 圆形揭示 = 主题切换同一套 View Transition（快照 + mask-size）。
    // 能用它时壳的入场动画让位（新快照必须是终态，不能拍在动画首帧）。
    // 关闭启动动画时没有启动层可揭示，壳直接走自己的入场动画。
    const irisReveal =
        splashEnabled && supportsCircleReveal() && motion.enabled && motion.level !== 'elegant';

    useEffect(() => {
        applySideEffects();
        syncRootChromeBackground();
        void hydrateAppUiPreferencesFromDisk()
            .catch(() => undefined)
            // 偏好就绪后读一次密码锁状态（已设置则进入锁定态）。
            .then(() => refreshPinConfigured(true))
            .catch(() => undefined)
            .finally(() => {
                syncRootChromeBackground();
                perfMark('prefs_ready', { once: true });
                setPrefsReady(true);
                setPinReady(true);
            });
    }, []);

    // 解锁时跳过启动页：锁屏已经等过一次，再播一遍五幕动画会很拖。
    useEffect(() => {
        if (prevLockedRef.current && !lock.locked) {
            setRevealed(true);
            setSplashDone(true);
        }
        prevLockedRef.current = lock.locked;
    }, [lock.locked]);

    useEffect(() => {
        if (!prefsReady) return;
        const id = requestAnimationFrame(() => setShellReady(true));
        return () => cancelAnimationFrame(id);
    }, [prefsReady]);

    // 关闭启动动画：偏好就绪后立即揭示主界面，不等启动层。
    useEffect(() => {
        if (!prefsReady || splashEnabled) return;
        setRevealed(true);
        setSplashDone(true);
        document.getElementById('root')?.removeAttribute('aria-busy');
    }, [prefsReady, splashEnabled]);

    // 启动页签：偏好就绪后、主壳揭示前落位（壳此时还在 data-boot-reveal="off" 阶段，
    // 用户看不到中间的切换）。
    useEffect(() => {
        if (!prefsReady) return;
        applyStartupScreen(normalizeStartupTab(preferencesStore.get().startupTab));
    }, [prefsReady]);

    const handleReveal = useCallback(() => {
        setRevealed(true);
        perfMark('splash_reveal', { once: true });
    }, []);

    const handleSplashFinished = useCallback(() => {
        setRevealed(true);
        setSplashDone(true);
        document.getElementById('root')?.removeAttribute('aria-busy');
        perfMark('splash_exit', { once: true });
        perfMeasure('boot_prefs_to_splash_exit', 'prefs_ready', 'splash_exit');
    }, []);

    if (!prefsReady || !pinReady) {
        return (
            <div
                className="fixed inset-0 z-[200] bg-canvas"
                role="status"
                aria-busy="true"
                aria-label="正在加载设置"
            />
        );
    }

    // 锁定期间不挂载主界面：数据不在锁屏背后渲染。
    if (lock.locked) {
        return <PinLockScreen />;
    }

    return (
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-canvas">
            {/* 主界面预先挂载于底层，杜绝硬切闪白与布局跳动 */}
            <div
                className="relative z-0 h-full min-h-0 w-full"
                data-boot-reveal={revealed ? (irisReveal ? 'iris' : 'on') : 'off'}
            >
                <RouteErrorBoundary title="主界面渲染失败">
                    <AppNext bootSettled={splashDone} />
                </RouteErrorBoundary>
            </div>

            {/* 启动层：执行完毕后平滑透明度溶图淡出（关闭启动动画时不挂载） */}
            {splashEnabled && !splashDone ? (
                <StartupSplash
                    shellReady={shellReady}
                    irisReveal={irisReveal}
                    onReveal={handleReveal}
                    onFinished={handleSplashFinished}
                />
            ) : null}
        </div>
    );
};

export default AppBootGate;
