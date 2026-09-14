// Git 云端备份（P15）：仓库配置 / 立即备份 / 从云端恢复 / 密钥与恢复 / 断开。
//
// 云端只存密文；主密钥与恢复密钥的明文只在本机。多设备共用同一分支：
// 备份时若远端有另一台设备的新提交，会先下载解密合并，再推送合并后的全量。

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateLabel } from '../../../core/domain/date';
import { t as translate } from '../../../core/i18n';
import type { CloudBackupState, CloudKeyInfo, CloudRestorePreview } from '../../../core/ipc/types';
import { cloudService } from '../../../core/services/cloud.service';
import { securityService } from '../../../core/services/security.service';
import { useCloudBackupState, useInvalidateCloudBackupState } from '../../../hooks/cloud/useCloudBackup';
import { ledgerKeys } from '../../../hooks/ledger/queryKeys';
import { useLockState } from '../../../hooks/security/usePinLock';
import { pushInfoBar } from '../../../hooks/ui/globalInfoBarStore';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { ConfirmSheet } from '../../../shared/ui/ConfirmSheet';
import { Switch } from '../../../shared/ui/Switch';
import { TextField } from '../../../shared/ui/TextField';
import { cn } from '../../../shared/utils/cn';
import { PinPad } from '../../security/PinPad';
import {
    backupSummaryText,
    countsSummary,
    formatFingerprint,
    mergeSummaryText,
    normalizeKeyInput,
    restorePreviewText,
} from './cloud.logic';

export interface CloudBackupSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type View = 'overview' | 'form' | 'key' | 'restore';

function showError(error: unknown) {
    pushInfoBar({
        key: 'cloud-error',
        tone: 'danger',
        title: translate('settings.cloud.failedTitle'),
        content: error instanceof Error ? error.message : String(error),
    });
}

function showSuccess(key: string, title: string, content?: string) {
    pushInfoBar({ key, tone: 'success', title, content });
}

function ActionRow({
    label,
    description,
    value,
    danger = false,
    disabled = false,
    onClick,
}: {
    label: string;
    description?: ReactNode;
    value?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'flex w-full items-start justify-between gap-3 rounded-md bg-inset px-4 py-3.5 text-left active:bg-muted',
                disabled && 'opacity-50',
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn('text-[14px] font-medium', danger ? 'text-danger' : 'text-text')}>
                    {label}
                </span>
                {description ? (
                    <span className="text-[11.5px] leading-relaxed text-text-tertiary">{description}</span>
                ) : null}
            </span>
            {value ? <span className="shrink-0 pt-0.5 text-[12px] text-text-tertiary">{value}</span> : null}
        </button>
    );
}

