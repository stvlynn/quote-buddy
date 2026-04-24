'use client';

import { useCallback, useState } from 'react';
import type { LogKind } from '@/lib/types';

export interface LogLine {
    id: number;
    ts: string;
    kind: LogKind;
    message: string;
}

export interface UseLog {
    lines: LogLine[];
    log: (msg: string, kind?: LogKind) => void;
    clear: () => void;
}

/**
 * Very small in-memory activity log.  Keeps the last 500 lines — enough for
 * a full flash session plus a bunch of sends, but bounded to avoid the
 * DOM ballooning.
 */
export function useLog(): UseLog {
    const [lines, setLines] = useState<LogLine[]>([]);

    const log = useCallback((message: string, kind: LogKind = '') => {
        setLines((prev) => {
            const next: LogLine = {
                id: prev.length ? prev[prev.length - 1].id + 1 : 1,
                ts: new Date().toLocaleTimeString(),
                kind,
                message,
            };
            const combined = [...prev, next];
            return combined.length > 500 ? combined.slice(combined.length - 500) : combined;
        });
    }, []);

    const clear = useCallback(() => setLines([]), []);

    return { lines, log, clear };
}
