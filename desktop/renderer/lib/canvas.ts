/* -------------------------------------------------------------------------
 * Quote/0 canvas rendering + 1BPP framebuffer packing.
 *
 * The device expects a raw 152×296 1-bit buffer, MSB-first, 1 = white.
 * The renderer may be asked to draw at a different *logical* size (e.g.
 * landscape-right = 296×152) and then rotated to the controller's native
 * 152×296 portrait.
 * ------------------------------------------------------------------------- */

'use client';

import type { ComposeSpec, Fit, Layout, NormalizedRect } from './types';
import { Buffer as TuiBuffer, rasteriseBufferToCanvas } from './tui';
import { renderScene, type TuiScene } from './tui/scene';

export const NATIVE_WIDTH = 152;
export const NATIVE_HEIGHT = 296;
export const FRAME_BYTES = (NATIVE_WIDTH * NATIVE_HEIGHT) / 8;

export interface LogicalSize { w: number; h: number }

/** Logical canvas size for a given layout. */
export function logicalSize(layout: Layout): LogicalSize {
    if (layout === 'landscape-left' || layout === 'landscape-right') {
        return { w: NATIVE_HEIGHT, h: NATIVE_WIDTH };   // 296 × 152
    }
    return { w: NATIVE_WIDTH, h: NATIVE_HEIGHT };       // 152 × 296
}

/** Prepare a Canvas 2D context at logical size, filled white. */
function createCanvas(layout: Layout) {
    const { w, h } = logicalSize(layout);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

function floydSteinberg(imageData: ImageData): void {
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; ++i) {
        const p = i * 4;
        gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const i = y * width + x;
            const old = gray[i];
            const nw = old < 128 ? 0 : 255;
            gray[i] = nw;
            const err = old - nw;
            if (x + 1 < width)                    gray[i + 1]         += (err * 7) / 16;
            if (x - 1 >= 0 && y + 1 < height)     gray[i + width - 1] += (err * 3) / 16;
            if (y + 1 < height)                   gray[i + width]     += (err * 5) / 16;
            if (x + 1 < width && y + 1 < height)  gray[i + width + 1] += (err * 1) / 16;
        }
    }
    for (let i = 0; i < gray.length; ++i) {
        const p = i * 4;
        const v = gray[i] < 128 ? 0 : 255;
        data[p] = data[p + 1] = data[p + 2] = v;
    }
}

function applyThreshold(imageData: ImageData, threshold: number): void {
    const { data } = imageData;
    for (let p = 0; p < data.length; p += 4) {
        const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        const v = gray >= threshold ? 255 : 0;
        data[p] = data[p + 1] = data[p + 2] = v;
    }
}

function clampNormalizedRect(crop?: NormalizedRect | null): NormalizedRect | null {
    if (!crop) return null;
    const x = Math.max(0, Math.min(1, crop.x));
    const y = Math.max(0, Math.min(1, crop.y));
    const w = Math.max(0, Math.min(1 - x, crop.w));
    const h = Math.max(0, Math.min(1 - y, crop.h));
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
}

