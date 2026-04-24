/* -------------------------------------------------------------------------
 * TUI widget set. These follow the shape and behaviour of the widgets in
 * the ratatui/tui-widgets ecosystem, but rewritten in TypeScript against
 * our own Buffer/Cell model.
 *
 * Covered so far:
 *   - Block   (borders + title)
 *   - Paragraph (wrapped text)
 *   - List
 *   - Tabs
 *   - Gauge
 *   - Sparkline
 *   - BarChart
 *   - BigText (3×5 glyphs — enough for digits/letters at panel scale)
 *   - Calendar (month grid)
 *
 * All widgets render into a `Buffer` through a shared `Widget` contract.
 * ------------------------------------------------------------------------- */

import {
    type Buffer,
    type Constraint,
    type Rect,
    type Widget,
    Length,
    Percentage,
    intersect,
    innerOf,
    layout,
    makeRect,
} from './cells';

/* ------------------------------------------------------------------ */
/* Borders                                                             */
/* ------------------------------------------------------------------ */

export type BorderStyle = 'plain' | 'rounded' | 'double' | 'thick' | 'ascii' | 'none';

interface BorderChars {
    tl: string; tr: string; bl: string; br: string;
    h: string;  v: string;
}

const BORDER_SETS: Record<Exclude<BorderStyle, 'none'>, BorderChars> = {
    plain:   { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
    rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    double:  { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    thick:   { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
    ascii:   { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
};

export interface BlockProps {
    title?: string;
    titleAlign?: 'left' | 'center' | 'right';
    border?: BorderStyle;
    /** Inverts the title text. */
    titleInverse?: boolean;
}

/**
 * Block draws the surrounding frame + optional title and returns the inner
 * rect where children should draw. With `border: 'none'` it still reserves
 * a 1-cell title row if a title is set.
 */
export class Block implements Widget {
    constructor(public readonly props: BlockProps = {}) {}

    /** Convenience — same as render() but also returns the inner area. */
    renderWithInner(area: Rect, buf: Buffer): Rect {
        this.render(area, buf);
        return this.inner(area);
    }

    inner(area: Rect): Rect {
        const border = this.props.border ?? 'plain';
        if (border === 'none') {
            if (this.props.title) {
                return makeRect(area.x, area.y + 1, area.w, Math.max(0, area.h - 1));
            }
            return area;
        }
        return innerOf(area, 1);
    }

    render(area: Rect, buf: Buffer): void {
        if (area.w <= 0 || area.h <= 0) return;
        const border = this.props.border ?? 'plain';
        if (border !== 'none' && area.w >= 2 && area.h >= 2) {
            const set = BORDER_SETS[border];
            const { x, y, w, h } = area;
            for (let i = 1; i < w - 1; ++i) {
                buf.setChar(x + i, y, set.h);
                buf.setChar(x + i, y + h - 1, set.h);
            }
            for (let j = 1; j < h - 1; ++j) {
                buf.setChar(x, y + j, set.v);
                buf.setChar(x + w - 1, y + j, set.v);
            }
            buf.setChar(x, y, set.tl);
            buf.setChar(x + w - 1, y, set.tr);
            buf.setChar(x, y + h - 1, set.bl);
            buf.setChar(x + w - 1, y + h - 1, set.br);
        }

        const title = this.props.title;
        if (title) {
            const inv = !!this.props.titleInverse;
            const align = this.props.titleAlign ?? 'left';
            // Write in the top border, padded with a space on each side.
            const padded = ` ${title} `;
            const maxW = border === 'none' ? area.w : Math.max(0, area.w - 2);
            const text = padded.slice(0, maxW);
            const innerX = border === 'none' ? area.x : area.x + 1;
            const ty = area.y;
            let tx: number;
            if (align === 'center') tx = innerX + Math.max(0, Math.floor((maxW - text.length) / 2));
            else if (align === 'right') tx = innerX + Math.max(0, maxW - text.length);
            else tx = innerX;
            buf.setString(tx, ty, text, inv);
        }
    }
}

/* ------------------------------------------------------------------ */
/* Paragraph (wrapped text)                                            */
/* ------------------------------------------------------------------ */

export interface ParagraphProps {
    text: string;
    block?: Block;
    align?: 'left' | 'center' | 'right';
    wrap?: boolean;
}

export class Paragraph implements Widget {
    constructor(public readonly props: ParagraphProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const lines: string[] = [];
        const paragraphs = (this.props.text ?? '').split(/\r?\n/);
        const wrap = this.props.wrap !== false;
        for (const p of paragraphs) {
            if (!wrap) {
                lines.push(p.slice(0, inner.w));
                continue;
            }
            lines.push(...wrapText(p, inner.w));
            if (lines.length >= inner.h) break;
        }

        const align = this.props.align ?? 'left';
        for (let i = 0; i < lines.length && i < inner.h; ++i) {
            const line = lines[i];
            let x = inner.x;
            if (align === 'center') x = inner.x + Math.max(0, Math.floor((inner.w - line.length) / 2));
            else if (align === 'right') x = inner.x + Math.max(0, inner.w - line.length);
            buf.setString(x, inner.y + i, line);
        }
    }
}

function wrapText(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0) return [];
    const words = text.split(/(\s+)/);
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
        if (!w) continue;
        if ((cur + w).length <= maxWidth) {
            cur += w;
        } else if (w.trim().length === 0) {
            out.push(cur);
            cur = '';
        } else if (cur.length === 0) {
            // word longer than line — hard split.
            let rest = w;
            while (rest.length > maxWidth) {
                out.push(rest.slice(0, maxWidth));
                rest = rest.slice(maxWidth);
            }
            cur = rest;
        } else {
            out.push(cur.trimEnd());
            cur = w.trimStart();
        }
    }
    if (cur.length || out.length === 0) out.push(cur.trimEnd());
    return out;
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export interface ListProps {
    items: string[];
    block?: Block;
    selected?: number;
    highlightSymbol?: string;
}

export class List implements Widget {
    constructor(public readonly props: ListProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const sel = this.props.selected ?? -1;
        const symbol = this.props.highlightSymbol ?? '> ';
        for (let i = 0; i < this.props.items.length && i < inner.h; ++i) {
            const inverse = i === sel;
            const prefix = i === sel ? symbol : ' '.repeat(symbol.length);
            const line = prefix + this.props.items[i];
            buf.fill(makeRect(inner.x, inner.y + i, inner.w, 1), ' ', inverse);
            buf.setString(inner.x, inner.y + i, line.slice(0, inner.w), inverse);
        }
    }
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabsProps {
    titles: string[];
    selected: number;
    block?: Block;
    divider?: string;
}

export class Tabs implements Widget {
    constructor(public readonly props: TabsProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const divider = this.props.divider ?? ' │ ';
        let x = inner.x;
        for (let i = 0; i < this.props.titles.length; ++i) {
            if (x >= inner.x + inner.w) break;
            const t = this.props.titles[i];
            const padded = ` ${t} `;
            const inv = i === this.props.selected;
            const remaining = inner.x + inner.w - x;
            const take = Math.min(padded.length, remaining);
            buf.setString(x, inner.y, padded.slice(0, take), inv);
            x += take;
            if (i < this.props.titles.length - 1 && x < inner.x + inner.w) {
                const d = divider.slice(0, inner.x + inner.w - x);
                buf.setString(x, inner.y, d, false);
                x += d.length;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Gauge                                                               */
/* ------------------------------------------------------------------ */

export interface GaugeProps {
    /** 0..1 */
    ratio: number;
    label?: string;
    block?: Block;
    /** 'block' (▓) or 'ascii' (#). Defaults to 'block'. */
    fillStyle?: 'block' | 'ascii';
}

export class Gauge implements Widget {
    constructor(public readonly props: GaugeProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const ratio = Math.max(0, Math.min(1, this.props.ratio || 0));
        const full = this.props.fillStyle === 'ascii' ? '#' : '█';
        const empty = '·';
        const filledCols = Math.round(inner.w * ratio);

        for (let j = 0; j < inner.h; ++j) {
            for (let i = 0; i < inner.w; ++i) {
                const ch = i < filledCols ? full : empty;
                buf.setChar(inner.x + i, inner.y + j, ch);
            }
        }

        const label = this.props.label ?? `${Math.round(ratio * 100)}%`;
        if (label && inner.h > 0) {
            const ly = inner.y + Math.floor((inner.h - 1) / 2);
            const lx = inner.x + Math.max(0, Math.floor((inner.w - label.length) / 2));
            for (let i = 0; i < label.length && lx + i < inner.x + inner.w; ++i) {
                const absX = lx + i;
                const isFilled = (absX - inner.x) < filledCols;
                buf.setChar(absX, ly, label[i], isFilled);
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export interface SparklineProps {
    data: number[];
    block?: Block;
    /** Optional fixed max; otherwise auto-scaled. */
    max?: number;
}

const SPARK_LEVELS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export class Sparkline implements Widget {
    constructor(public readonly props: SparklineProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const data = this.props.data ?? [];
        if (data.length === 0) return;
        const sliced = data.slice(-inner.w);
        const max = this.props.max ?? Math.max(1, ...sliced);

        // For h > 1, we treat the bottom row as the sparkline band; rows
        // above stay blank. This matches ratatui's single-row sparkline.
        const row = inner.y + inner.h - 1;
        for (let i = 0; i < sliced.length; ++i) {
            const v = Math.max(0, sliced[i]) / (max || 1);
            const idx = Math.min(SPARK_LEVELS.length - 1, Math.round(v * (SPARK_LEVELS.length - 1)));
            buf.setChar(inner.x + i, row, SPARK_LEVELS[idx]);
        }
    }
}

/* ------------------------------------------------------------------ */
/* BarChart                                                            */
/* ------------------------------------------------------------------ */

export interface BarChartProps {
    bars: Array<{ label: string; value: number }>;
    block?: Block;
    max?: number;
    barWidth?: number;
    barGap?: number;
}

export class BarChart implements Widget {
    constructor(public readonly props: BarChartProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 2) return;

        const barWidth = Math.max(1, this.props.barWidth ?? 3);
        const gap = Math.max(0, this.props.barGap ?? 1);
        const bars = this.props.bars ?? [];
        const max = this.props.max ?? Math.max(1, ...bars.map((b) => b.value));

        const bodyH = inner.h - 1;           // last row: labels
        const labelRow = inner.y + inner.h - 1;
        let cx = inner.x;
        for (const b of bars) {
            if (cx >= inner.x + inner.w) break;
            const v = Math.max(0, b.value) / (max || 1);
            const colH = Math.round(bodyH * v);
            const top = inner.y + (bodyH - colH);
            for (let j = 0; j < colH; ++j) {
                for (let i = 0; i < barWidth && cx + i < inner.x + inner.w; ++i) {
                    buf.setChar(cx + i, top + j, '█');
                }
            }
            // Label under the bar, truncated to barWidth + gap.
            const labelSlot = Math.min(barWidth + gap, inner.x + inner.w - cx);
            buf.setString(cx, labelRow, (b.label ?? '').slice(0, labelSlot));
            cx += barWidth + gap;
        }
    }
}

/* ------------------------------------------------------------------ */
/* BigText — 3×5 glyph font, enough for HUD-style numbers + short text  */
/* ------------------------------------------------------------------ */

// Each glyph is 5 rows × 3 cols. Missing chars fall back to spaces.
// Characters chosen to cover HUD-y needs (digits, time, short labels).
const BIG_GLYPHS: Record<string, string[]> = {
    '0': ['███', '█ █', '█ █', '█ █', '███'],
    '1': [' █ ', '██ ', ' █ ', ' █ ', '███'],
    '2': ['███', '  █', '███', '█  ', '███'],
    '3': ['███', '  █', '███', '  █', '███'],
    '4': ['█ █', '█ █', '███', '  █', '  █'],
    '5': ['███', '█  ', '███', '  █', '███'],
    '6': ['███', '█  ', '███', '█ █', '███'],
    '7': ['███', '  █', '  █', '  █', '  █'],
    '8': ['███', '█ █', '███', '█ █', '███'],
    '9': ['███', '█ █', '███', '  █', '███'],
    ':': ['   ', ' █ ', '   ', ' █ ', '   '],
    '.': ['   ', '   ', '   ', '   ', ' █ '],
    '-': ['   ', '   ', '███', '   ', '   '],
    '/': ['  █', '  █', ' █ ', '█  ', '█  '],
    '%': ['█ █', '  █', ' █ ', '█  ', '█ █'],
    ' ': ['   ', '   ', '   ', '   ', '   '],
    'A': [' █ ', '█ █', '███', '█ █', '█ █'],
    'B': ['██ ', '█ █', '██ ', '█ █', '██ '],
    'C': [' ██', '█  ', '█  ', '█  ', ' ██'],
    'D': ['██ ', '█ █', '█ █', '█ █', '██ '],
    'E': ['███', '█  ', '██ ', '█  ', '███'],
    'F': ['███', '█  ', '██ ', '█  ', '█  '],
    'G': [' ██', '█  ', '█ █', '█ █', ' ██'],
    'H': ['█ █', '█ █', '███', '█ █', '█ █'],
    'I': ['███', ' █ ', ' █ ', ' █ ', '███'],
    'J': ['███', '  █', '  █', '█ █', ' █ '],
    'K': ['█ █', '██ ', '█  ', '██ ', '█ █'],
    'L': ['█  ', '█  ', '█  ', '█  ', '███'],
    'M': ['█ █', '███', '█ █', '█ █', '█ █'],
    'N': ['█ █', '██ █'.slice(0, 3), '███', '█ █', '█ █'],
    'O': [' █ ', '█ █', '█ █', '█ █', ' █ '],
    'P': ['██ ', '█ █', '██ ', '█  ', '█  '],
    'Q': [' █ ', '█ █', '█ █', '██ ', ' ██'],
    'R': ['██ ', '█ █', '██ ', '█ █', '█ █'],
    'S': [' ██', '█  ', ' █ ', '  █', '██ '],
    'T': ['███', ' █ ', ' █ ', ' █ ', ' █ '],
    'U': ['█ █', '█ █', '█ █', '█ █', '███'],
    'V': ['█ █', '█ █', '█ █', '█ █', ' █ '],
    'W': ['█ █', '█ █', '█ █', '███', '█ █'],
    'X': ['█ █', '█ █', ' █ ', '█ █', '█ █'],
    'Y': ['█ █', '█ █', ' █ ', ' █ ', ' █ '],
    'Z': ['███', '  █', ' █ ', '█  ', '███'],
};

export interface BigTextProps {
    text: string;
    block?: Block;
    align?: 'left' | 'center' | 'right';
    /** Horizontal spacing between glyphs (cells). Default 1. */
    glyphSpacing?: number;
}

export class BigText implements Widget {
    constructor(public readonly props: BigTextProps) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const spacing = this.props.glyphSpacing ?? 1;
        const gw = 3 + spacing;
        const text = (this.props.text ?? '').toUpperCase();
        const totalW = Math.max(0, text.length * gw - spacing);
        let x0: number;
        const align = this.props.align ?? 'left';
        if (align === 'center') x0 = inner.x + Math.max(0, Math.floor((inner.w - totalW) / 2));
        else if (align === 'right') x0 = inner.x + Math.max(0, inner.w - totalW);
        else x0 = inner.x;

        const y0 = inner.y + Math.max(0, Math.floor((inner.h - 5) / 2));

        let cx = x0;
        for (const ch of text) {
            const glyph = BIG_GLYPHS[ch] ?? BIG_GLYPHS[' '];
            for (let row = 0; row < 5; ++row) {
                const line = glyph[row] ?? '   ';
                for (let col = 0; col < 3; ++col) {
                    if (line[col] === '█') buf.setChar(cx + col, y0 + row, '█');
                }
            }
            cx += gw;
        }
    }
}

/* ------------------------------------------------------------------ */
/* Calendar (month view)                                               */
/* ------------------------------------------------------------------ */

export interface CalendarProps {
    /** ISO month string `YYYY-MM`. Defaults to today. */
    month?: string;
    /** ISO date string to highlight. */
    highlight?: string;
    block?: Block;
    /** Week starts on Monday (default true to match ratatui-calendar). */
    startMonday?: boolean;
}

export class Calendar implements Widget {
    constructor(public readonly props: CalendarProps = {}) {}

    render(area: Rect, buf: Buffer): void {
        const inner = this.props.block
            ? this.props.block.renderWithInner(area, buf)
            : area;
        if (inner.w <= 0 || inner.h <= 0) return;

        const now = new Date();
        const monthStr = this.props.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [ys, ms] = monthStr.split('-');
        const year = parseInt(ys, 10);
        const month = parseInt(ms, 10) - 1;
        if (!Number.isFinite(year) || !Number.isFinite(month)) return;

        const first = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startMonday = this.props.startMonday !== false;
        // JS getDay: 0 = Sun, 6 = Sat. Adjust to Mon-first if requested.
        const firstCol = startMonday
            ? (first.getDay() + 6) % 7
            : first.getDay();

        const headers = startMonday
            ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
            : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

        // Layout: header line + up to 6 week rows. Each day takes 3 cells.
        const cellW = 3;
        const totalW = cellW * 7;
        const x0 = inner.x + Math.max(0, Math.floor((inner.w - totalW) / 2));

        // Title (month name)
        const monthName = first.toLocaleString('en-US', { month: 'long' });
        const title = `${monthName} ${year}`;
        if (inner.h >= 1) {
            const tx = inner.x + Math.max(0, Math.floor((inner.w - title.length) / 2));
            buf.setString(tx, inner.y, title.slice(0, inner.w));
        }

        // Headers
        if (inner.h >= 2) {
            for (let i = 0; i < 7; ++i) {
                buf.setString(x0 + i * cellW, inner.y + 1, headers[i]);
            }
        }

        // Highlight target
        let hiDay = -1;
        if (this.props.highlight) {
            const [hy, hm, hd] = this.props.highlight.split('-').map((s) => parseInt(s, 10));
            if (hy === year && hm - 1 === month && Number.isFinite(hd)) hiDay = hd;
        }

        // Day grid (starting at row 2)
        let day = 1;
        for (let week = 0; week < 6 && day <= daysInMonth; ++week) {
            const rowY = inner.y + 2 + week;
            if (rowY >= inner.y + inner.h) break;
            for (let col = 0; col < 7 && day <= daysInMonth; ++col) {
                if (week === 0 && col < firstCol) continue;
                const s = String(day).padStart(2, ' ');
                const inv = day === hiDay;
                // 2 chars of number + 1 trailing space; invert all 3 on highlight.
                buf.setString(x0 + col * cellW, rowY, s + ' ', inv);
                day++;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Re-exports for convenience                                          */
/* ------------------------------------------------------------------ */

export { Length, Percentage, layout };
export type { Constraint, Rect };
