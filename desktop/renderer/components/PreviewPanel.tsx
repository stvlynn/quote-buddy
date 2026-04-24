'use client';

import { useState, type RefObject } from 'react';

export interface PreviewPanelProps {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    size: { w: number; h: number };
    hash: string;
    info: string;
}

export function PreviewPanel({ canvasRef, size, hash, info }: PreviewPanelProps) {
    const [copied, setCopied] = useState(false);

    const copyHash = async () => {
        if (!hash || hash === '—') return;
        try {
            await navigator.clipboard.writeText(hash);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            /* noop */
        }
    };

    return (
        <section
            aria-label="Device preview"
            className="panel-shell flex flex-col p-3 gap-3"
        >
            <div className="flex items-center justify-between text-xs text-fg-muted uppercase tracking-wider">
                <span className="text-sm font-semibold normal-case tracking-normal text-fg">Preview</span>
                <span>{size.w} × {size.h}</span>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-auto p-4 border border-border rounded-md preview-stage relative">
                <canvas
                    ref={canvasRef as RefObject<HTMLCanvasElement>}
                    width={size.w}
                    height={size.h}
                    style={{ width: size.w * 2, height: size.h * 2 }}
                    className="relative z-10 bg-white image-pixelated shadow-preview"
                    aria-label="Device framebuffer preview"
                />
            </div>
            <p className="flex items-center gap-2 m-0 text-sm text-fg-muted flex-wrap">
                <button
                    type="button"
                    onClick={copyHash}
                    aria-label="Copy framebuffer hash"
                    title="Click to copy hash"
                    className={
                        'font-mono text-xs px-2 py-0.5 rounded bg-surface-2 border border-border cursor-pointer ' +
                        'transition-colors hover:border-primary hover:bg-surface-3 ' +
                        (copied ? '!text-ok !border-ok' : 'text-fg')
                    }
                >
                    {hash}
                </button>
                <span aria-hidden className="w-[3px] h-[3px] rounded-full bg-fg-subtle" />
                <span>{info}</span>
            </p>
        </section>
    );
}
