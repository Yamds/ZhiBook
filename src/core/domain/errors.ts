export class AppError extends Error { constructor(message: string, public readonly code = 'APP_ERROR') { super(message); this.name = 'AppError'; } }

/**
 * 把未知异常转成可展示文案。
 *
 * Rust IPC 命令层统一返回字符串错误（`CommandResult<T> = Result<T, String>`），
 * 前端捕获到的可能是 `Error`、字符串或完全意外的值，InfoBar 需要一个稳定文案。
 */
export function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string' && error.trim() !== '') return error;
    return '未知错误，请重试';
}
