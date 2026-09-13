// 全屏图片查看器（BRD FR-DET-6）：左右滑动切换、关闭按钮、页码。
//
// 自绘而不是引第三方浏览库：只有「横向翻页 + 关闭」两个需求，自绘能
// 完全走 token 与 useMotion 体系，也避免多一套手势与 body 滚动打架。
//
// 挂到 document.body（BodyPortal）：不受壳滚动容器与 BottomSheet 层级影响。

import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { FALLBACK_ICON_NAME, UI_ICONS } from '../../core/design/icons';
import type { Attachment } from '../../core/ipc/types';
import { useAttachmentData } from '../../hooks/ledger';
import { useMotion } from '../../hooks/preferences/useMotion';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BodyPortal } from '../../shared/ui/BodyPortal';
import { Spinner } from '../../shared/ui';
import { viewerIndexAfterRelease } from './detailsPage.logic';

export interface ImageViewerProps {
    items: ReadonlyArray<Attachment>;
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}

export function ImageViewer({ items, index, onIndexChange, onClose }: ImageViewerProps) {
    const motion = useMotion();
    const [dx, setDx] = useState(0);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const widthRef = useRef(0);

    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        startRef.current = { x: event.clientX, y: event.clientY };
        widthRef.current = event.currentTarget.clientWidth || window.innerWidth;
        event.currentTarget.setPointerCapture(event.pointerId);
    }, []);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const start = startRef.current;
        if (!start) return;
        setDx(event.clientX - start.x);
    }, []);

    const handlePointerUp = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (!startRef.current) return;
            const width = widthRef.current || event.currentTarget.clientWidth || window.innerWidth;
            onIndexChange(viewerIndexAfterRelease(index, dx, width, items.length));
            startRef.current = null;
            setDx(0);
        },
        [dx, index, items.length, onIndexChange],
    );

    return (
        <BodyPortal>
            <div
                className="fixed inset-0 z-[70] flex flex-col bg-black/95"
                data-no-swipe
                role="dialog"
                aria-label="图片查看器"
            >
                <header className="flex shrink-0 items-center justify-between px-3 pt-[var(--safe-top)] pb-1">
                    <span className="text-[12px] text-white/70 tabular-nums">
                        {items.length > 0 ? `${index + 1} / ${items.length}` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭图片查看器"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
                    >
                        <AppIcon name={UI_ICONS.close} size={18} />
                    </button>
                </header>

                <div
                    className="relative min-h-0 flex-1 overflow-hidden"
                    style={{ touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <div
                        className="flex h-full"
                        style={{
                            transform: `translate3d(calc(${-100 * index}% + ${dx}px), 0, 0)`,
                            // 关闭动效时直接落终态（useMotion 统一处理用户开关与系统偏好）
                            transition:
                                startRef.current || !motion.enabled ? 'none' : 'transform 220ms ease-out',
                        }}
                    >
                        {items.map((attachment) => (
                            <ViewerSlide key={attachment.id} attachment={attachment} />
                        ))}
                    </div>
                </div>

                <footer className="shrink-0 pb-[var(--safe-bottom)] pt-2 text-center text-[11px] text-white/50">
                    左右滑动切换图片
                </footer>
            </div>
        </BodyPortal>
    );
}

function ViewerSlide({ attachment }: { attachment: Attachment }) {
    const { data, isError } = useAttachmentData(attachment.id);
    const dataUrl = data ? `data:${data.attachment.mime};base64,${data.base64}` : undefined;

    return (
        <div className="flex h-full w-full shrink-0 items-center justify-center px-2">
            {dataUrl ? (
                <img
                    src={dataUrl}
                    alt="账单附件大图"
                    draggable={false}
                    className="max-h-full max-w-full object-contain"
                />
            ) : isError ? (
                <span className="flex flex-col items-center gap-2 text-white/60">
                    <AppIcon name={FALLBACK_ICON_NAME} size={28} />
                    <span className="text-[12px]">这张图片读不出来</span>
                </span>
            ) : (
                <Spinner size="lg" className="text-white/70" />
            )}
        </div>
    );
}

export default ImageViewer;
