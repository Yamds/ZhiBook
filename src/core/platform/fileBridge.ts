// 数据备份的原生文件桥（JS → Android）。
//
// 原生侧在 `MainActivity.onWebViewCreate` 里 `addJavascriptInterface(FileBridge(), "YamdsFiles")`；
// 导入文件复制到缓存后，原生回调 `window.__yamdsImportFileReady(path)`。
// 改本文件必须同步改 `MainActivity.kt`（与返回键 / 提醒桥同一套约定）。

interface YamdsFilesNative {
    saveFile(sourcePath: string, suggestedName: string): void;
    pickImportFile(): void;
}

function nativeBridge(): YamdsFilesNative | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { YamdsFiles?: YamdsFilesNative }).YamdsFiles ?? null;
}

type ImportReadyWindow = Window & {
    __yamdsImportFileReady?: (path: string) => void;
};

export const fileBridge = {
    isAvailable: (): boolean => nativeBridge() !== null,

    /** 把沙箱里的文件交给系统「保存到…」对话框。 */
    saveFile(sourcePath: string, suggestedName: string): void {
        nativeBridge()?.saveFile(sourcePath, suggestedName);
    },

    /** 打开系统文件选择器挑选备份包（选完由原生回调路径）。 */
    pickImportFile(): void {
        nativeBridge()?.pickImportFile();
    },
};

/** 注册「导入文件已就绪」回调，返回 cleanup。 */
export function registerImportFileHandler(handler: (path: string) => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const target = window as ImportReadyWindow;
    target.__yamdsImportFileReady = handler;
    return () => {
        if (target.__yamdsImportFileReady === handler) delete target.__yamdsImportFileReady;
    };
}
