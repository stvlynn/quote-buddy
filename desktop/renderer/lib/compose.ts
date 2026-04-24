/* -------------------------------------------------------------------------
 * Compose editor <-> canvas spec mapping, plus defaults.
 * ------------------------------------------------------------------------- */

import type {
    ComposeDoc,
    ComposeElement,
    ComposeSpec,
    ElementKind,
    ImageElement,
    LineElement,
    RectElement,
    TextElement,
} from './types';

let idSeq = 1;
export function newId(): string { return `e${idSeq++}`; }

export function defaultElement(kind: ElementKind): ComposeElement {
    switch (kind) {
        case 'text': return {
            id: newId(), kind: 'text',
            x: 10, y: 10, w: 140, h: 40,
            text: 'Text', font_size: 16,
            align: 'left', valign: 'top', fill: 'black',
            padding: 2, line_spacing: 4,
        } satisfies TextElement;
        case 'rect': return {
            id: newId(), kind: 'rect',
            x: 10, y: 10, w: 80, h: 30,
            fill: '', outline: 'black', width: 1,
        } satisfies RectElement;
        case 'line': return {
            id: newId(), kind: 'line',
            x1: 10, y1: 20, x2: 100, y2: 20,
            width: 1, fill: 'black',
        } satisfies LineElement;
        case 'image': return {
            id: newId(), kind: 'image',
            x: 10, y: 10, w: 80, h: 60,
            fit: 'contain', threshold: 160, dither: false,
            useSource: true,
        } satisfies ImageElement;
    }
}

/** A compact working sample for the "Load sample" button. */
export function sampleElements(): ComposeElement[] {
    return [
        {
            id: newId(), kind: 'text',
            x: 12, y: 12, w: 200, h: 28,
            text: 'Quote/0', font_size: 22,
            align: 'left', valign: 'top', fill: 'black',
            padding: 2, line_spacing: 4,
        },
        {
            id: newId(), kind: 'text',
            x: 12, y: 50, w: 270, h: 72,
            text: 'Composed layout: mix text, rects, and lines.\nImages need the Image tab first.',
            font_size: 14,
            align: 'left', valign: 'top', fill: 'black',
            padding: 2, line_spacing: 4,
        },
        {
            id: newId(), kind: 'line',
            x1: 12, y1: 128, x2: 282, y2: 128,
            width: 1, fill: 'black',
        },
        {
            id: newId(), kind: 'text',
            x: 12, y: 132, w: 270, h: 14,
            text: 'quote0 desktop', font_size: 11,
            align: 'left', valign: 'top', fill: 'black',
            padding: 0, line_spacing: 0,
        },
    ];
}

/** Map the editor model into the canvas-ready spec. */
export function buildSpec(doc: ComposeDoc, sourceImage: HTMLImageElement | null): ComposeSpec {
    return {
        background: doc.background,
        border: doc.border,
        elements: doc.elements.map((el) => elementToSpec(el, sourceImage)),
    };
}

function elementToSpec(
    el: ComposeElement,
    sourceImage: HTMLImageElement | null,
): Record<string, unknown> {
    if (el.kind === 'text') {
        return {
            type: 'text',
            x: el.x, y: el.y, w: el.w, h: el.h,
            text: el.text, font_size: el.font_size,
            align: el.align, valign: el.valign, fill: el.fill,
            padding: el.padding, line_spacing: el.line_spacing,
        };
    }
    if (el.kind === 'rect') {
        const out: Record<string, unknown> = { type: 'rect', x: el.x, y: el.y, w: el.w, h: el.h };
        if (el.fill)    out.fill    = el.fill;
        if (el.outline) out.outline = el.outline;
        if (el.width)   out.width   = el.width;
        return out;
    }
    if (el.kind === 'line') {
        return {
            type: 'line',
            x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2,
            width: el.width, fill: el.fill,
        };
    }
    // image
    const out: Record<string, unknown> = {
        type: 'image',
        x: el.x, y: el.y, w: el.w, h: el.h,
        fit: el.fit, threshold: el.threshold, dither: el.dither,
    };
    if (el.useSource && sourceImage) out.imageEl = sourceImage;
    return out;
}

