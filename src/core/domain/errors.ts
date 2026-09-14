// 应用级错误封装与「把任意异常变成可展示文案」的唯一入口。

import { t } from '../i18n';
import type { ErrorPayload } from '../ipc/generated/domain/ErrorPayload';

export class AppError extends Error {
    constructor(message: string, public readonly code = 'APP_ERROR') {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * Rust 命令层抛出的结构化错误（定义在 `crates/tk-domain/src/error_payload.rs`，
 * 类型由 ts-rs 生成）。
 *
 * `code` 用来查语言文件（`rust.<code>`），查不到就用 `message`（Rust 侧的中文成品）。
 */
export type { ErrorPayload };

/** 判断一个值像不像 Rust 的 ErrorPayload。 */
function isErrorPayload(value: unknown): value is ErrorPayload {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/**
 * 结构化错误 → 展示文案。
 *
 * 语言文件里写 `rust.<code>`（`{{param}}` 会被 `params` 填充）；
 * 没写就退回 Rust 给的中文 `message`，**绝不显示原始错误码**。
 */
function describePayload(payload: ErrorPayload): string {
    const key = `rust.${payload.code}`;
    const translated = t(key, payload.params ?? {});
    // i18next 找不到 key 时原样返回 key，用这个特征判断「有没有译文」。
    return translated === key ? payload.message : translated;
}

/**
 * 把未知异常转成可展示文案。
 *
 * 命令层现在返回 `ErrorPayload`（JSON 对象），但历史路径上仍可能是 `Error`、
 * 纯字符串或完全意外的值，InfoBar 需要一个稳定文案。
 */
export function describeError(error: unknown): string {
    if (isErrorPayload(error)) return describePayload(error);
    if (error instanceof Error) return error.message;
    if (typeof error === 'string' && error.trim() !== '') {
        // 兼容老格式：命令层过去把错误 to_string() 后直接抛出来。
        try {
            const parsed: unknown = JSON.parse(error);
            if (isErrorPayload(parsed)) return describePayload(parsed);
        } catch {
            // 不是 JSON，按纯文本处理
        }
        return error;
    }
    return t('error.unknown');
}
