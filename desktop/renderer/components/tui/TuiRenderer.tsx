'use client';

/* -------------------------------------------------------------------------
 * React renderer for a TUI Buffer.
 *
 * Runs the same widget code as the canvas rasteriser, but emits DOM <span>s
 * with `font-mono`. Used for the on-screen "terminal" preview panel.
 * ------------------------------------------------------------------------- */

import { useMemo } from 'react';

import { Buffer } from '@/lib/tui';
import { renderScene, type TuiScene } from '@/lib/tui/scene';

export interface TuiRendererProps {
    scene: TuiScene;
    /** CSS font-size for the cells. */
    fontSize?: number;
    /** Cell width scale — 1.0 renders at natural monospace ratio. */
    letterSpacing?: number;
    /** Text colour (ink). */
    ink?: string;
    /** Background (paper). */
    paper?: string;
    className?: string;
}

export function TuiRenderer({
    scene,
    fontSize = 12,
    letterSpacing = 0,
    ink = '#e8ecf2',
    paper = 'transparent',
    className = '',
}: TuiRendererProps) {
    const rows = useMemo(() => {
        const buf = new Buffer(scene.cols, scene.rows);
        renderScene(scene.root, buf.area(), buf);
        const cells = buf.raw();
        const out: Array<Array<{ ch: string; inverse: boolean }>> = [];
        for (let r = 0; r < scene.rows; ++r) {
            const row: Array<{ ch: string; inverse: boolean }> = [];
            for (let c = 0; c < scene.cols; ++c) {
                row.push(cells[r * scene.cols + c]);
            }
            out.push(row);
        }
        return out;
    }, [scene]);

    return (
        <pre
            className={`font-mono m-0 leading-none select-none ${className}`}
            style={{
                fontSize,
                letterSpacing,
                color: ink,
                background: paper,
                padding: 0,
                whiteSpace: 'pre',
            }}
            aria-hidden
        >
            {rows.map((row, i) => (
                <div key={i} style={{ height: `${fontSize + 2}px`, lineHeight: `${fontSize + 2}px` }}>
                    {compressRow(row).map((seg, j) => (
                        <span
                            key={j}
                            style={
                                seg.inverse
                                    ? { background: ink, color: paper === 'transparent' ? '#0f1115' : paper }
                                    : undefined
                            }
                        >
                            {seg.text || ' '}
                        </span>
                    ))}
                </div>
            ))}
        </pre>
    );
}

/** Collapse adjacent cells with the same `inverse` flag into one <span>. */
function compressRow(row: Array<{ ch: string; inverse: boolean }>): Array<{ text: string; inverse: boolean }> {
    const out: Array<{ text: string; inverse: boolean }> = [];
    let cur: { text: string; inverse: boolean } | null = null;
    for (const cell of row) {
        const ch = cell.ch || ' ';
        if (!cur || cur.inverse !== cell.inverse) {
            if (cur) out.push(cur);
            cur = { text: ch, inverse: cell.inverse };
        } else {
            cur.text += ch;
        }
    }
    if (cur) out.push(cur);
    return out;
}
