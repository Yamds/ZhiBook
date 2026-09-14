// 图片附件处理：解码 → 等比缩放 → JPEG 重编码 → base64。
//
// 口径（BRD Q8 / FR-ADD-12）：单笔最多 9 张，长边 ≤1600px、JPEG 质量 80。
// 压缩在**前端**做（canvas），Rust 只负责把字节流落盘，因此后端保持简单。
//
// 降级策略：WebView 没有 `createImageBitmap` / canvas 时走原图，
// 但只允许后端支持的三种 MIME（jpeg / png / webp），其余直接报错——
// 宁可不加图，也不要写进去一个后端存不下的文件。

import { t } from '../../core/i18n';

/** 单笔附件上限（与 Rust `MAX_ATTACHMENTS_PER_TRANSACTION` 一致）。 */
export const MAX_ATTACHMENTS = 9;
/** 压缩后的长边上限。 */
export const MAX_IMAGE_EDGE = 1600;
/** JPEG 质量。 */
export const JPEG_QUALITY = 0.8;
/** 后端（`tk-ledger::validate::attachment_mime`）允许的 MIME。 */
export const SUPPORTED_IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** 待保存的附件（还没落库，只存在页面状态里）。 */
export interface PendingAttachment {
    readonly localId: string;
    readonly mime: string;
    readonly base64: string;
    /** 预览用（`data:` URL，可直接塞给 <img>）。 */
    readonly dataUrl: string;
    readonly byteSize: number;
    readonly width: number;
    readonly height: number;
    /** false = 未能压缩，按原图提交。 */
    readonly compressed: boolean;
}

export interface CompressOptions {
    maxEdge?: number;
    quality?: number;
}

/** 等比缩放到长边不超过 `maxEdge`；只缩不放。 */
export function scaleToFit(
    width: number,
    height: number,
    maxEdge: number,
): { width: number; height: number } {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return { width: 0, height: 0 };
    }
    const longest = Math.max(width, height);
    if (maxEdge <= 0 || longest <= maxEdge) {
        return { width: Math.round(width), height: Math.round(height) };
    }
    const ratio = maxEdge / longest;
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
    };
}

/** 展示用的体积文案：`820 KB` / `1.4 MB`。 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

/** `data:image/jpeg;base64,AAAA` → `AAAA`。 */
export function dataUrlToBase64(dataUrl: string): string {
    const index = dataUrl.indexOf(',');
    return index >= 0 ? dataUrl.slice(index + 1) : dataUrl;
}

/** base64 字符串 → 原始字节数（去掉 padding 与换行）。 */
export function base64ByteSize(base64: string): number {
    const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** 浏览器能否用 canvas 压缩（Android WebView / 现代浏览器都可以，jsdom 不行）。 */
function canCompress(): boolean {
    return (
        typeof document !== 'undefined' &&
        typeof createImageBitmap === 'function' &&
        typeof HTMLCanvasElement !== 'undefined'
    );
}

function readAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error ?? new Error(t('add.imageReadFailed')));
        reader.readAsDataURL(file);
    });
}

/** 把压缩后的画布转成 JPEG data URL。 */
function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error(t('add.imageEncodeFailed')));
                    return;
                }
                void readAsDataUrl(blob).then(resolve, reject);
            },
            'image/jpeg',
            quality,
        );
    });
}

let localIdSeed = 0;

function nextLocalId(): string {
    localIdSeed += 1;
    return `local-${localIdSeed}`;
}

/**
 * 处理一张用户选中的图片。
 *
 * @throws 当图片类型既不在后端白名单里、又无法压缩时。
 */
export async function prepareImage(
    file: File,
    options: CompressOptions = {},
): Promise<PendingAttachment> {
    const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE;
    const quality = options.quality ?? JPEG_QUALITY;

    if (!canCompress()) {
        if (!SUPPORTED_IMAGE_MIMES.includes(file.type)) {
            throw new Error(t('add.imageUnsupported'));
        }
        const dataUrl = await readAsDataUrl(file);
        return {
            localId: nextLocalId(),
            mime: file.type,
            base64: dataUrlToBase64(dataUrl),
            dataUrl,
            byteSize: file.size,
            width: 0,
            height: 0,
            compressed: false,
        };
    }

    const bitmap = await createImageBitmap(file);
    try {
        const target = scaleToFit(bitmap.width, bitmap.height, maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t('add.imageContextFailed'));
        context.drawImage(bitmap, 0, 0, target.width, target.height);
        const dataUrl = await canvasToJpegDataUrl(canvas, quality);
        const base64 = dataUrlToBase64(dataUrl);
        return {
            localId: nextLocalId(),
            mime: 'image/jpeg',
            base64,
            dataUrl,
            byteSize: base64ByteSize(base64),
            width: target.width,
            height: target.height,
            compressed: true,
        };
    } finally {
        bitmap.close?.();
    }
}

/** 还可以再加几张（0 表示已达上限）。 */
export function remainingAttachmentSlots(current: number, max = MAX_ATTACHMENTS): number {
    return Math.max(0, max - current);
}
