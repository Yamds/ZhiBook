import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError', () => {
    it('Error / 非空字符串直接透传', () => {
        expect(describeError(new Error('磁盘写入失败'))).toBe('磁盘写入失败');
        expect(describeError('校验失败：金额必须大于 0')).toBe('校验失败：金额必须大于 0');
    });

    it('其它值给统一兑底文案', () => {
        expect(describeError(undefined)).toBe('出了点小状况，请重试');
        expect(describeError('   ')).toBe('出了点小状况，请重试');
        expect(describeError({ code: 1 })).toBe('出了点小状况，请重试');
    });

    it('结构化错误：收录的码走语言文件（rust.<code>），{{param}} 插值', () => {
        // `message` 故意写成和语言文件不一样：能拿到语言文件的文案才算查表生效
        expect(
            describeError({
                code: 'ledger.book.not_found',
                message: '（Rust 兜底文案，不该出现在这里）',
                params: { id: 'book_x' },
            }),
        ).toBe('咦…账本不见了：book_x');

        // `ledger.db` 同时是 `ledger.db.unavailable` 的前缀，语言文件里只能用点号直写的
        // 扁平 key（嵌不进对象），这条用例盯住它还能被 i18next 解析出来。
        expect(
            describeError({
                code: 'ledger.db',
                message: '（Rust 兜底文案，不该出现在这里）',
                params: { detail: 'database is locked' },
            }),
        ).toBe('数据库错误：database is locked');
    });

    it('结构化错误：未收录的码退回 Rust 的中文，且不暴露错误码', () => {
        expect(
            describeError({ code: 'cloud.some_unmapped_code', message: '云端出了点问题', params: {} }),
        ).toBe('云端出了点问题');
    });

    it('兼容老格式：JSON 字符串形态的结构化错误', () => {
        expect(
            describeError(
                JSON.stringify({
                    code: 'ledger.book.not_found',
                    message: '咦…账本不见了：book_y',
                    params: { id: 'book_y' },
                }),
            ),
        ).toBe('咦…账本不见了：book_y');
    });
});
