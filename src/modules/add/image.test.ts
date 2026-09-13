// 图片处理纯逻辑测试。
//
// 压缩本身依赖 canvas（真机才有），这里覆盖可测的部分：
// 缩放换算、体积文案、base64 换算，以及「无 canvas 环境下的原图降级」分支。

import { describe, expect, it } from 'vitest';
import {
    JPEG_QUALITY,
    MAX_ATTACHMENTS,
    MAX_IMAGE_EDGE,
    base64ByteSize,
    dataUrlToBase64,
    formatBytes,
    prepareImage,
    remainingAttachmentSlots,
    scaleToFit,
} from './image';

describe('scaleToFit', () => {
    it('长边超过上限时等比缩小', () => {
        expect(scaleToFit(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
        expect(scaleToFit(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 });
    });

    it('不放大', () => {
        expect(scaleToFit(800, 600, 1600)).toEqual({ width: 800, height: 600 });
        expect(scaleToFit(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
    });

    it('极端尺寸不会算出 0', () => {
        expect(scaleToFit(4000, 1, 1600)).toEqual({ width: 1600, height: 1 });
        expect(scaleToFit(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    });
});

describe('formatBytes', () => {
    it('按 KB / MB 展示', () => {
        expect(formatBytes(0)).toBe('0 KB');
        expect(formatBytes(900)).toBe('900 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(1024 * 300)).toBe('300 KB');
        expect(formatBytes(1024 * 1024 * 1.4)).toBe('1.4 MB');
    });
});

describe('base64 换算', () => {
    it('从 data URL 取出裸 base64', () => {
        expect(dataUrlToBase64('data:image/jpeg;base64,QUJD')).toBe('QUJD');
        expect(dataUrlToBase64('QUJD')).toBe('QUJD');
    });
});

describe('remainingAttachmentSlots', () => {
    it('按上限算剩余张数', () => {
        expect(remainingAttachmentSlots(0)).toBe(MAX_ATTACHMENTS);
        expect(remainingAttachmentSlots(9)).toBe(0);
        expect(remainingAttachmentSlots(12)).toBe(0);
    });
});

describe('prepareImage（无 canvas 降级）', () => {
    it('jsdom 下走原图，保留原 MIME', async () => {
        const file = new File([new Uint8Array([1, 2, 3, 4])], 'a.png', { type: 'image/png' });
        const prepared = await prepareImage(file);
        expect(prepared.compressed).toBe(false);
        expect(prepared.mime).toBe('image/png');
        expect(prepared.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
        expect(prepared.byteSize).toBe(4);
    });

    it('后端不支持的格式在降级路径上直接报错', async () => {
        const file = new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' });
        await expect(prepareImage(file)).rejects.toThrow(/JPG/);
    });
});

describe('压缩参数常量', () => {
    it('与 BRD Q8 一致', () => {
        expect(MAX_IMAGE_EDGE).toBe(1600);
        expect(JPEG_QUALITY).toBe(0.8);
        expect(MAX_ATTACHMENTS).toBe(9);
    });
});

describe('base64ByteSize', () => {
    it('从 base64 还原原始字节数', () => {
        expect(base64ByteSize(btoa('abc'))).toBe(3);
        expect(base64ByteSize(btoa('abcd'))).toBe(4);
        expect(base64ByteSize(btoa('ab'))).toBe(2);
        expect(base64ByteSize('')).toBe(0);
    });
});
