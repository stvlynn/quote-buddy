// Quote/0 canvas rendering + 1BPP framebuffer packing.
//
// The device expects a raw 152x296 1-bit buffer, MSB-first, 1=white.
// The renderer may be asked to draw at a different *logical* size
// (landscape-right = 296x152) and then rotated to the controller's native
// 152x296 portrait.

export const NATIVE_WIDTH = 152;
export const NATIVE_HEIGHT = 296;
export const FRAME_BYTES = (NATIVE_WIDTH * NATIVE_HEIGHT) / 8;

/** Logical canvas size for a given layout. */
export function logicalSize(layout) {
    if (layout === 'landscape-left' || layout === 'landscape-right') {
        return { w: NATIVE_HEIGHT, h: NATIVE_WIDTH };   // 296 x 152
    }
    return { w: NATIVE_WIDTH, h: NATIVE_HEIGHT };       // 152 x 296
}

/** Prepare a Canvas 2D context at logical size, filled white. */
export function createCanvas(layout) {
    const { w, h } = logicalSize(layout);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

/** Floyd-Steinberg dither on an ImageData (in place). */
function floydSteinberg(imageData) {
    const { data, width, height } = imageData;
    // Convert to grayscale float array
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
            if (x + 1 < width)           gray[i + 1]           += err * 7 / 16;
            if (x - 1 >= 0 && y + 1 < height) gray[i + width - 1]   += err * 3 / 16;
            if (y + 1 < height)          gray[i + width]       += err * 5 / 16;
            if (x + 1 < width && y + 1 < height) gray[i + width + 1]   += err * 1 / 16;
        }
    }
    for (let i = 0; i < gray.length; ++i) {
        const p = i * 4;
        const v = gray[i] < 128 ? 0 : 255;
        data[p] = data[p + 1] = data[p + 2] = v;
    }
}

/** Threshold an ImageData in place (grayscale cutoff). */
function applyThreshold(imageData, threshold) {
    const { data } = imageData;
    for (let p = 0; p < data.length; p += 4) {
        const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        const v = gray >= threshold ? 255 : 0;
        data[p] = data[p + 1] = data[p + 2] = v;
    }
}

