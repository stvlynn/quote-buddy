'use client';

import {
    Image as ImageIcon,
    Minus,
    Plus,
    Square,
    Terminal,
    Type,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../ui/IconButton';
import type { ElementKind } from '@/lib/types';

export interface AddElementMenuProps {
    onAdd: (kind: ElementKind) => void;
    hasSourceImage: boolean;
}

const ITEMS: Array<{ kind: ElementKind; Icon: typeof Type; label: string }> = [
    { kind: 'text',  Icon: Type,      label: 'Text' },
    { kind: 'rect',  Icon: Square,    label: 'Rectangle' },
    { kind: 'line',  Icon: Minus,     label: 'Line' },
    { kind: 'image', Icon: ImageIcon, label: 'Image' },
    { kind: 'tui',   Icon: Terminal,  label: 'TUI scene' },
];

export function AddElementMenu({ onAdd, hasSourceImage }: AddElementMenuProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    return (
        <div ref={wrapRef} className="relative">
            <IconButton
                icon={<Plus size={14} />}
                aria-label="Add element"
                title="Add element"
                variant="primary"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            />
            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[160px] p-1 flex flex-col bg-surface-2 border border-border-strong rounded-md shadow-menu"
                >
                    {ITEMS.map(({ kind, Icon, label }) => {
                        const disabled = kind === 'image' && !hasSourceImage;
                        return (
                            <button
                                key={kind}
                                type="button"
                                role="menuitem"
                                disabled={disabled}
                                title={disabled ? 'Pick an image in the Image tab first' : undefined}
                                onClick={() => {
                                    if (disabled) return;
                                    onAdd(kind);
                                    setOpen(false);
                                }}
                                className={
                                    'flex items-center gap-2.5 h-[30px] px-2.5 rounded text-dense text-left ' +
                                    'text-fg transition-colors ' +
                                    'hover:bg-surface-3 disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:bg-transparent'
                                }
                            >
                                <Icon size={14} className="opacity-80" />
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