/** Parse an external JSON string into an editor model (with fresh ids). */
export function parseSpec(raw: string): ComposeDoc {
    const spec = JSON.parse(raw);
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
        throw new Error('spec must be an object');
    }
    if (!Array.isArray(spec.elements)) {
        throw new Error('spec.elements must be an array');
    }
    return {
        background: spec.background === 'black' || spec.background === 0 ? 'black' : 'white',
        border: !!spec.border,
        elements: spec.elements
            .map((raw: Record<string, unknown>) => specToElement(raw))
            .filter((el: ComposeElement | null): el is ComposeElement => el !== null),
    };
}

function specToElement(raw: Record<string, unknown>): ComposeElement | null {
    const type = String(raw.type || '').toLowerCase();
    const num = (v: unknown, d = 0) => {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        return Number.isFinite(n) ? n : d;
    };
    if (type === 'text') {
        return {
            id: newId(), kind: 'text',
            x: num(raw.x), y: num(raw.y),
            w: num(raw.w ?? raw.width, 100), h: num(raw.h ?? raw.height, 20),
            text: String(raw.text ?? ''),
            font_size: num(raw.font_size, 16),
            align: (raw.align as TextElement['align']) || 'left',
            valign: (raw.valign as TextElement['valign']) || 'top',
            fill: (raw.fill === 'white' ? 'white' : 'black'),
            padding: typeof raw.padding === 'number' ? raw.padding : 2,
            line_spacing: raw.line_spacing != null ? num(raw.line_spacing, 4) : 4,
        };
    }
    if (type === 'rect') {
        return {
            id: newId(), kind: 'rect',
            x: num(raw.x), y: num(raw.y),
            w: num(raw.w ?? raw.width, 40), h: num(raw.h ?? raw.height, 20),
            fill: (raw.fill as RectElement['fill']) || '',
            outline: (raw.outline as RectElement['outline']) || '',
            width: num(raw.width, 1),
        };
    }
    if (type === 'line') {
        return {
            id: newId(), kind: 'line',
            x1: num(raw.x1), y1: num(raw.y1),
            x2: num(raw.x2), y2: num(raw.y2),
            width: num(raw.width, 1),
            fill: (raw.fill === 'white' ? 'white' : 'black'),
        };
    }
    if (type === 'image') {
        return {
            id: newId(), kind: 'image',
            x: num(raw.x), y: num(raw.y),
            w: num(raw.w ?? raw.width, 60), h: num(raw.h ?? raw.height, 40),
            fit: (raw.fit as ImageElement['fit']) || 'contain',
            threshold: raw.threshold != null ? num(raw.threshold, 160) : 160,
            dither: !!raw.dither,
            useSource: true,
        };
    }
    return null;
}

/** Serialise editor state to a printable spec (without imageEl DOM node). */
export function toPrintableJson(doc: ComposeDoc): string {
    const strippedElements = doc.elements.map((el) => {
        if (el.kind === 'image') {
            const { useSource: _u, id: _id, ...rest } = el;
            void _u; void _id;
            return { type: 'image', ...rest };
        }
        const { id: _id, kind, ...rest } = el;
        void _id;
        return { type: kind, ...rest };
    });
    return JSON.stringify({
        background: doc.background,
        border: doc.border,
        elements: strippedElements,
    }, null, 2);
}

export function summariseElement(el: ComposeElement): string {
    if (el.kind === 'text') {
        const preview = (el.text || '').split(/\r?\n/)[0].slice(0, 22);
        return preview
            ? `"${preview}${el.text.length > 22 ? '…' : ''}"  ·  ${el.font_size}px`
            : '(empty)';
    }
    if (el.kind === 'rect') return `${el.w}×${el.h} @ ${el.x},${el.y}`;
    if (el.kind === 'line') return `${el.x1},${el.y1} → ${el.x2},${el.y2}`;
    return `${el.w}×${el.h} @ ${el.x},${el.y} · ${el.fit}`;
}
