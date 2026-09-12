// 退出闸门 IPC 服务。命令名只在这里出现，界面不直接调用 Tauri。

import { invoke, isTauri } from '../ipc/transport';

export interface PrepareExitResponse {
    can_exit: boolean;
    reason: string | null;
}

/** 退出前的异步准备。业务可在后端闸门里追加"未完成任务"检查。 */
export async function prepareExit(): Promise<PrepareExitResponse> {
    return isTauri ? invoke<PrepareExitResponse>('prepare_exit') : { can_exit: true, reason: null };
}

export async function requestExitApp(): Promise<void> {
    if (isTauri) await invoke<void>('request_exit_app');
}
