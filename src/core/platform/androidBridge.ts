// JS ↔ Android 原生桥。
//
// 原生侧（src-tauri/gen/android/app/src/main/java/cafe/yamds/zhibook/MainActivity.kt）
// 通过 evaluateJavascript 调用这里注册的全局函数。改这个文件必须同步改 MainActivity.kt。
//
//   window.__yamdsBackPressed()  → 'handled' | 'exit'
//
// 退出行为是壳的固定策略，不再是设置项：
//   - 首页按返回键 → 弹「退出程序？」确认框，确认后原生 finish()
//   - 退到后台 → 什么都不做（不注册任何后台内存策略）

export type BackPressResult = 'handled' | 'exit';

type AndroidBridgeWindow = Window & {
    __yamdsBackPressed?: () => BackPressResult;
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
