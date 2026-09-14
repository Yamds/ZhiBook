// 密码锁设置：设置 / 修改 / 关闭（多步 PIN 输入）。
//
// 忘记密码没有后门：只能卸载重装（本地数据会清空），界面上明确告知。

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { securityService } from '../../core/services/security.service';
import { lockStore } from '../../hooks/security/lockStore';
import { useLockState } from '../../hooks/security/usePinLock';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';
import { PinPad } from './PinPad';

type Step = 'menu' | 'new' | 'confirm' | 'old' | 'changeNew' | 'changeConfirm' | 'disable';

const STEP_TITLE_KEY: Record<Step, string> = {
    menu: 'security.pinLock',
    new: 'security.setPin',
    confirm: 'security.enterAgainToConfirm',
    old: 'security.enterCurrentPin',
    changeNew: 'security.setNewPin',
    changeConfirm: 'security.enterNewPinAgain',
    disable: 'security.disablePinLock',
};

export interface PinSettingsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PinSettingsSheet({ open, onOpenChange }: PinSettingsSheetProps) {
    const { t } = useTranslation();
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
                        fail(t('security.pinMismatch'));
                        return;
                    }
                    setBusy(true);
                    await securityService.setPin(input);
                    lockStore.setConfigured(true, false);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: t('security.pinEnabled') });
                    onOpenChange(false);
                    return;
                case 'old': {
                    setBusy(true);
                    const ok = await securityService.verifyPin(input);
                    if (!ok) {
                        fail(t('security.currentPinIncorrect'));
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
                        fail(t('security.pinMismatch'));
                        return;
                    }
                    setBusy(true);
                    await securityService.changePin(oldPin, input);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: t('security.pinChanged') });
                    onOpenChange(false);
                    return;
                case 'disable':
                    setBusy(true);
                    await securityService.clearPin(input);
                    lockStore.setConfigured(false, false);
                    pushInfoBar({ key: 'pin-save', tone: 'success', title: t('security.pinDisabled') });
                    onOpenChange(false);
                    return;
                default:
                    return;
            }
        } catch (caught) {
            fail(caught instanceof Error ? caught.message : t('settings.transfer.failedTitle'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title={t(STEP_TITLE_KEY[step])}>
            {step === 'menu' ? (
                <div className="flex flex-col gap-3">
                    <div className="rounded-md bg-inset px-3 py-3 text-[12.5px] leading-relaxed text-text-secondary">
                        {configured
                            ? t('security.enabledHint')
                            : t('security.disabledHint')}
                    </div>
                    {!configured ? (
                        <MenuButton onClick={() => go('new')}>{t('security.setPin')}</MenuButton>
                    ) : null}
                    {configured ? (
                        <MenuButton onClick={() => go('old')}>{t('security.changePin')}</MenuButton>
                    ) : null}
                    {configured ? (
                        <MenuButton tone="danger" onClick={() => go('disable')}>
                            {t('security.disablePinLock')}
                        </MenuButton>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-text-tertiary">
                        {t('security.noRecoveryWarning')}
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
                        {t('common.back')}
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
