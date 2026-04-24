'use client';

import type { ConnState } from '@/lib/types';

const LABELS: Record<ConnState, string> = {
    idle:      'No device detected. Plug in and press rescan.',
    connected: 'Quote/0 is connected on the selected port.',
    busy:      'Device is busy — flashing or sending a frame.',
    error:     'Last device operation reported an error.',
};

export function StatePill({ state, label }: { state: ConnState; label: string }) {
    const styles: Record<ConnState, string> = {
        idle:      'bg-surface-2 border-border text-fg-muted',
        connected: 'bg-ok/15 border-transparent text-ok',
        busy:      'bg-warn/15 border-transparent text-warn',
        error:     'bg-err/15 border-transparent text-err',
    };
    const dotStyles: Record<ConnState, string> = {
        idle:      'bg-fg-subtle',
        connected: 'bg-ok shadow-[0_0_0_3px_rgba(95,210,140,0.22)]',
        busy:      'bg-warn animate-pulse',
        error:     'bg-err',
    };

    return (
        <span
            title={LABELS[state]}
            className={
                'inline-flex items-center gap-1.5 h-[22px] pl-2 pr-2.5 rounded-full ' +
                'border text-xs font-medium tracking-wide uppercase whitespace-nowrap ' +
                styles[state]
            }
        >
            <span aria-hidden className={`w-[7px] h-[7px] rounded-full shrink-0 ${dotStyles[state]}`} />
            <span>{label}</span>
        </span>
    );
}
