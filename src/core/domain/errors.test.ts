import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError', () => {
    it('Error / 非空字符串直接透传', () => {
        expect(describeError(new Error('磁盘写入失败'))).toBe('磁盘写入失败');
        expect(describeError('校验失败：金额必须大于 0')).toBe('校验失败：金额必须大于 0');
    });

    it('其它值给统一兑底文案', () => {
        expect(describeError(undefined)).toBe('未知错误，请重试');
        expect(describeError('   ')).toBe('未知错误，请重试');
        expect(describeError({ code: 1 })).toBe('未知错误，请重试');
    });
});
