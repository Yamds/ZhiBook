// Git 云端备份（P15）：仓库配置 / 立即备份 / 从云端恢复 / 密钥与恢复 / 断开。
//
// 云端只存密文；主密钥与恢复密钥的明文只在本机。多设备共用同一分支：
// 备份时若远端有另一台设备的新提交，会先下载解密合并，再推送合并后的全量。

import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateLabel } from '../../../core/domain/date';
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
        title: '云端备份失败',
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
            {busy ? '处理中…' : children}
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
    const [repoUrl, setRepoUrl] = useState(state.repoUrl);
    const [username, setUsername] = useState(state.username);
    const [token, setToken] = useState('');
    const [branch, setBranch] = useState(state.branch || 'backup');
    const [busy, setBusy] = useState(false);

    const handleSave = async () => {
        if (!repoUrl.trim()) {
            showError(new Error('请填写仓库地址'));
            return;
        }
        if (!token.trim()) {
            showError(new Error('请填写访问 Token（PAT）'));
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
                    ? '连接成功，检测到已有备份'
                    : '连接成功，但 backup 分支不是制账的备份分支'
                : '连接成功，云端还没有备份';
            showSuccess('cloud-config', '仓库配置已保存', detail);
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
                label="仓库地址"
                value={repoUrl}
                onValueChange={setRepoUrl}
                placeholder="https://git.example.com/owner/repo.git"
                hint="支持 Gitea / GitHub / GitLab / 自建；自建允许 http"
                autoCapitalize="none"
                autoCorrect="off"
            />
            <TextField
                label="账号"
                value={username}
                onValueChange={setUsername}
                placeholder="GitHub 可填 x-access-token"
                autoCapitalize="none"
                autoCorrect="off"
            />
            <TextField
                label="访问 Token（PAT）"
                type="password"
                value={token}
                onValueChange={setToken}
                placeholder="只保存在本机，不会写进备份"
                autoCapitalize="none"
                autoCorrect="off"
            />
            <TextField
                label="备份分支"
                value={branch}
                onValueChange={setBranch}
                placeholder="backup"
                hint="建议保持默认；同一分支 = 多设备合并同步"
                autoCapitalize="none"
                autoCorrect="off"
            />
            <PrimaryButton busy={busy} onClick={() => void handleSave()}>
                保存并测试连接
            </PrimaryButton>
            {state.configured ? (
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-10 rounded-md text-[13px] text-text-secondary active:bg-inset"
                >
                    取消
                </button>
            ) : (
                <p className="text-[11.5px] leading-relaxed text-text-tertiary">
                    建议使用专用私有仓库；制账只上传加密后的数据，仓库内容被看到也无法解密。
                </p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 密钥与恢复
// ---------------------------------------------------------------------------

function KeyPanel({ keyInfo, onChange }: { keyInfo: CloudKeyInfo | null; onChange: () => Promise<void> | void }) {
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
            showError(new Error('口令至少 6 位'));
            return;
        }
        setBusy(true);
        try {
            await cloudService.setPassphrase(passphrase.trim());
            setPassphrase('');
            showSuccess('cloud-passphrase', '口令已设置', '换机时可用口令解锁云端密钥');
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
            showSuccess('cloud-passphrase', '口令已移除', '恢复密钥仍可解锁云端备份');
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
                    首次使用需要在本机生成一把主密钥。云端只保存密文；换机时可用
                    <span className="text-text"> 恢复密钥 </span>或<span className="text-text"> 口令 </span>
                    从云端拿回主密钥。
                </p>
                <TextField
                    label="可选：保护口令"
                    type="password"
                    value={passphrase}
                    onValueChange={setPassphrase}
                    placeholder="至少 6 位；留空 = 只用恢复密钥"
                    hint="忘记口令仍可用恢复密钥解锁；两者都丢失则无法恢复云端数据"
                    autoCapitalize="none"
                    autoCorrect="off"
                />
                <PrimaryButton busy={busy} onClick={() => void handleCreate()}>
                    生成密钥并启用云端备份
                </PrimaryButton>
                {createdRecovery ? (
                    <RecoveryDisplay
                        recovery={createdRecovery}
                        title="请抄下恢复密钥（只显示这一次）"
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
                    <span className="text-text-tertiary">密钥指纹</span>
                    <span className="font-mono text-text">{formatFingerprint(keyInfo.fingerprint)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className="text-text-tertiary">保护口令</span>
                    <span className="text-text">{keyInfo.hasPassphrase ? '已设置' : '未设置'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className="text-text-tertiary">生成时间</span>
                    <span className="text-text">{formatDateLabel(keyInfo.createdAtMs)}</span>
                </div>
            </div>

            <ActionRow
                label="查看恢复密钥"
                description={pinConfigured ? '需要先输入密码锁 PIN' : '请妥善保存，换机恢复时必填'}
                value={recovery ? '已显示' : undefined}
                onClick={handleViewRecovery}
            />
            {recovery ? <RecoveryDisplay recovery={recovery} title="恢复密钥" /> : null}

            <TextField
                label={keyInfo.hasPassphrase ? '更新保护口令' : '设置保护口令'}
                type="password"
                value={passphrase}
                onValueChange={setPassphrase}
                placeholder="至少 6 位"
                autoCapitalize="none"
                autoCorrect="off"
            />
            <PrimaryButton busy={busy} onClick={() => void handleSetPassphrase()}>
                {keyInfo.hasPassphrase ? '更新口令' : '设置口令'}
            </PrimaryButton>
            {keyInfo.hasPassphrase ? (
                <ActionRow
                    label="移除保护口令"
                    description="恢复密钥仍可解锁云端备份"
                    danger
                    disabled={busy}
                    onClick={() => void handleClearPassphrase()}
                />
            ) : null}

            <BottomSheet
                open={pinGate}
                onOpenChange={setPinGate}
                title="输入密码锁 PIN"
                description="验证后显示恢复密钥"
            >
                <PinPad
                    value={pin}
                    onChange={setPin}
                    onSubmit={() => {
                        void (async () => {
                            try {
                                const ok = await securityService.verifyPin(pin);
                                if (!ok) {
                                    setPinError('PIN 不正确');
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
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(recovery);
            setCopied(true);
        } catch {
            showError(new Error('复制失败，请手动长按选择文本'));
        }
    };
    return (
        <div className="rounded-md border border-border-subtle bg-inset px-4 py-3.5">
            <p className="text-[12.5px] font-medium text-text">{title}</p>
            <p className="mt-2 select-all break-all font-mono text-[13px] leading-relaxed text-text">{recovery}</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-tertiary">
                换机或重装后，用它（或口令）才能解出云端主密钥；丢失后无法恢复云端数据。
            </p>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="h-9 flex-1 rounded-md bg-elevated text-[13px] text-text active:bg-muted"
                >
                    {copied ? '已复制' : '复制'}
                </button>
                {onDone ? (
                    <button
                        type="button"
                        onClick={onDone}
                        className="h-9 flex-1 rounded-md bg-elevated text-[13px] text-text active:bg-muted"
                    >
                        我已抄好
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
                `已从云端恢复 ${result.counts.transactions} 笔账单`,
                result.attachmentsFailed > 0
                    ? `${result.attachmentsFailed} 张附件下载失败，其余数据已恢复`
                    : result.keyImported
                      ? '云端密钥已导入本机'
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
        return <p className="text-[13px] text-text-tertiary">正在读取云端备份…</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            {preview ? (
                <div className="rounded-md bg-inset px-4 py-3.5">
                    <p className="text-[13px] leading-relaxed text-text">{restorePreviewText(preview)}</p>
                    <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                        云端备份时间：{formatDateLabel(preview.createdAtMs)} · 指纹 {formatFingerprint(preview.fingerprint)}
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
                                用口令
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
                            用恢复密钥
                        </button>
                    </div>
                    <TextField
                        label={kind === 'passphrase' ? '保护口令' : '恢复密钥'}
                        type={kind === 'passphrase' ? 'password' : 'text'}
                        value={value}
                        onValueChange={setValue}
                        placeholder={kind === 'passphrase' ? '生成密钥时设置的口令' : 'XXXXX-XXXXX-…'}
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
                        解锁并预览
                    </PrimaryButton>
                </>
            ) : preview?.counts ? (
                <PrimaryButton busy={restoring} onClick={() => setConfirming(true)}>
                    覆盖恢复到本机
                </PrimaryButton>
            ) : null}

            <button
                type="button"
                onClick={onBack}
                className="h-10 rounded-md text-[13px] text-text-secondary active:bg-inset"
            >
                返回
            </button>

            <ConfirmSheet
                open={confirming}
                onOpenChange={setConfirming}
                title="确认覆盖恢复？"
                description={
                    <div className="flex flex-col gap-2">
                        {preview?.counts ? <p>{countsSummary(preview.counts)}</p> : null}
                        <p className="text-danger">
                            恢复会清空并替换当前全部账本数据；恢复前的数据会自动快照到本机。
                        </p>
                    </div>
                }
                confirmLabel="覆盖恢复"
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
            setBackupResult([backupSummaryText(summary), merged].filter(Boolean).join('；'));
            showSuccess('cloud-backup', '云端备份完成', merged ?? undefined);
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
                enabled ? '已开启自动备份' : '已关闭自动备份',
                enabled ? '每天 05:00 后第一次打开 App 时自动备份一次' : undefined,
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
                '连接正常',
                info.branchExists ? '检测到已有备份分支' : '仓库可访问，云端还没有备份',
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
            showSuccess('cloud-disconnect', '已断开云端备份', '本机账本数据不受影响');
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const key = state?.key ?? null;
    const lastBackup = state?.lastBackupAtMs ? formatDateLabel(state.lastBackupAtMs) : '尚未备份';

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title="云端备份"
            description="加密后推送到你自己的 Git 仓库；多设备共用同一分支自动合并"
        >
            {isLoading || !state ? (
                error ? (
                    <p className="text-[13px] leading-relaxed text-danger">
                        读取云端备份状态失败：{error instanceof Error ? error.message : String(error)}
                    </p>
                ) : (
                    <p className="text-[13px] text-text-tertiary">正在加载…</p>
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
                                    <span className="text-text-tertiary">仓库</span>
                                    <span className="max-w-[70%] truncate text-text">{state.repoUrl}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">分支</span>
                                    <span className="text-text">{state.branch}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">上次备份</span>
                                    <span className="text-text">{lastBackup}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">密钥</span>
                                    <span className="text-text">
                                        {key ? formatFingerprint(key.fingerprint) : '未生成'}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[12.5px]">
                                    <span className="text-text-tertiary">自动备份</span>
                                    <span className="text-text">
                                        {state.autoBackupEnabled ? '已开启' : '未开启'}
                                    </span>
                                </div>
                            </div>

                            {backupResult ? (
                                <p className="text-[12px] leading-relaxed text-text-secondary">{backupResult}</p>
                            ) : null}

                            {key ? (
                                <div className="flex w-full items-start justify-between gap-3 rounded-md bg-inset px-4 py-3.5">
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="text-[14px] font-medium text-text">自动备份</span>
                                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                                            每天 05:00 后第一次打开 App 时自动备份一次；05:00 前算前一天，不需设置时间。
                                        </span>
                                    </span>
                                    <Switch
                                        checked={state.autoBackupEnabled}
                                        disabled={busy}
                                        onCheckedChange={(next) => void handleToggleAutoBackup(next)}
                                        aria-label="自动备份"
                                    />
                                </div>
                            ) : null}

                            <ActionRow
                                label={busy ? '正在备份…' : '立即备份'}
                                description={
                                    key
                                        ? '自动合并另一台设备的更新后再推送'
                                        : '首次备份会先生成密钥（下一步）'
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
                                label="从云端恢复"
                                description="覆盖式恢复；恢复前自动在本机快照"
                                disabled={busy}
                                onClick={() => setView('restore')}
                            />
                            <ActionRow
                                label="密钥与恢复"
                                description="恢复密钥 / 保护口令 / 指纹"
                                value={key ? '已启用' : '未生成'}
                                disabled={busy}
                                onClick={() => setView('key')}
                            />
                            <ActionRow
                                label="修改仓库连接"
                                description="更换仓库地址 / Token / 分支"
                                disabled={busy}
                                onClick={() => setView('form')}
                            />
                            <ActionRow
                                label="测试连接"
                                description="用已保存的配置检查仓库与 Token"
                                disabled={busy}
                                onClick={() => void handleTestConnection()}
                            />
                            <ActionRow
                                label="断开云端备份"
                                description="清除本机保存的仓库配置（保留密钥）"
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
                                返回
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
                title="断开云端备份？"
                description={
                    <div className="flex flex-col gap-2">
                        <p>断开只清除本机保存的仓库地址与 Token；账本数据不受影响。</p>
                        <p className="text-text-tertiary">
                            本机密钥会保留（可在「密钥与恢复」里查看恢复密钥）。若连同密钥一起删除，
                            将无法解密已经上传的云端备份。
                        </p>
                    </div>
                }
                confirmLabel="断开（保留密钥）"
                tone="danger"
                busy={busy}
                onConfirm={() => void handleDisconnect(false)}
            />
        </BottomSheet>
    );
}

export default CloudBackupSheet;
