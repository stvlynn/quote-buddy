'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { IconButton } from './ui/IconButton';
import type { LogLine } from '@/hooks/useLog';

export interface StatusPanelProps {
    reply: { text: string; kind: '' | 'ok' | 'err' };
    log: LogLine[];
    onClearLog: () => void;
}

export function StatusPanel({ reply, log, onClearLog }: StatusPanelProps) {
    const logRef = useRef<HTMLPreElement>(null);

    // Auto-scroll to the bottom on new messages, but respect the user if
    // they have scrolled up.
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
        if (atBottom) el.scrollTop = el.scrollHeight;
    }, [log.length]);

    return (
        <section
            aria-label="Device and activity log"
            className="panel-shell flex flex-col p-3 gap-3 overflow-hidden"
        >
            <div className="flex flex-col gap-1.5 min-h-0">
                <h3 className="section-heading">Device reply</h3>
                <pre
                    className={
                        'm-0 px-2.5 py-2 bg-input-bg border border-border rounded font-mono text-xs whitespace-pre-wrap break-words ' +
                        'min-h-[40px] max-h-[120px] overflow-auto ' +
                        (reply.kind === 'ok' ? 'text-ok' : reply.kind === 'err' ? 'text-err' : reply.text === '—' ? 'text-fg-subtle' : 'text-fg')
                    }
                >
                    {reply.text || '—'}
                </pre>
            </div>
            <div className="flex flex-col gap-1.5 min-h-0 flex-1">
                <h3 className="section-heading flex items-center justify-between gap-2">
                    <span>Activity log</span>
                    <IconButton
                        size="xs"
                        icon={<Trash2 size={13} />}
                        aria-label="Clear activity log"
                        title="Clear log"
                        onClick={onClearLog}
                    />
                </h3>
                <pre
                    ref={logRef}
                    className="m-0 px-2.5 py-2 bg-input-bg border border-border rounded font-mono text-xs whitespace-pre-wrap break-words flex-1 min-h-[80px] overflow-auto"
                >
                    {log.length === 0
                        ? <span className="text-fg-subtle">—</span>
                        : log.map((line) => (
                            <div key={line.id}>
                                <span className="text-fg-subtle">{line.ts} </span>
                                <span className={line.kind === 'ok' ? 'text-ok' : line.kind === 'err' ? 'text-err' : 'text-fg'}>
                                    {line.message}
                                </span>
                            </div>
                        ))}
                </pre>
            </div>
        </section>
    );
}
