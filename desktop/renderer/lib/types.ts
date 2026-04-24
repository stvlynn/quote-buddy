/* -------------------------------------------------------------------------
 * Shared domain types.
 * ------------------------------------------------------------------------- */

export type Layout =
    | 'native'
    | 'native-180'
    | 'landscape-left'
    | 'landscape-right';

export type Fit = 'contain' | 'cover' | 'stretch';

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export type BwColor = 'black' | 'white';

export type ElementKind = 'text' | 'rect' | 'line' | 'image';

/** Internal editor model (one per list entry). */
export interface BaseElement {
    id: string;
    kind: ElementKind;
}

export interface TextElement extends BaseElement {
    kind: 'text';
    x: number; y: number; w: number; h: number;
    text: string;
    font_size: number;
    align: Align;
    valign: VAlign;
    fill: BwColor;
    padding: number;
    line_spacing: number;
}

export interface RectElement extends BaseElement {
    kind: 'rect';
    x: number; y: number; w: number; h: number;
    fill: BwColor | '';
    outline: BwColor | '';
    width: number;
}

export interface LineElement extends BaseElement {
    kind: 'line';
    x1: number; y1: number; x2: number; y2: number;
    width: number;
    fill: BwColor;
}

export interface ImageElement extends BaseElement {
    kind: 'image';
    x: number; y: number; w: number; h: number;
    fit: Fit;
    threshold: number;
    dither: boolean;
    /** Always true in this build — the image tab picks the source. */
    useSource: boolean;
}

export type ComposeElement =
    | TextElement
    | RectElement
    | LineElement
    | ImageElement;

export interface ComposeDoc {
    background: BwColor;
    border: boolean;
    elements: ComposeElement[];
}

/** On-the-wire shape consumed by `renderCompose`. */
export interface ComposeSpec {
    background?: BwColor;
    border?: boolean | Record<string, unknown>;
    elements: Array<Record<string, unknown> & { imageEl?: HTMLImageElement }>;
}

export type ConnState = 'idle' | 'connected' | 'busy' | 'error';
export type LogKind = '' | 'ok' | 'err';

export interface SerialPortInfo {
    path: string;
    manufacturer: string;
    serialNumber: string;
    vendorId: string;
    productId: string;
}

export interface PickImageResult {
    path: string;
    dataUrl: string;
}

export interface FirmwareLog {
    stream: 'stdout' | 'stderr';
    text: string;
}

export interface FlashResult {
    ok: boolean;
    error?: string;
}

export interface CustomFirmwareInfo {
    available: boolean;
    buildDir: string;
}
