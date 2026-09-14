// 弹层内浮层的 portal 目标。
//
// Radix Dialog（BottomSheet）是 modal：它用 `react-remove-scroll` 做滚动锁，
// 只放行「弹层内容节点」这个 shard 里的滚动事件。浮层组件（Popover）默认
// portal 到 `document.body`，落在 shard 外 —— 结果就是弹层里的时间滚轮
// 点得动、滑不动（wheel / touchmove 被 preventDefault）。
//
// 解决方式：弹层把自己的内容节点放进这个 context，浮层默认 portal 到这里；
// 没有弹层祖先时 context 为 null，浮层仍然 portal 到 body（行为与以前一致）。

import { createContext, useContext } from 'react';

export const OverlayPortalContext = createContext<HTMLElement | null>(null);

/** 当前弹层的内容节点；不在弹层内时为 null。 */
export function useOverlayPortalContainer(): HTMLElement | null {
    return useContext(OverlayPortalContext);
}
