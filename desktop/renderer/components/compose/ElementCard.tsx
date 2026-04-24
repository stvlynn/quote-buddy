'use client';

import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    Copy,
    Image as ImageIcon,
    Minus,
    Square,
    Trash2,
    Type,
    type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { IconButton } from '../ui/IconButton';
import type { ComposeElement, ElementKind } from '@/lib/types';
import { summariseElement } from '@/lib/compose';

const KIND_ICON: Record<ElementKind, LucideIcon> = {
    text:  Type,
    rect:  Square,
    line:  Minus,
    image: ImageIcon,
};

const KIND_TINT: Record<ElementKind, string> = {
    text:  'text-primary',
    rect:  'text-[#b39ddb]',
    line:  'text-[#80cbc4]',
    image: 'text-warn',
};

export interface ElementCardProps {
    element: ComposeElement;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove: (dir: -1 | 1) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    children: ReactNode; // the type-specific editor
}

export function ElementCard({
    element,
    canMoveUp,
    canMoveDown,
    onMove,
    onDuplicate,
    onDelete,
    children,
}: ElementCardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const Icon = KIND_ICON[element.kind];

    return (
        <div
            className={
                'bg-surface-2 border border-border rounded-md overflow-hidden ' +
                'transition-colors hover:border-border-strong'
            }
            data-kind={element.kind}
        >
            <header className="flex items-center gap-1.5 h-[34px] pl-0.5 pr-1.5">
                <IconButton
                    size="xs"
                    icon={
                        <ChevronDown
                            size={13}
                            className={`transition-transform duration-fast ${collapsed ? '-rotate-90' : ''}`}
                        />
                    }
                    aria-label={collapsed ? 'Expand element' : 'Collapse element'}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    onClick={() => setCollapsed((v) => !v)}
                />
                <span
                    aria-hidden
                    className={`inline-flex items-center justify-center w-[22px] h-[22px] shrink-0 ${KIND_TINT[element.kind]}`}
                >
                    <Icon size={14} />
                </span>
                <span className="text-sm font-semibold text-fg capitalize">{element.kind}</span>
                <span className="text-xs text-fg-subtle overflow-hidden text-ellipsis whitespace-nowrap min-w-0 flex-1">
                    {summariseElement(element)}
                </span>
                <IconButton size="xs" icon={<ArrowUp size={13} />}   aria-label="Move up"    onClick={() => onMove(-1)} disabled={!canMoveUp} />
                <IconButton size="xs" icon={<ArrowDown size={13} />} aria-label="Move down"  onClick={() => onMove(+1)} disabled={!canMoveDown} />
                <IconButton size="xs" icon={<Copy size={13} />}      aria-label="Duplicate"  onClick={onDuplicate} />
                <IconButton size="xs" icon={<Trash2 size={13} />}    aria-label="Delete"     onClick={onDelete} dangerHover />
            </header>
            {!collapsed && (
                <div className="p-2.5 border-t border-border bg-surface-1 flex flex-col gap-2">
                    {children}
                </div>
            )}
        </div>
    );
}
