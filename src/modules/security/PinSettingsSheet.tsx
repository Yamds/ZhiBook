// 密码锁设置：设置 / 修改 / 关闭（多步 PIN 输入）。
//
// 忘记密码没有后门：只能卸载重装（本地数据会清空），界面上明确告知。

import { useEffect, useState, type ReactNode } from 'react';
import { securityService } from '../../core/services/security.service';
import { lockStore } from '../../hooks/security/lockStore';
import { useLockState } from '../../hooks/security/usePinLock';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';
import { PinPad } from './PinPad';

type Step = 'menu' | 'new' | 'confirm' | 'old' | 'changeNew' | 'changeConfirm' | 'disable';

const STEP_TITLE: Record<Step, string> = {
    menu: '密码锁',
    new: '设置密码',
    confirm: '再次输入确认',
    old: '输入原密码',
    changeNew: '设置新密码',
    changeConfirm: '再次输入新密码',
    disable: '关闭密码锁',
};

export interface PinSettingsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PinSettingsSheet({ open, onOpenChange }: PinSettingsSheetProps) {
    const { configured } = useLockState();
    const [step, setStep] = useState<Step>('menu');
    const [input, setInput] = useState('');
    const [staged, setStaged] = useState('');
    const [oldPin, setOldPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setStep('menu');
        setInput('');
        setStaged('');
        setOldPin('');
        setError(null);
    }, [open]);

    const go = (next: Step) => {
        setStep(next);
        setInput('');
        setError(null);
    };

    const fail = (message: string) => {
        setInput('');
        setError(message);
    };

    const submit = async () => {
        if (busy || input.length < 4) return;
        try {
            switch (step) {
                case 'new':
                    setStaged(input);
                    go('confirm');
                    return;
                case 'confirm':
                    if (input !== staged) {
                        setStaged('');
                        go('new');
                        fail('两次输入不一致，请重新设置');
                        return;
                    }
                    setBusy(true);
                    await securityService.setPin(input);
                    lockStore.setConfigured(true, false);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: '密码锁已开启' });
                    onOpenChange(false);
                    return;
                case 'old': {
                    setBusy(true);
                    const ok = await securityService.verifyPin(input);
                    if (!ok) {
                        fail('原密码不正确');
                        return;
                    }
                    setOldPin(input);
                    go('changeNew');
                    return;
                }
                case 'changeNew':
                    setStaged(input);
                    go('changeConfirm');
                    return;
                case 'changeConfirm':
                    if (input !== staged) {
                        setStaged('');
                        go('changeNew');
                        fail('两次输入不一致，请重新设置');
                        return;
                    }
                    setBusy(true);
                    await securityService.changePin(oldPin, input);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: '密码已修改' });
                    onOpenChange(false);
                    return;
                case 'disable':
                    setBusy(true);
                    await securityService.clearPin(input);
                    lockStore.setConfigured(false, false);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: '密码锁已关闭' });
                    onOpenChange(false);
                    return;
                default:
                    return;
            }
        } catch (caught) {
            fail(caught instanceof Error ? caught.message : '操作失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title={STEP_TITLE[step]}>
            {step === 'menu' ? (
                <div className="flex flex-col gap-3">
                    <div className="rounded-md bg-inset px-3 py-3 text-[12.5px] leading-relaxed text-text-secondary">
                        {configured
                            ? '密码锁已开启：每次打开 App、或离开后台超过 30 秒，都需要输入密码。'
                            : '开启后，打开 App 需要输入 4~8 位数字密码（键盘由 App 提供）。'}
                    </div>
                    {!configured ? (
                        <MenuButton onClick={() => go('new')}>设置密码</MenuButton>
                    ) : null}
                    {configured ? (
                        <MenuButton onClick={() => go('old')}>修改密码</MenuButton>
                    ) : null}
                    {configured ? (
                        <MenuButton tone="danger" onClick={() => go('disable')}>
                            关闭密码锁
                        </MenuButton>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-text-tertiary">
                        密码只保存在本机、无法找回；忘记密码只能卸载重装，届时全部账本数据会一并清空。
                    </p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4">
                    <PinPad
                        value={input}
                        onChange={setInput}
                        onSubmit={() => void submit()}
                        disabled={busy}
                        error={error}
                    />
                    <button
                        type="button"
                        onClick={() => go('menu')}
                        className="h-10 rounded-md px-4 text-[13px] text-text-secondary active:bg-inset"
                    >
                        返回
                    </button>
                </div>
            )}
        </BottomSheet>
    );
}

function MenuButton({
    children,
    onClick,
    tone = 'primary',
}: {
    children: ReactNode;
    onClick: () => void;
    tone?: 'primary' | 'danger';
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'h-11 rounded-md text-[14px] font-medium active:opacity-80',
                tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-brand text-white',
            )}
        >
            {children}
        </button>
    );
}

export default PinSettingsSheet;
