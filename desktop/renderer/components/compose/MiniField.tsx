'use client';

import type { ReactNode } from 'react';

export type MiniFieldSpan = 1 | 2 | 3 | 4;

const SPAN_CLS: Record<MiniFieldSpan, string> = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
};

export function MiniField({
    label,
    children,
    span = 1,
}: {
    label: ReactNode;
    children: ReactNode;
    span?: MiniFieldSpan;
}) {
    return (
        <div className={`flex flex-col gap-0.5 min-w-0 ${SPAN_CLS[span]}`}>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {label}
            </label>
            {children}
        </div>
    );
}

export function MiniGrid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">{children}</div>;
}
