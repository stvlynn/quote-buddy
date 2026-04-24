'use client';

import type { ReactNode } from 'react';

export interface TabDef<T extends string> {
    value: T;
    label: string;
    title?: string;
}

export interface TabsProps<T extends string> {
    tabs: TabDef<T>[];
    value: T;
    onValueChange: (v: T) => void;
    ariaLabel?: string;
    children: ReactNode;
}

export function Tabs<T extends string>({
    tabs,
    value,
    onValueChange,
    ariaLabel = 'Content mode',
    children,
}: TabsProps<T>) {
    return (
        <>
            <nav
                role="tablist"
                aria-label={ariaLabel}
                className="flex gap-0.5 p-[3px] bg-surface-2 border border-border rounded-md"
            >
                {tabs.map((t) => {
                    const active = t.value === value;
                    return (
                        <button
                            key={t.value}
                            role="tab"
                            aria-selected={active}
                            title={t.title}
                            onClick={() => onValueChange(t.value)}
                            className={
                                'flex-1 px-2.5 py-1.5 rounded text-dense font-medium transition-colors ' +
                                (active
                                    ? 'bg-surface-1 text-fg shadow-[inset_0_0_0_1px_theme(colors.border-strong)]'
                                    : 'text-fg-muted hover:text-fg hover:bg-surface-3')
                            }
                        >
                            {t.label}
                        </button>
                    );
                })}
            </nav>
            <div>{children}</div>
        </>
    );
}
