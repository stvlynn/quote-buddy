'use client';

import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    title?: string;
}

export interface SegmentedProps<T extends string> {
    value: T;
    onValueChange: (v: T) => void;
    options: SegmentedOption<T>[];
    'aria-label'?: string;
}

/** Compact pill-style toggle for small enums (align, valign, bw color…). */
export function Segmented<T extends string>({
    value,
    onValueChange,
    options,
    'aria-label': ariaLabel,
}: SegmentedProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className="inline-flex p-0.5 gap-0.5 bg-input-bg border border-border rounded"
        >
            {options.map((opt) => {
                const on = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={opt.title}
                        onClick={() => onValueChange(opt.value)}
                        className={
                            'h-[22px] min-w-[26px] px-2 rounded-[3px] text-xs font-medium ' +
                            'transition-colors ' +
                            (on
                                ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/35'
                                : 'text-fg-muted hover:text-fg hover:bg-surface-3')
                        }
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