function PrimaryButton({
    children,
    busy,
    disabled,
    onClick,
}: {
    children: ReactNode;
    busy?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={busy || disabled}
            onClick={onClick}
            className={cn(
                'flex h-11 items-center justify-center rounded-md bg-brand text-[14px] font-medium text-white active:opacity-90',
                (busy || disabled) && 'opacity-50',
            )}
        >
            {busy ? translate('settings.cloud.processing') : children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// 连接配置
// ---------------------------------------------------------------------------

function ConnectionForm({
    state,
    onSaved,
    onCancel,
}: {
    state: CloudBackupState;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    const [repoUrl, setRepoUrl] = useState(state.repoUrl);
    const [username, setUsername] = useState(state.username);
    const [token, setToken] = useState('');
    const [branch, setBranch] = useState(state.branch || 'backup');
    const [busy, setBusy] = useState(false);
    const invalidate = useInvalidateCloudBackupState();

    const handleSave = async () => {
        if (!repoUrl.trim()) {
            showError(new Error(t('settings.cloud.repoUrlRequired')));
            return;
        }
        if (!token.trim()) {
            showError(new Error(t('settings.cloud.tokenRequired')));
            return;
        }
        setBusy(true);
        try {
            const info = await cloudService.saveConfig({
                repoUrl: repoUrl.trim(),
                username: username.trim(),
                token: token.trim(),
                branch: branch.trim(),
            });
            const detail = info.branchExists
                ? info.backupReady
                    ? t('settings.cloud.connectOkWithBackup')
                    : t('settings.cloud.connectOkWrongBranch')
                : t('settings.cloud.connectOkNoBackup');
            showSuccess('cloud-config', t('settings.cloud.configSaved'), detail);
            // 先刷新查询再切回总览：否则总览仍显示旧仓库 / 旧分支，且查询已挂载不会自动重拉。
            await invalidate();
            onSaved();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <TextField
                label={t('settings.cloud.repoUrl')}
                value={repoUrl}
                onValueChange={setRepoUrl}
                placeholder={t('settings.cloud.repoUrlPlaceholder')}
                hint={t('settings.cloud.repoUrlHint')}
                autoCapitalize="none"
                autoCorrect="off"
            />
            {repoUrl.trim().toLowerCase().startsWith('http://') ? (
                <p className="-mt-1 text-[11.5px] leading-relaxed text-danger">
                    {t('settings.cloud.insecureHttpWarning')}
                </p>
            ) : null}
            <TextField
                label={t('settings.cloud.username')}
                value={username}
                onValueChange={setUsername}
                placeholder={t('settings.cloud.usernamePlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
            />
            <TextField
                label={t('settings.cloud.token')}
                type="password"
                value={token}
                onValueChange={setToken}
                placeholder={t('settings.cloud.tokenPlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
            />
            <TextField
                label={t('settings.cloud.branch')}
                value={branch}
                onValueChange={setBranch}
                placeholder="backup"
                hint={t('settings.cloud.branchHint')}
                autoCapitalize="none"
                autoCorrect="off"
            />
            <PrimaryButton busy={busy} onClick={() => void handleSave()}>
                {t('settings.cloud.saveAndTest')}
            </PrimaryButton>
            {state.configured ? (
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-10 rounded-md text-[13px] text-text-secondary active:bg-inset"
                >
                    {t('common.cancel')}
                </button>
            ) : (
                <p className="text-[11.5px] leading-relaxed text-text-tertiary">
                    {t('settings.cloud.privateRepoHint')}
                </p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 密钥与恢复
// ---------------------------------------------------------------------------

function KeyPanel({ keyInfo, onChange }: { keyInfo: CloudKeyInfo | null; onChange: () => Promise<void> | void }) {
    const { t } = useTranslation();
    const { configured: pinConfigured } = useLockState();
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [recovery, setRecovery] = useState<string | null>(null);
    const [pinGate, setPinGate] = useState(false);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [createdRecovery, setCreatedRecovery] = useState<string | null>(null);

    const handleCreate = async () => {
        setBusy(true);
        try {
            const created = await cloudService.createKey(passphrase.trim() ? passphrase.trim() : null);
            setCreatedRecovery(created.recoveryKey);
            setPassphrase('');
            await onChange();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const handleSetPassphrase = async () => {
        if (passphrase.trim().length < 6) {
            showError(new Error(t('settings.cloud.passphraseTooShort')));
            return;
        }
        setBusy(true);
        try {
            await cloudService.setPassphrase(passphrase.trim());
            setPassphrase('');
            showSuccess('cloud-passphrase', t('settings.cloud.passphraseSet'), t('settings.cloud.passphraseSetBody'));
            await onChange();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const handleClearPassphrase = async () => {
        setBusy(true);
        try {
            await cloudService.clearPassphrase();
            showSuccess('cloud-passphrase', t('settings.cloud.passphraseRemoved'), t('settings.cloud.removePassphraseDesc'));
            await onChange();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const revealRecovery = async () => {
        try {
            setRecovery(await cloudService.viewRecoveryKey());
        } catch (error) {
            showError(error);
        }
    };

    const handleViewRecovery = () => {
        if (pinConfigured) {
            setPin('');
            setPinError(null);
            setPinGate(true);
        } else {
            void revealRecovery();
        }
    };

    if (!keyInfo) {
        return (
            <div className="flex flex-col gap-3">
                <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    {t('settings.cloud.firstUseIntroBefore')}
                    <span className="text-text"> {t('settings.cloud.recoveryKey')} </span>
                    {t('settings.cloud.firstUseIntroMiddle')}
                    <span className="text-text"> {t('settings.cloud.passphrase')} </span>
                    {t('settings.cloud.firstUseIntroAfter')}
                </p>
                <TextField
                    label={t('settings.cloud.passphraseOptional')}
                    type="password"
                    value={passphrase}
                    onValueChange={setPassphrase}
                    placeholder={t('settings.cloud.passphrasePlaceholder')}
                    hint={t('settings.cloud.passphraseHint')}
                    autoCapitalize="none"
                    autoCorrect="off"
                />
                <PrimaryButton busy={busy} onClick={() => void handleCreate()}>
                    {t('settings.cloud.generateAndEnable')}
                </PrimaryButton>
                {createdRecovery ? (
                    <RecoveryDisplay
                        recovery={createdRecovery}
                        title={t('settings.cloud.copyRecoveryTitle')}
                        onDone={() => setCreatedRecovery(null)}
                    />
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-md bg-inset px-4 py-3.5">
                <div className="flex items-center justify-between text-[12.5px]">
                    <span className="text-text-tertiary">{t('settings.cloud.keyFingerprint')}</span>
                    <span className="font-mono text-text">{formatFingerprint(keyInfo.fingerprint)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className="text-text-tertiary">{t('settings.cloud.passphrase')}</span>
                    <span className="text-text">{keyInfo.hasPassphrase ? t('settings.cloud.set') : t('settings.cloud.notSet')}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className="text-text-tertiary">{t('settings.cloud.createdAt')}</span>
                    <span className="text-text">{formatDateLabel(keyInfo.createdAtMs)}</span>
                </div>
            </div>

            <ActionRow
                label={t('settings.cloud.viewRecoveryKey')}
                description={pinConfigured ? t('settings.cloud.needPin', { pin: t('security.pinShort') }) : t('settings.cloud.keepSafe')}
                value={recovery ? t('settings.cloud.shown') : undefined}
                onClick={handleViewRecovery}
            />
            {recovery ? <RecoveryDisplay recovery={recovery} title={t('settings.cloud.recoveryKey')} /> : null}

            <TextField
                label={keyInfo.hasPassphrase ? t('settings.cloud.updatePassphrase') : t('settings.cloud.setPassphrase')}
                type="password"
                value={passphrase}
                onValueChange={setPassphrase}
                placeholder={t('settings.cloud.passphraseMinPlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
            />
            <PrimaryButton busy={busy} onClick={() => void handleSetPassphrase()}>
                {keyInfo.hasPassphrase ? t('settings.cloud.updatePassphraseAction') : t('settings.cloud.setPassphraseAction')}
            </PrimaryButton>
            {keyInfo.hasPassphrase ? (
                <ActionRow
                    label={t('settings.cloud.removePassphrase')}
                    description={t('settings.cloud.removePassphraseDesc')}
                    danger
                    disabled={busy}
                    onClick={() => void handleClearPassphrase()}
                />
            ) : null}

            <BottomSheet
                open={pinGate}
                onOpenChange={setPinGate}
                title={t('settings.cloud.pinGateTitle')}
                description={t('settings.cloud.pinGateDesc')}
            >
                <PinPad
                    value={pin}
                    onChange={setPin}
                    onSubmit={() => {
                        void (async () => {
                            try {
                                const ok = await securityService.verifyPin(pin);
                                if (!ok) {
                                    setPinError(t('security.pinIncorrect'));
                                    setPin('');
                                    return;
                                }
                                setPinGate(false);
                                await revealRecovery();
                            } catch (error) {
                                showError(error);
                            }
                        })();
                    }}
                    error={pinError}
                    hint=""
                />
            </BottomSheet>
        </div>
    );
}

function RecoveryDisplay({
    recovery,
    title,
    onDone,
}: {
    recovery: string;
    title: string;
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(recovery);
            setCopied(true);
        } catch {
            showError(new Error(t('settings.cloud.copyFailed')));
        }
    };
    return (
        <div className="rounded-md border border-border-subtle bg-inset px-4 py-3.5">
            <p className="text-[12.5px] font-medium text-text">{title}</p>
            <p className="mt-2 select-all break-all font-mono text-[13px] leading-relaxed text-text">{recovery}</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-tertiary">
                {t('settings.cloud.recoveryFootnote')}
            </p>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="h-9 flex-1 rounded-md bg-elevated text-[13px] text-text active:bg-muted"
                >
                    {copied ? t('common.copied') : t('common.copy')}
                </button>
                {onDone ? (
                    <button
                        type="button"
                        onClick={onDone}
                        className="h-9 flex-1 rounded-md bg-elevated text-[13px] text-text active:bg-muted"
                    >
                        {t('settings.cloud.recoverySaved')}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 从云端恢复
// ---------------------------------------------------------------------------

function RestorePanel({
    onDone,
    onBack,
}: {
    onDone: () => void;
    onBack: () => void;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<CloudRestorePreview | null>(null);
    const [kind, setKind] = useState<'passphrase' | 'recovery'>('recovery');
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const loadPreview = async (input: { kind: string; value: string } | null) => {
        setLoading(true);
        try {
            const result = await cloudService.previewRestore(input);
            setPreview(result);
            if (result.needsKey) {
                setKind(result.hasPassphrase ? 'passphrase' : 'recovery');
            }
        } catch (error) {
            showError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPreview(null);
        // 只在进入面板时拉一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRestore = async () => {
        setRestoring(true);
        try {
            const keyInput =
                preview?.needsKey || !preview?.fromLocalKey
                    ? { kind, value: normalizeKeyInput(kind, value) }
                    : null;
            const result = await cloudService.runRestore(keyInput);
            await queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
            showSuccess(
                'cloud-restore',
                t('settings.cloud.restoredCount', { count: result.counts.transactions }),
                result.attachmentsFailed > 0
                    ? t('settings.cloud.restoreAttachmentsFailed', { count: result.attachmentsFailed })
                    : result.keyImported
                      ? t('settings.cloud.keyImported')
                      : undefined,
            );
            setConfirming(false);
            onDone();
        } catch (error) {
            showError(error);
        } finally {
            setRestoring(false);
        }
    };

    if (loading && !preview) {
        return <p className="text-[13px] text-text-tertiary">{t('settings.cloud.loadingState')}</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            {preview ? (
                <div className="rounded-md bg-inset px-4 py-3.5">
                    <p className="text-[13px] leading-relaxed text-text">{restorePreviewText(preview)}</p>
                    <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                        {t('settings.cloud.cloudMeta', {
                            time: formatDateLabel(preview.createdAtMs),
                            fingerprint: formatFingerprint(preview.fingerprint),
                        })}
                    </p>
                </div>
            ) : null}

            {preview?.needsKey ? (
                <>
                    <div className="flex gap-2">
                        {preview.hasPassphrase ? (
                            <button
                                type="button"
                                onClick={() => setKind('passphrase')}
                                className={cn(
                                    'h-9 flex-1 rounded-md text-[13px]',
                                    kind === 'passphrase' ? 'bg-brand text-white' : 'bg-inset text-text-secondary',
                                )}
                            >
                                {t('settings.cloud.usePassphrase')}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setKind('recovery')}
                            className={cn(
                                'h-9 flex-1 rounded-md text-[13px]',
                                kind === 'recovery' ? 'bg-brand text-white' : 'bg-inset text-text-secondary',
                            )}
                        >
                            {t('settings.cloud.useRecoveryKey')}
                        </button>
                    </div>
                    <TextField
                        label={kind === 'passphrase' ? t('settings.cloud.passphrase') : t('settings.cloud.recoveryKey')}
                        type={kind === 'passphrase' ? 'password' : 'text'}
                        value={value}
                        onValueChange={setValue}
                        placeholder={kind === 'passphrase' ? t('settings.cloud.passphrasePlaceholderShort') : 'XXXXX-XXXXX-…'}
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                    <PrimaryButton
                        busy={loading}
                        disabled={!value.trim()}
                        onClick={() =>
                            void loadPreview({ kind, value: normalizeKeyInput(kind, value) })
                        }
                    >
                        {t('settings.cloud.unlockAndPreview')}
                    </PrimaryButton>
                </>
            ) : preview?.counts ? (
                <PrimaryButton busy={restoring} onClick={() => setConfirming(true)}>
                    {t('settings.cloud.restoreToLocal')}
                </PrimaryButton>
            ) : null}

            <button
                type="button"
                onClick={onBack}
                className="h-10 rounded-md text-[13px] text-text-secondary active:bg-inset"
            >
                {t('common.back')}
            </button>

            <ConfirmSheet
                open={confirming}
                onOpenChange={setConfirming}
                title={t('settings.cloud.confirmRestoreTitle')}
                description={
                    <div className="flex flex-col gap-2">
                        {preview?.counts ? <p>{countsSummary(preview.counts)}</p> : null}
                        <p className="text-danger">
                            {t('settings.cloud.restoreWarning')}
                        </p>
                    </div>
                }
                confirmLabel={t('settings.cloud.confirmRestoreLabel')}
                busy={restoring}
                onConfirm={() => void handleRestore()}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// 主弹层
// ---------------------------------------------------------------------------

export function CloudBackupSheet({ open, onOpenChange }: CloudBackupSheetProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: state, isLoading, error } = useCloudBackupState();
    const invalidate = useInvalidateCloudBackupState();
    const [view, setView] = useState<View>('overview');
    const [busy, setBusy] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [backupResult, setBackupResult] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setView(state?.configured ? 'overview' : 'form');
            void invalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleBackup = async () => {
        setBusy(true);
        setBackupResult(null);
        try {
            const summary = await cloudService.runBackup();
            await queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
            await invalidate();
            const merged = mergeSummaryText(summary.merged);
            setBackupResult([backupSummaryText(summary), merged].filter(Boolean).join(t('common.listSeparator')));
            showSuccess('cloud-backup', t('settings.cloud.backupDone'), merged ?? undefined);
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const handleToggleAutoBackup = async (enabled: boolean) => {
        setBusy(true);
        try {
            await cloudService.setAutoBackup(enabled);
            await invalidate();
            showSuccess(
                'cloud-auto-backup-config',
                enabled ? t('settings.cloud.autoBackupOn') : t('settings.cloud.autoBackupOff'),
                enabled ? t('settings.cloud.autoBackupOnBody') : undefined,
            );
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const handleTestConnection = async () => {
        setBusy(true);
        try {
            const info = await cloudService.testConnection();
            showSuccess(
                'cloud-test',
                t('settings.cloud.connectionOk'),
                info.branchExists ? t('settings.cloud.branchExists') : t('settings.cloud.repoReachableNoBackup'),
            );
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const handleDisconnect = async (removeKey: boolean) => {
        setBusy(true);
        try {
            await cloudService.disconnect(removeKey);
            await invalidate();
            setDisconnecting(false);
            setView('form');
            showSuccess('cloud-disconnect', t('settings.cloud.disconnected'), t('settings.cloud.disconnectedBody'));
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const key = state?.key ?? null;
    const lastBackup = state?.lastBackupAtMs ? formatDateLabel(state.lastBackupAtMs) : t('settings.cloud.neverBackedUp');

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('settings.feature.cloudBackup')}
            description={t('settings.feature.cloudBackupDesc')}
        >
            {isLoading || !state ? (
                error ? (
                    <p className="text-[13px] leading-relaxed text-danger">
                        {t('settings.cloud.stateReadFailed', { detail: error instanceof Error ? error.message : String(error) })}
                    </p>
                ) : (
                    <p className="text-[13px] text-text-tertiary">{t('common.loading')}</p>
                )
            ) : (
                <div className="flex flex-col gap-3">
                    {view === 'form' ? (
                        <ConnectionForm
                            state={state}
                            onSaved={() => setView('overview')}
                            onCancel={() => setView('overview')}
                        />
                    ) : null}

                    {view === 'overview' ? (
                        <>
                            <div className="rounded-md bg-inset px-4 py-3.5">
                                <div className="flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">{t('settings.cloud.repo')}</span>
                                    <span className="max-w-[70%] truncate text-text">{state.repoUrl}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">{t('settings.cloud.branchLabel')}</span>
                                    <span className="text-text">{state.branch}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">{t('settings.cloud.lastBackup')}</span>
                                    <span className="text-text">{lastBackup}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">{t('settings.cloud.keyLabel')}</span>
                                    <span className="text-text">
                                        {key ? formatFingerprint(key.fingerprint) : t('settings.cloud.notGenerated')}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">{t('settings.cloud.autoBackup')}</span>
                                    <span className="text-text">
                                        {state.autoBackupEnabled ? t('settings.cloud.on') : t('settings.cloud.off')}
                                    </span>
                                </div>
                            </div>

                            {backupResult ? (
                                <p className="text-[12px] leading-relaxed text-text-secondary">{backupResult}</p>
                            ) : null}

                            {key ? (
                                <div className="flex w-full items-start justify-between gap-3 rounded-md bg-inset px-4 py-3.5">
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="text-[14px] font-medium text-text">{t('settings.cloud.autoBackup')}</span>
                                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                                            {t('settings.cloud.autoBackupDesc')}
                                        </span>
                                    </span>
                                    <Switch
                                        checked={state.autoBackupEnabled}
                                        disabled={busy}
                                        onCheckedChange={(next) => void handleToggleAutoBackup(next)}
                                        aria-label={t('settings.cloud.autoBackup')}
                                    />
                                </div>
                            ) : null}

                            <ActionRow
                                label={busy ? t('settings.cloud.backingUp') : t('settings.cloud.backupNow')}
                                description={
                                    key
                                        ? t('settings.cloud.backupNowDesc')
                                        : t('settings.cloud.backupNowFirstDesc')
                                }
                                disabled={busy}
                                onClick={() => {
                                    if (!key) {
                                        setView('key');
                                        return;
                                    }
                                    void handleBackup();
                                }}
                            />
                            <ActionRow
                                label={t('settings.cloud.restoreFromCloud')}
                                description={t('settings.cloud.restoreFromCloudDesc')}
                                disabled={busy}
                                onClick={() => setView('restore')}
                            />
                            <ActionRow
                                label={t('settings.cloud.keyAndRecovery')}
                                description={t('settings.cloud.keyAndRecoveryDesc')}
                                value={key ? t('settings.cloud.enabled') : t('settings.cloud.notGenerated')}
                                disabled={busy}
                                onClick={() => setView('key')}
                            />
                            <ActionRow
                                label={t('settings.cloud.editConnection')}
                                description={t('settings.cloud.editConnectionDesc')}
                                disabled={busy}
                                onClick={() => setView('form')}
                            />
                            <ActionRow
                                label={t('settings.cloud.testConnection')}
                                description={t('settings.cloud.testConnectionDesc')}
                                disabled={busy}
                                onClick={() => void handleTestConnection()}
                            />
                            <ActionRow
                                label={t('settings.cloud.disconnect')}
                                description={t('settings.cloud.disconnectDesc')}
                                danger
                                disabled={busy}
                                onClick={() => setDisconnecting(true)}
                            />
                        </>
                    ) : null}

                    {view === 'key' ? (
                        <>
                            <KeyPanel
                                keyInfo={key}
                                onChange={async () => {
                                    await invalidate();
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setView('overview')}
                                className="h-10 rounded-md text-[13px] text-text-secondary active:bg-inset"
                            >
                                {t('common.back')}
                            </button>
                        </>
                    ) : null}

                    {view === 'restore' ? (
                        <RestorePanel onDone={() => onOpenChange(false)} onBack={() => setView('overview')} />
                    ) : null}
                </div>
            )}

            <ConfirmSheet
                open={disconnecting}
                onOpenChange={setDisconnecting}
                title={t('settings.cloud.disconnectConfirmTitle')}
                description={
                    <div className="flex flex-col gap-2">
                        <p>{t('settings.cloud.disconnectConfirmBody')}</p>
                        <p className="text-text-tertiary">
                            {t('settings.cloud.disconnectConfirmBody2')}
                        </p>
                    </div>
                }
                confirmLabel={t('settings.cloud.disconnectConfirmLabel')}
                tone="danger"
                busy={busy}
                onConfirm={() => void handleDisconnect(false)}
            />
        </BottomSheet>
    );
}

export default CloudBackupSheet;
