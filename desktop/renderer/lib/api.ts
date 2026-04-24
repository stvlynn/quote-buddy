/* -------------------------------------------------------------------------
 * Typed facade over the `window.api` bridge exposed by preload.js.
 *
 * Importing from this module is the only way a React component should talk
 * to the Electron main process — it keeps all IPC typing in one place and
 * means hooks can be unit-tested against a stub.
 * ------------------------------------------------------------------------- */

'use client';

import type {
    CustomFirmwareInfo,
    FirmwareLog,
    FlashResult,
    PickImageResult,
    SerialPortInfo,
    StockFirmwareInfo,
} from './types';

interface DesktopApi {
    listPorts(): Promise<SerialPortInfo[]>;
    sendFrame(portPath: string, frame: number[]): Promise<string>;
    sendCommand(portPath: string, command: string): Promise<string>;

    pickImage(): Promise<PickImageResult | null>;
    pickStockImage(): Promise<string | null>;

    customFirmwareAvailable(): Promise<CustomFirmwareInfo>;
    stockFirmwareAvailable(): Promise<StockFirmwareInfo>;
    flashCustom(portPath: string): Promise<FlashResult>;
    flashStock(portPath: string, binPath?: string): Promise<FlashResult>;

    onFirmwareLog(cb: (p: FirmwareLog) => void): () => void;
}

declare global {
    interface Window {
        api?: DesktopApi;
    }
}

/** Returns the desktop API, or `null` when running outside Electron (SSR / tests). */
export function getApi(): DesktopApi | null {
    if (typeof window === 'undefined') return null;
    return window.api ?? null;
}

/** Throws if the API is missing — use from code that is definitely in Electron. */
export function requireApi(): DesktopApi {
    const api = getApi();
    if (!api) {
        throw new Error(
            'window.api is not available — are we running inside Electron?',
        );
    }
    return api;
}
