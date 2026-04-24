/* -------------------------------------------------------------------------
 * TUI cell model — a tiny, self-contained port of the ratatui concepts we
 * actually use for the Quote/0 workflow.
 *
 * Why: ratatui (Rust) renders into a Buffer<Cell> where every cell is a
 * single grapheme + style. We don't need colours on a 1-bpp e-paper, so a
 * cell collapses to `{ char, inverse }`. Widgets write into a Buffer; a
 * separate renderer rasterises it either to Canvas (for the panel) or to
 * React DOM (for the on-screen preview / terminal-style desktop UI).
 *
 * This module intentionally stays framework-free: no React, no DOM, no
 * Canvas — so it is trivially testable and shared between both renderers.
 * ------------------------------------------------------------------------- */

export interface Cell {
    /** Single visible character. Empty string is treated as a space. */
    ch: string;
    /**
     * Inverse means the glyph paints *white* on a *black* cell background,
     * which on a 1-bpp e-paper panel is the usual way to do "highlight".
     */
    inverse: boolean;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function makeRect(x: number, y: number, w: number, h: number): Rect {
    return { x: x | 0, y: y | 0, w: Math.max(0, w | 0), h: Math.max(0, h | 0) };
}

/** In-bounds intersection of a rect with the buffer area. */
export function intersect(a: Rect, b: Rect): Rect {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const bot = Math.min(a.y + a.h, b.y + b.h);
    return makeRect(x, y, Math.max(0, r - x), Math.max(0, bot - y));
}

export function innerOf(r: Rect, margin = 1): Rect {
    return makeRect(r.x + margin, r.y + margin, r.w - margin * 2, r.h - margin * 2);
}

/* ------------------------------------------------------------------ */
/* Buffer                                                              */
/* ------------------------------------------------------------------ */

export class Buffer {
    readonly cols: number;
    readonly rows: number;
    private readonly cells: Cell[];

    constructor(cols: number, rows: number) {
        this.cols = Math.max(0, cols | 0);
        this.rows = Math.max(0, rows | 0);
        const n = this.cols * this.rows;
        this.cells = new Array(n);
        for (let i = 0; i < n; ++i) this.cells[i] = { ch: ' ', inverse: false };
    }

    area(): Rect { return makeRect(0, 0, this.cols, this.rows); }

    inBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    get(x: number, y: number): Cell | undefined {
        if (!this.inBounds(x, y)) return undefined;
        return this.cells[y * this.cols + x];
    }

    setChar(x: number, y: number, ch: string, inverse = false): void {
        if (!this.inBounds(x, y)) return;
        const cell = this.cells[y * this.cols + x];
        // Only accept single-BMP characters; multi-codepoint graphemes get
        // trimmed to the first code unit. Good enough for ASCII + box
        // drawing; that's all our widgets actually emit.
        cell.ch = ch.length ? ch[0] : ' ';
        cell.inverse = inverse;
    }

    setString(x: number, y: number, text: string, inverse = false, max = Infinity): number {
        let drawn = 0;
        for (let i = 0; i < text.length && drawn < max && x + i < this.cols; ++i) {
            const c = text[i];
            if (c === '\n') break;
            this.setChar(x + i, y, c, inverse);
            drawn++;
        }
        return drawn;
    }

    fill(rect: Rect, ch: string, inverse = false): void {
        const r = intersect(rect, this.area());
        for (let y = r.y; y < r.y + r.h; ++y) {
            for (let x = r.x; x < r.x + r.w; ++x) {
                this.setChar(x, y, ch, inverse);
            }
        }
    }

    /** Expose the backing array for the renderers (read-only by contract). */
    raw(): readonly Cell[] { return this.cells; }
}

/* ------------------------------------------------------------------ */
/* Widget contract                                                     */
/* ------------------------------------------------------------------ */

export interface Widget {
    render(area: Rect, buf: Buffer): void;
}

/* ------------------------------------------------------------------ */
/* Layout — a tiny subset of ratatui::layout                           */
/* ------------------------------------------------------------------ */

export type Direction = 'horizontal' | 'vertical';

/**
 * Constraints:
 *   - { kind: 'length',     value }  — fixed number of cells.
 *   - { kind: 'percentage', value }  — 0..100 of the total.
 *   - { kind: 'min',        value }  — at least N; flex expands the rest.
 *   - { kind: 'fill',       value }  — weight for leftover space (default 1).
 */
export type Constraint =
    | { kind: 'length'; value: number }
    | { kind: 'percentage'; value: number }
    | { kind: 'min'; value: number }
    | { kind: 'fill'; value: number };

export const Length     = (v: number): Constraint => ({ kind: 'length',     value: v | 0 });
export const Percentage = (v: number): Constraint => ({ kind: 'percentage', value: v });
export const Min        = (v: number): Constraint => ({ kind: 'min',        value: v | 0 });
export const Fill       = (v: number = 1): Constraint => ({ kind: 'fill',   value: Math.max(0, v) });

export function layout(area: Rect, direction: Direction, constraints: Constraint[]): Rect[] {
    const total = direction === 'horizontal' ? area.w : area.h;
    const sizes = new Array<number>(constraints.length).fill(0);

    let consumed = 0;
    let flexWeight = 0;
    const flexIdx: number[] = [];

    for (let i = 0; i < constraints.length; ++i) {
        const c = constraints[i];
        if (c.kind === 'length') {
            sizes[i] = Math.max(0, Math.min(c.value, total - consumed));
            consumed += sizes[i];
        } else if (c.kind === 'percentage') {
            const v = Math.max(0, Math.round((total * c.value) / 100));
            sizes[i] = Math.min(v, total - consumed);
            consumed += sizes[i];
        } else if (c.kind === 'min') {
            sizes[i] = Math.min(c.value, total - consumed);
            consumed += sizes[i];
            flexIdx.push(i);
            flexWeight += 1;
        } else { // fill
            flexIdx.push(i);
            flexWeight += c.value || 0;
        }
    }

    let remaining = Math.max(0, total - consumed);
    if (remaining > 0 && flexWeight > 0) {
        // Distribute remaining cells proportionally to fill/min weights.
        const weights = flexIdx.map((i) => {
            const c = constraints[i];
            return c.kind === 'fill' ? (c.value || 0) : 1;
        });
        const sumW = weights.reduce((s, w) => s + w, 0) || 1;
        let leftover = remaining;
        for (let k = 0; k < flexIdx.length; ++k) {
            const share = k === flexIdx.length - 1
                ? leftover
                : Math.floor((remaining * weights[k]) / sumW);
            sizes[flexIdx[k]] += share;
            leftover -= share;
        }
    }

    // Slice into rects along the direction.
    const out: Rect[] = [];
    let cursor = direction === 'horizontal' ? area.x : area.y;
    for (const s of sizes) {
        if (direction === 'horizontal') {
            out.push(makeRect(cursor, area.y, s, area.h));
        } else {
            out.push(makeRect(area.x, cursor, area.w, s));
        }
        cursor += s;
    }
    return out;
}