function drawRasterSourceFit(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    targetW: number,
    targetH: number,
    fit: Fit,
    crop?: NormalizedRect | null,
): void {
    if (sourceW <= 0 || sourceH <= 0) return;

    const clipped = clampNormalizedRect(crop);
    const sx = clipped ? clipped.x * sourceW : 0;
    const sy = clipped ? clipped.y * sourceH : 0;
    const sw = clipped ? clipped.w * sourceW : sourceW;
    const sh = clipped ? clipped.h * sourceH : sourceH;
    if (sw <= 0 || sh <= 0) return;

    if (fit === 'stretch') {
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);
        return;
    }
    const scale = fit === 'cover'
        ? Math.max(targetW / sw, targetH / sh)
        : Math.min(targetW / sw, targetH / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawImageFit(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    targetW: number,
    targetH: number,
    fit: Fit,
): void {
    drawRasterSourceFit(ctx, img, img.naturalWidth, img.naturalHeight, targetW, targetH, fit);
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

/* ------------------------------------------------------------------ */
/* High-level render functions                                         */
/* ------------------------------------------------------------------ */

export interface RenderImageOpts {
    img: HTMLImageElement;
    layout: Layout;
    fit: Fit;
    threshold: number;
    dither: boolean;
}

export function renderImage(opts: RenderImageOpts): HTMLCanvasElement {
    const { canvas, ctx, width, height } = createCanvas(opts.layout);
    drawImageFit(ctx, opts.img, width, height, opts.fit);
    const imgData = ctx.getImageData(0, 0, width, height);
    if (opts.dither) floydSteinberg(imgData);
    else applyThreshold(imgData, opts.threshold);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

export interface RenderScreenCaptureOpts {
    video: HTMLVideoElement;
    layout: Layout;
    fit: Fit;
    threshold: number;
    dither: boolean;
    crop?: NormalizedRect | null;
}

export function renderScreenCapture(opts: RenderScreenCaptureOpts): HTMLCanvasElement {
    const { video, layout, fit, threshold, dither, crop } = opts;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        throw new Error('screen stream is not ready yet');
    }
    const { canvas, ctx, width, height } = createCanvas(layout);
    drawRasterSourceFit(ctx, video, video.videoWidth, video.videoHeight, width, height, fit, crop);
    const imgData = ctx.getImageData(0, 0, width, height);
    if (dither) floydSteinberg(imgData);
    else applyThreshold(imgData, threshold);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

export interface RenderTextOpts {
    title: string;
    body: string;
    footer: string;
    layout: Layout;
    titleSize: number;
    bodySize: number;
    border: boolean;
}

export function renderText(opts: RenderTextOpts): HTMLCanvasElement {
    const { title, body, footer, layout, titleSize, bodySize, border } = opts;
    const { canvas, ctx, width, height } = createCanvas(layout);

    ctx.fillStyle = '#000';
    const margin = 10;
    if (border) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.strokeRect(1, 1, width - 2, height - 2);
    }

    let y = margin + titleSize - 4;
    if (title) {
        ctx.font = `600 ${titleSize}px -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = 'alphabetic';
        const titleLines = wrapText(ctx, title, width - margin * 2).slice(0, 2);
        for (const line of titleLines) {
            ctx.fillText(line, margin, y);
            y += titleSize + 4;
        }
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(width - margin, y);
        ctx.lineWidth = 1;
        ctx.stroke();
        y += 8;
    }

    const footerReserve = footer ? 22 : 0;
    const bodyMaxY = height - margin - footerReserve;
    if (body) {
        ctx.font = `${bodySize}px -apple-system, "Segoe UI", sans-serif`;
        for (const paragraph of body.split(/\r?\n/)) {
            const lines = wrapText(ctx, paragraph, width - margin * 2);
            for (const line of lines) {
                if (y + bodySize > bodyMaxY) {
                    ctx.fillText('…', margin, bodyMaxY);
                    y = bodyMaxY + 1;
                    break;
                }
                ctx.fillText(line, margin, y + bodySize - 3);
                y += bodySize + 3;
            }
            if (y > bodyMaxY) break;
        }
    }

    if (footer) {
        ctx.font = `11px -apple-system, "Segoe UI", sans-serif`;
        const fy = height - margin - 4;
        ctx.beginPath();
        ctx.moveTo(margin, fy - 14);
        ctx.lineTo(width - margin, fy - 14);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(footer, margin, fy);
    }

    return canvas;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/(\s+)/);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
        if (!w && current === '') continue;
        const candidate = current + w;
        if (ctx.measureText(candidate).width > maxWidth && current.trim()) {
            lines.push(current.trimEnd());
            current = w.trimStart();
        } else {
            current = candidate;
        }
    }
    if (current.trim() || lines.length === 0) lines.push(current.trimEnd());
    return lines;
}

/* ------------------------------------------------------------------ */
/* Compose                                                             */
/* ------------------------------------------------------------------ */

export interface RenderComposeOpts {
    spec: ComposeSpec;
    layout: Layout;
}

export function renderCompose({ spec, layout }: RenderComposeOpts): HTMLCanvasElement {
    const { canvas, ctx, width, height } = createCanvas(layout);

    const bg = spec.background;
    if (bg === 'black') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }
    if (spec.border) {
        const b = typeof spec.border === 'object' ? (spec.border as Record<string, number>) : {};
        const inset = (b.inset as number) || 0;
        const bw = (b.width as number) || 1;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = bw;
        ctx.strokeRect(inset + bw / 2, inset + bw / 2,
                       width - 2 * inset - bw, height - 2 * inset - bw);
    }

    for (const el of spec.elements) {
        const t = String(el.type || '').toLowerCase();
        if (t === 'text') drawComposeText(ctx, el, width, height);
        else if (t === 'rect') drawComposeRect(ctx, el);
        else if (t === 'line') drawComposeLine(ctx, el);
        else if (t === 'image') drawComposeImage(ctx, el);
        else if (t === 'tui') drawComposeTui(ctx, el);
    }

    return canvas;
}

function parseColor(value: unknown, defaultBlack = true): string {
    if (value == null) return defaultBlack ? '#000' : '#fff';
    if (value === 0 || value === 'black' || value === 'dark' ||
        value === '#000' || value === '#000000') return '#000';
    if (value === 255 || value === 'white' || value === 'light' ||
        value === '#fff' || value === '#ffffff') return '#fff';
    if (typeof value === 'number') return value >= 128 ? '#fff' : '#000';
    return defaultBlack ? '#000' : '#fff';
}

interface Box { x: number; y: number; w: number; h: number }

function resolveBox(el: Record<string, unknown>, canvasW: number, canvasH: number): Box {
    if (Array.isArray(el.rect) && el.rect.length === 4) {
        return {
            x: (el.rect[0] as number) | 0,
            y: (el.rect[1] as number) | 0,
            w: (el.rect[2] as number) | 0,
            h: (el.rect[3] as number) | 0,
        };
    }
    const x = ((el.x as number) || 0) | 0;
    const y = ((el.y as number) || 0) | 0;
    const w = ((el.w as number) || (el.width as number) || canvasW - x) | 0;
    const h = ((el.h as number) || (el.height as number) || canvasH - y) | 0;
    return { x, y, w, h };
}

interface Padding { top: number; right: number; bottom: number; left: number }

function parsePadding(value: unknown): Padding {
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    if (value == null) return zero;
    if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
    if (Array.isArray(value)) {
        if (value.length === 2) return { top: value[0] | 0, right: value[1] | 0, bottom: value[0] | 0, left: value[1] | 0 };
        if (value.length === 4) return { top: value[0] | 0, right: value[1] | 0, bottom: value[2] | 0, left: value[3] | 0 };
    }
    return zero;
}

function drawComposeText(
    ctx: CanvasRenderingContext2D,
    el: Record<string, unknown>,
    canvasW: number,
    canvasH: number,
): void {
    const box = resolveBox(el, canvasW, canvasH);
    const pad = parsePadding(el.padding);
    const ix = box.x + pad.left;
    const iy = box.y + pad.top;
    const iw = Math.max(1, box.w - pad.left - pad.right);
    const ih = Math.max(1, box.h - pad.top - pad.bottom);

    const fontSize = (el.font_size as number) || 16;
    const fill = parseColor(el.fill, true);
    const align = String(el.align || 'left').toLowerCase();
    const valign = String(el.valign || 'top').toLowerCase();
    const lineSpacing = el.line_spacing != null ? (el.line_spacing as number) : 4;

    ctx.fillStyle = fill;
    ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'alphabetic';

    const text = String(el.text || '');
    const paragraphs = text.split(/\r?\n/);
    const lines: string[] = [];
    for (const p of paragraphs) lines.push(...wrapText(ctx, p, iw));

    const stride = fontSize + lineSpacing;
    const blockHeight = lines.length * fontSize + (lines.length - 1) * lineSpacing;
    let y0 = iy;
    if (valign === 'middle' || valign === 'center') {
        y0 = iy + Math.max(0, (ih - blockHeight) / 2);
    } else if (valign === 'bottom') {
        y0 = iy + Math.max(0, ih - blockHeight);
    }
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        let x = ix;
        if (align === 'center') x = ix + Math.max(0, (iw - w) / 2);
        else if (align === 'right') x = ix + Math.max(0, iw - w);
        ctx.fillText(line, x, y0 + fontSize - 3);
        y0 += stride;
    }
}

function drawComposeRect(ctx: CanvasRenderingContext2D, el: Record<string, unknown>): void {
    const box = resolveBox(el, ctx.canvas.width, ctx.canvas.height);
    const lineWidth = (el.width as number) || 1;
    if (el.fill) {
        ctx.fillStyle = parseColor(el.fill);
        ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    if (el.outline) {
        ctx.strokeStyle = parseColor(el.outline);
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(box.x + lineWidth / 2, box.y + lineWidth / 2,
                       box.w - lineWidth, box.h - lineWidth);
    }
}

function drawComposeLine(ctx: CanvasRenderingContext2D, el: Record<string, unknown>): void {
    const fill = parseColor(el.fill, true);
    const lw = (el.width as number) || 1;
    ctx.strokeStyle = fill;
    ctx.lineWidth = lw;
    ctx.beginPath();
    const pts = el.points as Array<[number, number]> | undefined;
    if (Array.isArray(pts) && pts.length >= 2) {
        const [sx, sy] = pts[0];
        ctx.moveTo(sx | 0, sy | 0);
        for (let i = 1; i < pts.length; ++i) {
            const [x, y] = pts[i];
            ctx.lineTo(x | 0, y | 0);
        }
    } else {
        ctx.moveTo(((el.x1 as number) || 0) | 0, ((el.y1 as number) || 0) | 0);
        ctx.lineTo(((el.x2 as number) || 0) | 0, ((el.y2 as number) || 0) | 0);
    }
    ctx.stroke();
}

function drawComposeImage(ctx: CanvasRenderingContext2D, el: Record<string, unknown>): void {
    const box = resolveBox(el, ctx.canvas.width, ctx.canvas.height);
    const imageEl = el.imageEl as HTMLImageElement | undefined;
    if (!imageEl) return;
    const fit = String(el.fit || 'contain').toLowerCase() as Fit;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.translate(box.x, box.y);
    drawImageFit(ctx, imageEl, box.w, box.h, fit);
    ctx.restore();

    const imgData = ctx.getImageData(box.x, box.y, box.w, box.h);
    if (el.dither) floydSteinberg(imgData);
    else applyThreshold(imgData, el.threshold != null ? (el.threshold as number) : 160);
    ctx.putImageData(imgData, box.x, box.y);
}

/**
 * Rasterise a ratatui-style scene into the compose canvas.
 *
 * The scene's logical cell grid (`cols × rows`) is drawn at `cellW × cellH`
 * pixels each, then clipped to the element's bounding box. Inverse cells
 * paint a black block with white glyphs — exactly what the 1-bpp panel
 * needs for "highlighted" content after thresholding.
 */
function drawComposeTui(ctx: CanvasRenderingContext2D, el: Record<string, unknown>): void {
    const box = resolveBox(el, ctx.canvas.width, ctx.canvas.height);
    const scene = el.scene as TuiScene | undefined;
    if (!scene || !scene.root) return;

    const cellW = Math.max(1, (el.cellW as number) || 6);
    const cellH = Math.max(1, (el.cellH as number) || 8);
    const cols = Math.max(1, (scene.cols as number) || Math.floor(box.w / cellW));
    const rows = Math.max(1, (scene.rows as number) || Math.floor(box.h / cellH));

    const buf = new TuiBuffer(cols, rows);
    renderScene(scene.root, buf.area(), buf);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    // Paper fill (white) — safe on both white and black document bgs
    // because subsequent threshold collapses to 1-bit anyway.
    ctx.fillStyle = '#fff';
    ctx.fillRect(box.x, box.y, cols * cellW, rows * cellH);
    rasteriseBufferToCanvas(buf, ctx, {
        x: box.x, y: box.y,
        cellW, cellH,
        ink: '#000', paper: '#fff',
    });
    ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Rotation + framebuffer packing                                      */
/* ------------------------------------------------------------------ */

export function rotateToNative(sourceCanvas: HTMLCanvasElement, layout: Layout): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = NATIVE_WIDTH;
    out.height = NATIVE_HEIGHT;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

    if (layout === 'native') {
        ctx.drawImage(sourceCanvas, 0, 0);
    } else if (layout === 'native-180') {
        ctx.translate(NATIVE_WIDTH, NATIVE_HEIGHT);
        ctx.rotate(Math.PI);
        ctx.drawImage(sourceCanvas, 0, 0);
    } else if (layout === 'landscape-right') {
        ctx.translate(NATIVE_WIDTH, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(sourceCanvas, 0, 0);
    } else if (layout === 'landscape-left') {
        ctx.translate(0, NATIVE_HEIGHT);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(sourceCanvas, 0, 0);
    } else {
        ctx.drawImage(sourceCanvas, 0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    }
    return out;
}

export interface PackOpts { invert?: boolean }

export function packNativeToFramebuffer(
    nativeCanvas: HTMLCanvasElement,
    { invert = false }: PackOpts = {},
): Uint8Array {
    if (nativeCanvas.width !== NATIVE_WIDTH || nativeCanvas.height !== NATIVE_HEIGHT) {
        throw new Error(`expected ${NATIVE_WIDTH}x${NATIVE_HEIGHT} canvas`);
    }
    const ctx = nativeCanvas.getContext('2d', { willReadFrequently: true })!;
    const { data } = ctx.getImageData(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    const out = new Uint8Array(FRAME_BYTES);

    let bit = 0;
    for (let y = 0; y < NATIVE_HEIGHT; ++y) {
        for (let x = 0; x < NATIVE_WIDTH; ++x) {
            const p = (y * NATIVE_WIDTH + x) * 4;
            const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
            let white = gray >= 128 ? 1 : 0;
            if (invert) white = white ? 0 : 1;
            if (white) out[bit >> 3] |= 0x80 >> (bit & 7);
            bit++;
        }
    }
    return out;
}

export function hashBuffer(buf: Uint8Array): string {
    let h = 5381;
    for (let i = 0; i < buf.length; ++i) {
        h = ((h << 5) + h + buf[i]) & 0xffffffff;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

export function countBits(buf: Uint8Array): number {
    let n = 0;
    for (let i = 0; i < buf.length; ++i) {
        let b = buf[i];
        while (b) { n += b & 1; b >>>= 1; }
    }
    return n;
}