/** Draw an HTMLImageElement into ctx with the given fit mode. */
function drawImageFit(ctx, img, targetW, targetH, fit) {
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (sw === 0 || sh === 0) return;

    if (fit === 'stretch') {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        return;
    }
    if (fit === 'cover') {
        const scale = Math.max(targetW / sw, targetH / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (targetW - dw) / 2;
        const dy = (targetH - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }
    // contain
    const scale = Math.min(targetW / sw, targetH / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
}

/** Load a data URL into an HTMLImageElement. */
export function loadImage(dataUrl) {
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

/** Render a picture with the given options onto a fresh layout canvas. */
export async function renderImage({ img, layout, fit, threshold, dither }) {
    const { canvas, ctx, width, height } = createCanvas(layout);
    drawImageFit(ctx, img, width, height, fit);

    const imgData = ctx.getImageData(0, 0, width, height);
    if (dither) {
        floydSteinberg(imgData);
    } else {
        applyThreshold(imgData, threshold);
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/** Render the three-line text layout. */
export function renderText({ title, body, footer, layout, titleSize, bodySize, border }) {
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
        // underline separator
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

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/(\s+)/);
    const lines = [];
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

/**
 * Render a compose spec:
 *   { background?, border?, elements: [{type:text|image|rect|line, ...}] }
 * Image elements must have an already-resolved `imageEl` (loaded in renderer.js
 * before calling this function — browsers cannot load arbitrary file paths).
 */
export async function renderCompose({ spec, layout }) {
    const { canvas, ctx, width, height } = createCanvas(layout);

    const bg = spec.background;
    if (bg === 'black' || bg === 0 || bg === '#000' || bg === '#000000') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }
    if (spec.border) {
        const b = typeof spec.border === 'object' ? spec.border : {};
        const inset = b.inset || 0;
        const bw = b.width || 1;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = bw;
        ctx.strokeRect(inset + bw / 2, inset + bw / 2,
                       width - 2 * inset - bw, height - 2 * inset - bw);
    }

    for (const el of (spec.elements || [])) {
        const t = (el.type || '').toLowerCase();
        if (t === 'text')  drawComposeText(ctx, el, width, height);
        else if (t === 'rect') drawComposeRect(ctx, el);
        else if (t === 'line') drawComposeLine(ctx, el);
        else if (t === 'image') drawComposeImage(ctx, el);
    }

    // Composition uses pure black/white drawing already, so no extra threshold.
    return canvas;
}

function parseColor(value, defaultBlack = true) {
    if (value == null) return defaultBlack ? '#000' : '#fff';
    if (value === 0 || value === 'black' || value === 'dark' ||
        value === '#000' || value === '#000000') return '#000';
    if (value === 255 || value === 'white' || value === 'light' ||
        value === '#fff' || value === '#ffffff') return '#fff';
    // numeric gray threshold ≥128 = white
    if (typeof value === 'number') return value >= 128 ? '#fff' : '#000';
    return defaultBlack ? '#000' : '#fff';
}

function resolveBox(el, canvasW, canvasH) {
    if (Array.isArray(el.rect) && el.rect.length === 4) {
        return { x: el.rect[0] | 0, y: el.rect[1] | 0, w: el.rect[2] | 0, h: el.rect[3] | 0 };
    }
    const x = (el.x || 0) | 0;
    const y = (el.y || 0) | 0;
    const w = (el.w || el.width || canvasW - x) | 0;
    const h = (el.h || el.height || canvasH - y) | 0;
    return { x, y, w, h };
}

function drawComposeText(ctx, el, canvasW, canvasH) {
    const box = resolveBox(el, canvasW, canvasH);
    const pad = parsePadding(el.padding);
    const ix = box.x + pad.left;
    const iy = box.y + pad.top;
    const iw = Math.max(1, box.w - pad.left - pad.right);
    const ih = Math.max(1, box.h - pad.top - pad.bottom);

    const fontSize = el.font_size || 16;
    const fill = parseColor(el.fill, true);
    const align = (el.align || 'left').toLowerCase();
    const valign = (el.valign || 'top').toLowerCase();
    const lineSpacing = el.line_spacing != null ? el.line_spacing : 4;

    ctx.fillStyle = fill;
    ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'alphabetic';

    const text = String(el.text || '');
    const paragraphs = text.split(/\r?\n/);
    const lines = [];
    for (const p of paragraphs) {
        lines.push(...wrapText(ctx, p, iw));
    }
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

function parsePadding(value) {
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    if (value == null) return zero;
    if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
    if (Array.isArray(value)) {
        if (value.length === 2) return { top: value[0] | 0, right: value[1] | 0, bottom: value[0] | 0, left: value[1] | 0 };
        if (value.length === 4) return { top: value[0] | 0, right: value[1] | 0, bottom: value[2] | 0, left: value[3] | 0 };
    }
    return zero;
}

function drawComposeRect(ctx, el) {
    const box = resolveBox(el, ctx.canvas.width, ctx.canvas.height);
    const lineWidth = el.width || 1;
    if (el.fill != null) {
        ctx.fillStyle = parseColor(el.fill);
        ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    if (el.outline != null) {
        ctx.strokeStyle = parseColor(el.outline);
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(box.x + lineWidth / 2, box.y + lineWidth / 2,
                       box.w - lineWidth, box.h - lineWidth);
    }
}

function drawComposeLine(ctx, el) {
    const fill = parseColor(el.fill, true);
    const lw = el.width || 1;
    ctx.strokeStyle = fill;
    ctx.lineWidth = lw;
    ctx.beginPath();
    if (Array.isArray(el.points) && el.points.length >= 2) {
        const [sx, sy] = el.points[0];
        ctx.moveTo(sx | 0, sy | 0);
        for (let i = 1; i < el.points.length; ++i) {
            const [x, y] = el.points[i];
            ctx.lineTo(x | 0, y | 0);
        }
    } else {
        ctx.moveTo((el.x1 || 0) | 0, (el.y1 || 0) | 0);
        ctx.lineTo((el.x2 || 0) | 0, (el.y2 || 0) | 0);
    }
    ctx.stroke();
}

function drawComposeImage(ctx, el) {
    const box = resolveBox(el, ctx.canvas.width, ctx.canvas.height);
    if (!el.imageEl) return;
    const fit = (el.fit || 'contain').toLowerCase();
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.translate(box.x, box.y);
    drawImageFit(ctx, el.imageEl, box.w, box.h, fit);
    ctx.restore();

    // Threshold this image rect only.
    const imgData = ctx.getImageData(box.x, box.y, box.w, box.h);
    if (el.dither) floydSteinberg(imgData);
    else applyThreshold(imgData, el.threshold != null ? el.threshold : 160);
    ctx.putImageData(imgData, box.x, box.y);
}

/* ------------------------------------------------------------------ */
/* Rotation + framebuffer packing                                      */
/* ------------------------------------------------------------------ */

/**
 * Rotate the drawn canvas into the native 152x296 portrait orientation
 * expected by the UC8251D.  Returns a new canvas sized 152x296.
 */
export function rotateToNative(sourceCanvas, layout) {
    const out = document.createElement('canvas');
    out.width = NATIVE_WIDTH;
    out.height = NATIVE_HEIGHT;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

    const { w, h } = logicalSize(layout);

    if (layout === 'native') {
        ctx.drawImage(sourceCanvas, 0, 0);
    } else if (layout === 'native-180') {
        ctx.translate(NATIVE_WIDTH, NATIVE_HEIGHT);
        ctx.rotate(Math.PI);
        ctx.drawImage(sourceCanvas, 0, 0);
    } else if (layout === 'landscape-right') {
        // Logical 296x152 → native 152x296 rotated 90° CW.
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

/**
 * Pack a 152x296 canvas into a 5624-byte 1BPP buffer.
 * Convention: MSB-first per byte, 1 = white, 0 = black.
 * This matches tools/quote0_send.py (`pack_pixels`).
 */
export function packNativeToFramebuffer(nativeCanvas, { invert = false } = {}) {
    if (nativeCanvas.width !== NATIVE_WIDTH || nativeCanvas.height !== NATIVE_HEIGHT) {
        throw new Error(`expected ${NATIVE_WIDTH}x${NATIVE_HEIGHT} canvas`);
    }
    const ctx = nativeCanvas.getContext('2d', { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    const out = new Uint8Array(FRAME_BYTES);

    let bit = 0;
    for (let y = 0; y < NATIVE_HEIGHT; ++y) {
        for (let x = 0; x < NATIVE_WIDTH; ++x) {
            const p = (y * NATIVE_WIDTH + x) * 4;
            const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
            let white = gray >= 128 ? 1 : 0;
            if (invert) white = white ? 0 : 1;
            if (white) {
                out[bit >> 3] |= 0x80 >> (bit & 7);
            }
            bit++;
        }
    }
    return out;
}

/** Convenience hash to display "did the preview actually change?" */
export function hashBuffer(buf) {
    let h = 5381;
    for (let i = 0; i < buf.length; ++i) {
        h = ((h << 5) + h + buf[i]) & 0xffffffff;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
