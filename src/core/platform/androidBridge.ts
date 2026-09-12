// JS ↔ Android 原生桥。
//
// 原生侧（src-tauri/gen/android/app/src/main/java/cafe/yamds/bill/MainActivity.kt）
// 通过 evaluateJavascript 调用这里注册的两个全局函数。它们是「设置页里的行为设置
// 真正生效」的唯一通道——改这个文件必须同步改 MainActivity.kt。
//
//   window.__yamdsBackPressed()        → 'handled' | 'background' | 'exit'
//   window.__yamdsBackgroundPolicy()   → { mode, delaySecs }

import type { AfterCloseUiBehavior } from '../services/settings.service';

export type BackPressResult = 'handled' | 'background' | 'exit';

export interface BackgroundPolicy {
    /** 与后端 afterCloseUiBehavior 同值，原生按它决定是否结束后台。 */
    mode: AfterCloseUiBehavior;
    /** 延迟秒数，仅 mode = delayed_lightweight 时有意义。 */
    delaySecs: number;
}

type AndroidBridgeWindow = Window & {
    __yamdsBackPressed?: () => BackPressResult;
    __yamdsBackgroundPolicy?: () => BackgroundPolicy;
};

/** 注册物理返回键处理器，返回 cleanup。 */
export function registerBackButtonHandler(handler: () => BackPressResult): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const target = window as AndroidBridgeWindow;
    target.__yamdsBackPressed = handler;
    return () => {
        if (target.__yamdsBackPressed === handler) delete target.__yamdsBackPressed;
    };
}

/** 注册后台界面策略提供者，返回 cleanup。 */
export function registerBackgroundPolicyProvider(provider: () => BackgroundPolicy): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const target = window as AndroidBridgeWindow;
    target.__yamdsBackgroundPolicy = provider;
    return () => {
        if (target.__yamdsBackgroundPolicy === provider) delete target.__yamdsBackgroundPolicy;
    };
}
