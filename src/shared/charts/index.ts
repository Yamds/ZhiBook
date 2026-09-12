// 图表库：自绘 SVG / CSS 组件，风格与设计系统同源。
//
// 不引入 Chart.js / Recharts 等重型依赖的原因：
//   体积（APK 敏感）、主题色需要跟随 token、动效要统一走 useMotion()。
// 几何计算全部在 geometry.ts（纯函数 + 单测），组件只负责画。

export { DonutChart, type DonutChartProps, type DonutChartSlice } from './DonutChart';
export { LineChart, type LineChartPoint, type LineChartProps } from './LineChart';
export { RankRow, type RankRowProps } from './RankRow';
export { DisparityBar, type DisparityBarProps } from './DisparityBar';
export {
    buildAreaPath,
    buildLinePoints,
    buildPolylinePath,
    computeDonutArcs,
    donutArcPath,
    niceCeil,
    polarPoint,
    valueToY,
    type DonutArc,
    type DonutOptions,
    type DonutSliceInput,
    type LineChartOptions,
    type PointGeometry,
} from './geometry';
