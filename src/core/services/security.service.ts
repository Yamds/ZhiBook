// 密码锁 IPC 服务：命令名只在这里出现。
//
// PIN 的哈希与校验都在 Rust（`tk-security`）；前端只负责输入与状态。
// 浏览器预览（非 Tauri）下：未设置密码、校验永远失败、写入静默忽略。

import { invoke, isTauri } from '../ipc/transport';

export const securityService = {
    async getPinConfigured(): Promise<boolean> {
        if (!isTauri) return false;
        return (await invoke<boolean>('get_pin_configured')) ?? false;
    },
    async setPin(pin: string): Promise<void> {
        if (isTauri) await invoke<void>('set_app_pin', { pin });
    },
    async changePin(oldPin: string, newPin: string): Promise<void> {
        if (isTauri) await invoke<void>('change_app_pin', { oldPin, newPin });
    },
    async verifyPin(pin: string): Promise<boolean> {
        if (!isTauri) return false;
        return (await invoke<boolean>('verify_app_pin', { pin })) ?? false;
    },
    async clearPin(pin: string): Promise<void> {
        if (isTauri) await invoke<void>('clear_app_pin', { pin });
    },
};
