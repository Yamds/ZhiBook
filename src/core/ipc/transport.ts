import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';

export const isTauri = typeof window !== 'undefined' && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> { return tauriInvoke<T>(cmd, args); }
export async function listen<T = unknown>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
    return tauriListen<string>(event, (raw) => {
        try { handler(JSON.parse(raw.payload) as T); } catch { handler(raw.payload as T); }
    });
}
export async function openExternalUrl(url: string): Promise<void> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('only http/https URLs are allowed');
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
}
