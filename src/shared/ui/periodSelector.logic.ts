// 周期选择器的纯几何/取值逻辑。
//
// 抽出来的原因：滚动居中的边界条件（首尾空槽、夹取、最近项判定）容易写错，
// 而它们与 DOM 无关，值得单测钉住。

/** 取候选里最接近的值；values 为空时原样返回。 */
export function nearestValue(values: readonly number[], value: number): number {
    if (values.length === 0) return value;
    let best = values[0] as number;
    let bestDistance = Math.abs(best - value);
    for (const candidate of values) {
        const distance = Math.abs(candidate - value);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

/** 让某个 item 居中的 scrollLeft。 */
export function centeredScrollLeft(itemOffsetLeft: number, itemWidth: number, clientWidth: number): number {
    return Math.max(0, itemOffsetLeft - (clientWidth - itemWidth) / 2);
}

/**
 * 从各 item 的几何中心里找离视口中心最近的那个 index。
 *
 * @param itemCenters 每个 item 的中心（相对轨道内容，即 offsetLeft + width/2）
 * @param scrollLeft  当前滚动位置
 * @param clientWidth 视口宽度
 */
export function nearestIndexFromViewport(
    itemCenters: readonly number[],
    scrollLeft: number,
    clientWidth: number,
): number {
    if (itemCenters.length === 0) return -1;
    const viewportCenter = scrollLeft + clientWidth / 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < itemCenters.length; index += 1) {
        const distance = Math.abs((itemCenters[index] as number) - viewportCenter);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }
    return bestIndex;
}
