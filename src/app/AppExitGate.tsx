// 退出闸门：由 Android 返回键（首页）触发。
// 确认后释放全部资源、彻底结束进程；没有「退到后台」分支（后台策略固定为什么都不做）。

import React, { useState } from 'react';
import { prepareExit, requestExitApp, type PrepareExitResponse } from '../core/services/exit.service';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Spinner } from '../shared/ui';

type Mode = 'confirm' | 'blocked';

export const AppExitGate: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
    const [mode, setMode] = useState<Mode>('confirm');
    const [result, setResult] = useState<PrepareExitResponse | null>(null);
    const [exiting, setExiting] = useState(false);
    const [preparing, setPreparing] = useState(false);

    const runExitFlow = React.useCallback(async () => {
        setPreparing(true);
        try {
            const prepared = await prepareExit();
            setResult(prepared);
            setMode(prepared.can_exit ? 'confirm' : 'blocked');
        } catch {
            // 准备流程失败不能把界面锁死；按可退出处理。
            setResult({ can_exit: true, reason: null });
            setMode('confirm');
        } finally {
            setPreparing(false);
        }
    }, []);

    const handleOpenChange = (next: boolean) => {
        if (next && !result && !preparing) void runExitFlow();
        if (!next) setExiting(false);
        onOpenChange(next);
    };

    React.useEffect(() => {
        if (open && !result && !preparing) void runExitFlow();
    }, [open, result, preparing, runExitFlow]);

    const confirm = async () => {
        setExiting(true);
        try {
            await requestExitApp();
        } catch {
            setExiting(false);
            setResult(null);
            void runExitFlow();
        }
    };

    if (!open) return null;
    if (!result) {
        return <Dialog open onOpenChange={handleOpenChange}><DialogContent size="sm"><DialogHeader><DialogTitle>退出程序？</DialogTitle><DialogDescription>正在准备退出…</DialogDescription></DialogHeader><DialogFooter><Spinner size="sm" /></DialogFooter></DialogContent></Dialog>;
    }

    return <Dialog open onOpenChange={handleOpenChange}><DialogContent size="sm"><DialogHeader><DialogTitle>{mode === 'blocked' ? '暂时无法退出' : '退出程序？'}</DialogTitle><DialogDescription>{mode === 'blocked' ? result.reason ?? '当前操作尚未完成，请稍后重试。' : '将关闭制账并释放全部资源。'}</DialogDescription></DialogHeader><DialogFooter>{mode === 'blocked' ? <Button onClick={() => onOpenChange(false)}>知道了</Button> : <><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="danger" disabled={exiting} onClick={() => void confirm()}>{exiting ? '正在退出…' : '退出'}</Button></>}</DialogFooter></DialogContent></Dialog>;
};

export default AppExitGate;
