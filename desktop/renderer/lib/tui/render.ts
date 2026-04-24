/* -------------------------------------------------------------------------
 * TUI → output renderers.
 *
 * rasteriseBufferToCanvas: draws a Buffer onto a 2D canvas as monospace
 * glyphs; cells marked inverse become black blocks with white glyphs.
 * This is what feeds the Quote/0 compose pipeline and the on-screen
 * framebuffer preview.
 *
 * renderBufferToString: produces a plain string dump (one row per line).
 * Useful for debugging / tests.
 * ------------------------------------------------------------------------- */

import type { Buffer } from './cells';

export interface RasteriseOpts {
    /** Cell width in pixels. Must be an integer. */
    cellW: number;
    /** Cell height in pixels. Must be an integer. */
    cellH: number;
    /** Canvas origin (top-left) in pixels. */
    x: number;
    y: number;
    /** Font family — monospace highly recommended. */
    font?: string;
    /** Font size in px. Defaults to cellH. */
    fontSize?: number;
    /** Base ink colour; defaults to black. */
    ink?: string;
    /** Base paper colour; defaults to white. */
    paper?: string;
}

const BOX_CHARS = new Set([
    '┌', '┐', '└', '┘', '─', '│',
    '╭', '╮', '╰', '╯',
    '╔', '╗', '╚', '╝', '═', '║',
    '┏', '┓', '┗', '┛', '━', '┃',
    '█', '▓', '▒', '░',
    '▁', '▂', '▃', '▄', '▅', '▆', '▇',
]);

export function rasteriseBufferToCanvas(
    buf: Buffer,
    ctx: CanvasRenderingContext2D,
    opts: RasteriseOpts,
): void {
    const { cellW, cellH, x: ox, y: oy } = opts;
    const ink = opts.ink ?? '#000';
    const paper = opts.paper ?? '#fff';
    const fontSize = opts.fontSize ?? cellH;
    // Fallback stack: a real mono font on desktop; glyphs that our port
    // uses (box drawing + block elements) are covered by most sans fonts
    // too, so we always fall back to system-ui.
    const fontFamily = opts.font ?? 'Menlo, Consolas, "SF Mono", monospace';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;

    const cells = buf.raw();
    for (let row = 0; row < buf.rows; ++row) {
        for (let col = 0; col < buf.cols; ++col) {
            const cell = cells[row * buf.cols + col];
            const px = ox + col * cellW;
            const py = oy + row * cellH;
            if (cell.inverse) {
                ctx.fillStyle = ink;
                ctx.fillRect(px, py, cellW, cellH);
            }
            const ch = cell.ch;
            if (ch && ch !== ' ') {
                ctx.fillStyle = cell.inverse ? paper : ink;
                // Block/box glyphs render crisper with a slightly larger
                // font that fills the cell. For other glyphs we keep a
                // margin.
                const isBlock = BOX_CHARS.has(ch);
                const fs = isBlock ? cellH : Math.max(6, Math.min(cellH, fontSize));
                ctx.font = `${fs}px ${fontFamily}`;
                ctx.fillText(ch, px + cellW / 2, py + cellH / 2 + 1);
            }
        }
    }
    ctx.restore();
}

export function renderBufferToString(buf: Buffer): string {
    const out: string[] = [];
    const cells = buf.raw();
    for (let r = 0; r < buf.rows; ++r) {
        let line = '';
        for (let c = 0; c < buf.cols; ++c) {
            const cell = cells[r * buf.cols + c];
            line += cell.ch || ' ';
        }
        out.push(line.trimEnd());
    }
    return out.join('\n');
}
