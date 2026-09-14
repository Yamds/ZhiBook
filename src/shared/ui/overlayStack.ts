// 全局弹层栈：Android 返回键先关最上层弹层，再交给页面 / 壳处理。
//
// 为什么需要：BottomSheet / Dialog 把 Esc、焦点陷阱、外点关闭交给了 Radix，但 Android 硬件
// 返回键走的是原生桥（`__yamdsBackPressed`）→ 壳（AppNext）。设置页 / 资产页等没有注册
// 页面级返回拦截的页面，弹层打开时返回键会直接回首页。这里让每个打开的弹层入栈，
// 壳按「后开先关」消费一次，关掉最上层。
//
// 嵌套弹层（云端备份里的 PIN 验证层、二次确认层等）天然满足：内层晚于外层注册，后进先出。
// 与 `pageBackHandler` 同款「身份校验后再清理」：弹层退场动画期间旧组件的 cleanup
// 不能把新弹层的注册顶掉。

export type OverlayClose = () => void;

interface OverlayEntry {
    readonly close: OverlayClose;
}

const stack: OverlayEntry[] = [];

/** 弹层打开时入栈；返回注销函数（关闭 / 卸载时调用）。 */
export function pushOverlay(close: OverlayClose): () => void {
    const entry: OverlayEntry = { close };
    stack.push(entry);
    return () => {
        const index = stack.indexOf(entry);
        if (index >= 0) stack.splice(index, 1);
    };
}

/** 关闭最上层弹层；栈空时返回 false（交给页面拦截 / 壳导航）。
 *
 * 先出栈再调 close：组件真正关闭后 effect cleanup 还会再调一次注销（indexOf -1，无事发生）；
 * 即使 close 因故没能关闭弹层，栈也不会残留脏项阻塞下一次返回键。
 */
export function closeTopOverlay(): boolean {
    const entry = stack.pop();
    if (!entry) return false;
    entry.close();
    return true;
}

/** 当前弹层数量（测试 / 调试用）。 */
export function overlayDepth(): number {
    return stack.length;
}
