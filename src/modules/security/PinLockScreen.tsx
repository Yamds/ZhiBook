// 锁屏：App 启动 / 回前台重新锁定时覆盖整个界面。
//
// 锁定期间不挂载 AppNext（避免数据在锁屏后面渲染），返回键 = 退出应用。

import { useEffect, useRef, useState } from 'react';
import { UI_ICONS } from '../../core/design/icons';
import { registerBackButtonHandler } from '../../core/platform/androidBridge';
import { securityService } from '../../core/services/security.service';
import { lockStore } from '../../hooks/security/lockStore';
import { AppIcon } from '../../shared/ui/AppIcon';
import { PIN_MIN_LEN, PinPad } from './PinPad';

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

export function PinLockScreen() {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [, forceTick] = useState(0);
    const attemptsRef = useRef(0);

    useEffect(() => registerBackButtonHandler(() => 'exit'), []);

    // 冷却倒计时（每秒重渲染一次）。
    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        const timer = setInterval(() => forceTick((tick) => tick + 1), 1000);
        return () => clearInterval(timer);
    }, [cooldownUntil]);

    const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const cooling = remaining > 0;

    const submit = async () => {
        if (busy || cooling || value.length < PIN_MIN_LEN) return;
        setBusy(true);
        try {
            const ok = await securityService.verifyPin(value);
            if (ok) {
                setError(null);
                lockStore.unlock();
                return;
            }
            attemptsRef.current += 1;
            setValue('');
            if (attemptsRef.current >= MAX_ATTEMPTS) {
                attemptsRef.current = 0;
                setCooldownUntil(Date.now() + COOLDOWN_MS);
                setError('错误次数过多，请等待后再试');
            } else {
                setError('密码不正确');
            }
        } catch (caught) {
            setValue('');
            setError(caught instanceof Error ? caught.message : '验证失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-canvas px-8">
            <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
                <AppIcon name={UI_ICONS.lock} size={30} />
            </div>
            <h1 className="mb-1 text-[17px] font-semibold text-text">输入密码</h1>
            <p className="mb-8 text-[12.5px] text-text-tertiary">解锁后进入制账</p>
            <PinPad
                value={value}
                onChange={setValue}
                onSubmit={() => void submit()}
                disabled={busy || cooling}
                error={error}
                hint={cooling ? `请等待 ${remaining} 秒` : undefined}
            />
        </div>
    );
}

export default PinLockScreen;
