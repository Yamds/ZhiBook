// 记账提醒的原生桥（JS → Android）。
//
// 原生侧在 `MainActivity.onWebViewCreate` 里 `addJavascriptInterface(ReminderBridge(), "YamdsReminder")`；
// 改本文件必须同步改 `MainActivity.kt`（与返回键桥同一套约定）。
//
// 定时与通知都由原生负责：`AlarmManager`（一次性闹钟 + 每次触发后重排）+ 开机/升级后 `BootReceiver`
// 重排。App 不在前台、甚至被划掉/重启后，系统仍会拉起 Receiver 发通知。

export interface ReminderConfig {
    enabled: boolean;
    hour: number;
    minute: number;
    title: string;
    body: string;
}

interface YamdsReminderNative {
    schedule(enabled: boolean, hour: number, minute: number, title: string, body: string): void;
    requestNotificationPermission(): void;
    isNotificationPermissionGranted(): boolean;
    isIgnoringBatteryOptimizations(): boolean;
    openBatterySettings(): void;
}

function nativeBridge(): YamdsReminderNative | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { YamdsReminder?: YamdsReminderNative }).YamdsReminder ?? null;
}

export const reminderBridge = {
    /** 是否运行在带原生桥的 Android 壳里。 */
    isAvailable: (): boolean => nativeBridge() !== null,

    /** 同步提醒配置并重排闹钟（enabled=false 时取消）。 */
    schedule(config: ReminderConfig): void {
        nativeBridge()?.schedule(
            config.enabled,
            config.hour,
            config.minute,
            config.title,
            config.body,
        );
    },

    /** 请求通知权限（Android 13+ 首次开启时调用）。 */
    requestPermission(): void {
        nativeBridge()?.requestNotificationPermission();
    },

    isPermissionGranted(): boolean {
        return nativeBridge()?.isNotificationPermissionGranted() ?? false;
    },

    isIgnoringBatteryOptimizations(): boolean {
        return nativeBridge()?.isIgnoringBatteryOptimizations() ?? false;
    },

    /** 打开系统的电池优化白名单设置（国产 ROM 省电策略需要）。 */
    openBatterySettings(): void {
        nativeBridge()?.openBatterySettings();
    },
};
