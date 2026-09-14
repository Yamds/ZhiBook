// 金额工具（唯一入口）。
//
// 约定（BRD 3.2）：
//   - 内部一律用「分」的整数，禁止浮点参与金额运算；
//   - 展示一律 `¥ x,xxx.xx`，固定两位小数 + 千分位；
//   - 需要正负语义时：支出 `- ¥ 344.50` / 收入 `+ ¥ 1,000.00`。
//
// 自制数字键盘的表达式求值也在这里（纯函数，便于单测）：
//   12 + 3.5  → 1550 分
//   顺序求值（等同计算器），不区分优先级：10 - 3 + 2 = 9

export const MAX_AMOUNT_CENTS = 99_999_999_999; // ¥ 999,999,999.99
/** 整数部分最多 9 位（与 MAX_AMOUNT_CENTS 对齐）。 */
export const MAX_INTEGER_DIGITS = 9;

export type KeypadKey =
    | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
    | '.'
    | '+'
    | '-'
    | 'backspace';

function groupThousands(digits: string): string {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '1234.5' → '1,234.50'（不带货币符号，负数带前导 -）。 */
export function formatCents(cents: number): string {
    const value = Number.isFinite(cents) ? Math.trunc(cents) : 0;
    const negative = value < 0;
    const abs = Math.abs(value);
    const yuan = Math.floor(abs / 100);
    const fen = abs % 100;
    return `${negative ? '-' : ''}${groupThousands(String(yuan))}.${String(fen).padStart(2, '0')}`;
}

/** 1550 → '¥ 15.50'；负数 → '- ¥ 15.50'（负号在货币符号前）。 */
export function formatMoney(cents: number): string {
    const value = Number.isFinite(cents) ? Math.trunc(cents) : 0;
    const sign = value < 0 ? '- ' : '';
    return `${sign}¥ ${formatCents(Math.abs(value))}`;
}

/**
 * 带收支语义的金额：支出 `- ¥ 344.50`，收入 `+ ¥ 1,000.00`。
 * kind 省略时退化为普通金额（负数才带符号）。
 */
export function formatSignedMoney(cents: number, kind?: 'expense' | 'income' | null): string {
    if (kind === 'expense') return `- ${formatMoney(Math.abs(cents))}`;
    if (kind === 'income') return `+ ${formatMoney(Math.abs(cents))}`;
    return formatMoney(cents);
}

/**
 * 结余类金额（正负都有意义）：正数 `+ ¥ 1,000.00`、负数 `- ¥ 896.00`、零 `¥ 0.00`。
 *
 * 与 `formatSignedMoney` 的区别：后者的符号由「收支方向」决定，这里的符号就是数值本身。
 * 用于结余、当日合计、净资产这类可正可负的口径。
 */
export function formatSignedBalance(cents: number): string {
    const value = Number.isFinite(cents) ? Math.trunc(cents) : 0;
    if (value === 0) return formatMoney(0);
    return `${value > 0 ? '+' : '-'} ${formatMoney(Math.abs(value))}`;
}

/**
 * 紧凑金额（日历格子等窄空间用）：只返回数值部分，**不带货币符号与正负号**
 * （符号由调用方按收入 / 支出决定），并在金额变大时缩写：
 *
 *   ¥ 0.40  → `0.4`      （小于 100 元保留两位小数，去掉多余的 0）
 *   ¥ 12.00 → `12`
 *   ¥ 1,234 → `1,234`    （100 元 ~ 1 万元取整到元）
 *   ¥ 12,000 → `1.2万`
 *   ¥ 100,000,000 → `1亿`
 *
 * 注意：元位取整只发生在缩写档，避免 `¥ 0.40` 被显示成 `0`。
 */
export function formatCompactAmount(cents: number): string {
    const value = Number.isFinite(cents) ? Math.abs(Math.trunc(cents)) : 0;
    if (value === 0) return '0';
    const yuan = value / 100;
    if (yuan >= YI_FROM_YUAN) return `${compactScaled(yuan, 1e8)}亿`;
    if (yuan >= WAN_FROM_YUAN) return `${compactScaled(yuan, 1e4)}万`;
    if (yuan < 100) return formatCents(value).replace(/\.?0+$/, '');
    return groupThousands(String(Math.round(yuan)));
}

/** 缩写档的整数部分：≥ 100 个单位时收敛成整数并加千分位，否则保留一位小数。 */
function compactScaled(yuan: number, unit: number): string {
    const scaled = yuan / unit;
    return scaled >= 100
        ? groupThousands(String(Math.round(scaled)))
        : scaled.toFixed(1).replace(/\.0$/, '');
}

/** 进入「万」档次的门槛（元）：再小一位小数也不会进位成 10000 万。 */
const WAN_FROM_YUAN = 9_999.5;
/** 进入「亿」档次的门槛（元）= 9999.5 万，避免出现 `10,000万`。 */
const YI_FROM_YUAN = WAN_FROM_YUAN * 10_000;

/** 金额是否可提交：正数且不超过上限。 */
export function isSubmittableAmount(cents: number): boolean {
    return Number.isInteger(cents) && cents > 0 && cents <= MAX_AMOUNT_CENTS;
}

export type ExpressionParseResult =
    | { readonly ok: true; readonly cents: number }
    | { readonly ok: false; readonly reason: 'empty' | 'invalid' | 'overflow' };

/** '12.5' → 1250 分；非法片段返回 null。 */
function segmentToCents(segment: string): number | null {
    if (segment === '') return 0;
    if (!/^\d{0,15}(\.\d{0,2})?$/.test(segment)) return null;
    const [yuanPart = '', fenPart = ''] = segment.split('.');
    const yuan = yuanPart === '' ? 0 : Number(yuanPart);
    const fen = Number((fenPart + '00').slice(0, 2));
    const cents = yuan * 100 + fen;
    return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * 求值键盘表达式。
 *
 * 输入约定：只含数字、`.`、`+`、`-`（键盘不会产出别的字符）。
 * 尾随运算符按「还没输入下一个数」处理（12+ → 12）。
 * 允许结果为 0 或负数：是否可提交由 `isSubmittableAmount` 决定。
 */
export function parseAmountExpression(expression: string): ExpressionParseResult {
    const raw = expression.trim();
    if (raw === '') return { ok: false, reason: 'empty' };
    if (!/^[\d.+-]+$/.test(raw)) return { ok: false, reason: 'invalid' };

    let total = 0;
    let pendingOperator: '+' | '-' = '+';
    let segment = '';

    const applySegment = (): boolean => {
        const cents = segmentToCents(segment);
        if (cents === null) return false;
        total = pendingOperator === '+' ? total + cents : total - cents;
        segment = '';
        return true;
    };

    for (let i = 0; i < raw.length; i += 1) {
        const char = raw[i] as string;
        if (char === '+' || char === '-') {
            if (!applySegment()) return { ok: false, reason: 'invalid' };
            pendingOperator = char === '+' ? '+' : '-';
            continue;
        }
        segment += char;
    }
    if (!applySegment()) return { ok: false, reason: 'invalid' };
    if (!Number.isSafeInteger(total)) return { ok: false, reason: 'overflow' };
    if (Math.abs(total) > MAX_AMOUNT_CENTS) return { ok: false, reason: 'overflow' };
    return { ok: true, cents: total };
}

/** 当前表达式里最后一个数字片段。 */
function currentSegment(expression: string): string {
    const match = expression.match(/[^+-]*$/);
    return match ? match[0] : '';
}

/**
 * 键盘输入：返回新表达式；返回 null 表示这次按键被拒绝（非法输入）。
 *
 * 规则：
 *   - 整数部分最多 9 位、小数最多 2 位；
 *   - `.` 只能出现一次；空片段按 `0.` 起头；
 *   - 运算符不能打头；连按运算符等于替换；
 *   - 退格删最后一个字符。
 */
export function tryAppendKeypadKey(expression: string, key: KeypadKey): string | null {
    if (key === 'backspace') {
        return expression.length > 0 ? expression.slice(0, -1) : null;
    }

    if (key === '+' || key === '-') {
        if (expression === '') return null;
        const last = expression[expression.length - 1];
        if (last === '+' || last === '-') return `${expression.slice(0, -1)}${key}`;
        return expression + key;
    }

    const segment = currentSegment(expression);

    if (key === '.') {
        if (segment.includes('.')) return null;
        return segment === '' ? `${expression}0.` : `${expression}.`;
    }

    // 数字
    const [integerPart = '', decimalPart] = segment.split('.');
    if (decimalPart !== undefined && decimalPart.length >= 2) return null;
    if (decimalPart === undefined && integerPart === '0') {
        // 前导 0 直接替换，避免出现 007
        return `${expression.slice(0, -1)}${key}`;
    }
    if (decimalPart === undefined && integerPart.length >= MAX_INTEGER_DIGITS) return null;
    return expression + key;
}

// ---------------------------------------------------------------------------
// 金额输入框（文本 ↔ 分）
//
// 资产页「初始余额」、固定收支「金额」、账单「键盘回填」三处原先各写了一份
// 解析 / 格式化；规则（允许负号？空串算 0？去千分位？保留尾零？）不同，
// 逻辑却完全同源。这里收敛成两个函数，页面只传选项。
// ---------------------------------------------------------------------------

/** [`parseAmountInput`] 的选项（默认值即「最严」：只收正数、空串非法）。 */
export interface ParseAmountOptions {
    /** 允许前导负号（账户初始余额可以为负）。默认 false。 */
    readonly allowNegative?: boolean;
    /** 允许结果为 0（账户初始余额可以留空 = 0）。默认 false。 */
    readonly allowZero?: boolean;
    /** 空串视为 0；默认 false 表示空串返回 null。 */
    readonly emptyAsZero?: boolean;
}

/** 输入框里允许出现的装饰字符（千分位 / 空格 / 货币符号）。 */
const AMOUNT_NOISE = /[,，\s¥￥]/g;
const AMOUNT_TEXT_PATTERN = new RegExp(
    `^(-?)(\\d{0,${MAX_INTEGER_DIGITS}})(?:\\.(\\d{0,2}))?$`,
);

/**
 * 金额输入文本（元）→ 分；非法 / 超上限返回 `null`。
 *
 * 统一规则：先 trim、剔掉千分位与货币符号；整数部分最多 9 位、小数最多 2 位；
 * 空串按 `emptyAsZero` 处理；0 按 `allowZero` 处理；负号按 `allowNegative` 处理。
 * 全程整数运算（`元 * 100 + 分`），不引入浮点误差。
 */
export function parseAmountInput(text: string, options: ParseAmountOptions = {}): number | null {
    const { allowNegative = false, allowZero = false, emptyAsZero = false } = options;
    const normalized = text.replace(AMOUNT_NOISE, '').trim();
    if (normalized === '') return emptyAsZero ? 0 : null;

    const match = AMOUNT_TEXT_PATTERN.exec(normalized);
    if (!match) return null;
    const [, sign = '', yuanPart = '', fenPart = ''] = match;
    // `-` / `.` / `¥` 这类「没有任何数字」的输入一律非法（`emptyAsZero` 只管空串）
    if (yuanPart === '' && fenPart === '') return null;
    const cents =
        (yuanPart === '' ? 0 : Number(yuanPart)) * 100 +
        (fenPart === '' ? 0 : Number(fenPart.padEnd(2, '0')));
    const signed = cents === 0 ? 0 : sign === '-' ? -cents : cents;
    if (!Number.isSafeInteger(signed) || Math.abs(signed) > MAX_AMOUNT_CENTS) return null;
    if (signed === 0 && !allowZero) return null;
    if (signed < 0 && !allowNegative) return null;
    return signed;
}

/** [`centsToInputText`] 的选项。 */
export interface CentsToInputOptions {
    /** 0 返回空串（配合 placeholder）。默认 true。 */
    readonly emptyWhenZero?: boolean;
    /** 千分位分组（余额输入框用）。默认 false。 */
    readonly group?: boolean;
    /** 去掉小数末尾的 0（固定收支金额框用）。默认 false。 */
    readonly trimZeros?: boolean;
}

/** 分 → 输入框文本（元），不带货币符号；全程整数运算，不用浮点。 */
export function centsToInputText(cents: number, options: CentsToInputOptions = {}): string {
    const { emptyWhenZero = true, group = false, trimZeros = false } = options;
    const value = Number.isFinite(cents) ? Math.trunc(cents) : 0;
    if (value === 0 && emptyWhenZero) return '';
    const negative = value < 0;
    const abs = Math.abs(value);
    const yuan = Math.floor(abs / 100);
    const fen = abs % 100;
    let text = `${group ? groupThousands(String(yuan)) : String(yuan)}.${String(fen).padStart(2, '0')}`;
    if (trimZeros) text = text.replace(/\.?0+$/, '');
    return negative ? `-${text}` : text;
}
