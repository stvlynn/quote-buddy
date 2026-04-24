/* -------------------------------------------------------------------------
 * Shared domain types.
 * ------------------------------------------------------------------------- */

export type Layout =
    | 'native'
    | 'native-180'
    | 'landscape-left'
    | 'landscape-right';

export type Fit = 'contain' | 'cover' | 'stretch';

export interface NormalizedRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export type BwColor = 'black' | 'white';

export type ElementKind = 'text' | 'rect' | 'line' | 'image' | 'tui';

/** Name of a built-in TUI preset. */
export type TuiPreset = 'dashboard' | 'calendar' | 'status' | 'custom';

/** Border style for TUI widgets — mirrored from lib/tui. */
export type TuiBorder =
    | 'plain' | 'rounded' | 'double' | 'thick' | 'ascii' | 'none';

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

/**
 * Embed a ratatui-style TUI scene inside a compose document.
 * `scene` is a JSON tree of widgets (see lib/tui/scene.ts). `cellW`/`cellH`
 * control how many pixels each terminal cell becomes on the Quote/0.
 */
export interface TuiElement extends BaseElement {
    kind: 'tui';
    x: number; y: number; w: number; h: number;
    cellW: number;
    cellH: number;
    /** Which built-in preset this element started from (for the editor UI). */
    preset: TuiPreset;
    /** Serialisable ratatui scene — see lib/tui/scene.ts. */
    scene: unknown;
}

export type ComposeElement =
    | TextElement
    | RectElement
    | LineElement
    | ImageElement
    | TuiElement;

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

export interface StockFirmwareInfo {
    available: boolean;
    path: string;
    source: string;
}
