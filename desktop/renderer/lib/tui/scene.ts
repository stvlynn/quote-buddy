/* -------------------------------------------------------------------------
 * Serialisable TUI scene definition.
 *
 * `TuiElement` (in lib/types) stores a JSON-friendly `TuiScene` describing
 * a ratatui-style layout tree. `buildSceneWidgets` walks that tree and
 * produces concrete widget instances rendered into a Buffer. This keeps
 * the compose JSON round-trippable while still reusing the proper widget
 * implementations.
 * ------------------------------------------------------------------------- */

import {
    type Buffer,
    type Constraint,
    type Direction,
    type Rect,
    Fill,
    Length,
    Min,
    Percentage,
    layout,
} from './cells';
import {
    BarChart,
    BigText,
    Block,
    type BlockProps,
    Calendar,
    Gauge,
    List,
    Paragraph,
    Sparkline,
    Tabs,
} from './widgets';

/* ------------------------------------------------------------------ */
/* Scene node types                                                    */
/* ------------------------------------------------------------------ */

export type SceneNode =
    | SceneLayout
    | SceneBlock
    | SceneParagraph
    | SceneList
    | SceneTabs
    | SceneGauge
    | SceneSparkline
    | SceneBarChart
    | SceneBigText
    | SceneCalendar;

export interface SceneConstraint {
    kind: 'length' | 'percentage' | 'min' | 'fill';
    value: number;
}

export interface SceneLayout {
    type: 'layout';
    direction: Direction;
    constraints: SceneConstraint[];
    children: SceneNode[];
}

export interface SceneBlock {
    type: 'block';
    props?: BlockProps;
    /** Optional child node drawn inside the block. */
    child?: SceneNode;
}

export interface SceneParagraph {
    type: 'paragraph';
    text: string;
    align?: 'left' | 'center' | 'right';
    wrap?: boolean;
    block?: BlockProps;
}

export interface SceneList {
    type: 'list';
    items: string[];
    selected?: number;
    highlightSymbol?: string;
    block?: BlockProps;
}

export interface SceneTabs {
    type: 'tabs';
    titles: string[];
    selected: number;
    divider?: string;
    block?: BlockProps;
}

export interface SceneGauge {
    type: 'gauge';
    ratio: number;
    label?: string;
    fillStyle?: 'block' | 'ascii';
    block?: BlockProps;
}

export interface SceneSparkline {
    type: 'sparkline';
    data: number[];
    max?: number;
    block?: BlockProps;
}

export interface SceneBarChart {
    type: 'barchart';
    bars: Array<{ label: string; value: number }>;
    max?: number;
    barWidth?: number;
    barGap?: number;
    block?: BlockProps;
}

export interface SceneBigText {
    type: 'bigtext';
    text: string;
    align?: 'left' | 'center' | 'right';
    glyphSpacing?: number;
    block?: BlockProps;
}

export interface SceneCalendar {
    type: 'calendar';
    month?: string;
    highlight?: string;
    startMonday?: boolean;
    block?: BlockProps;
}

export interface TuiScene {
    /** Grid size in cells. */
    cols: number;
    rows: number;
    root: SceneNode;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

function toConstraint(sc: SceneConstraint): Constraint {
    switch (sc.kind) {
        case 'length':     return Length(sc.value);
        case 'percentage': return Percentage(sc.value);
        case 'min':        return Min(sc.value);
        case 'fill':       return Fill(sc.value);
    }
}

function mkBlock(props?: BlockProps): Block | undefined {
    if (!props) return undefined;
    return new Block(props);
}

export function renderScene(node: SceneNode, area: Rect, buf: Buffer): void {
    if (area.w <= 0 || area.h <= 0) return;
    switch (node.type) {
        case 'layout': {
            const rects = layout(area, node.direction, node.constraints.map(toConstraint));
            for (let i = 0; i < node.children.length && i < rects.length; ++i) {
                renderScene(node.children[i], rects[i], buf);
            }
            return;
        }
        case 'block': {
            const b = new Block(node.props ?? {});
            if (node.child) {
                const inner = b.renderWithInner(area, buf);
                renderScene(node.child, inner, buf);
            } else {
                b.render(area, buf);
            }
            return;
        }
        case 'paragraph':
            new Paragraph({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'list':
            new List({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'tabs':
            new Tabs({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'gauge':
            new Gauge({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'sparkline':
            new Sparkline({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'barchart':
            new BarChart({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'bigtext':
            new BigText({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
        case 'calendar':
            new Calendar({ ...node, block: mkBlock(node.block) }).render(area, buf);
            return;
    }
}

/* ------------------------------------------------------------------ */
/* Ready-made presets — used as sensible defaults / sample scenes      */
/* ------------------------------------------------------------------ */

export function dashboardPreset(): TuiScene {
    return {
        cols: 48,
        rows: 18,
        root: {
            type: 'layout',
            direction: 'vertical',
            constraints: [
                { kind: 'length', value: 3 },
                { kind: 'length', value: 5 },
                { kind: 'fill',   value: 1 },
                { kind: 'length', value: 3 },
            ],
            children: [
                {
                    type: 'tabs',
                    titles: ['Overview', 'Image', 'Text', 'Compose'],
                    selected: 0,
                    block: { border: 'plain', title: 'Quote/0' },
                },
                {
                    type: 'bigtext',
                    text: 'QUOTE/0',
                    align: 'center',
                    block: { border: 'none' },
                },
                {
                    type: 'layout',
                    direction: 'horizontal',
                    constraints: [
                        { kind: 'percentage', value: 50 },
                        { kind: 'fill',       value: 1 },
                    ],
                    children: [
                        {
                            type: 'layout',
                            direction: 'vertical',
                            constraints: [
                                { kind: 'length', value: 3 },
                                { kind: 'length', value: 3 },
                                { kind: 'fill',   value: 1 },
                            ],
                            children: [
                                { type: 'gauge', ratio: 0.62, label: 'Battery 62%',
                                  block: { border: 'plain', title: 'BAT' } },
                                { type: 'gauge', ratio: 0.88, label: 'RSSI',
                                  block: { border: 'plain', title: 'WIFI' } },
                                {
                                    type: 'sparkline',
                                    data: [2, 3, 5, 4, 6, 7, 9, 8, 10, 9, 12, 11, 13, 12, 15, 14, 16, 15, 14, 12, 10, 9, 8, 6, 5],
                                    block: { border: 'plain', title: 'LOAD' },
                                },
                            ],
                        },
                        {
                            type: 'list',
                            items: [
                                'serial · /dev/cu.usbmodem1101',
                                'layout · landscape-right',
                                'frames · 1842',
                                'last   · OK  312 ms',
                                'next   · idle',
                            ],
                            selected: 0,
                            highlightSymbol: '▶ ',
                            block: { border: 'plain', title: 'Status' },
                        },
                    ],
                },
                {
                    type: 'paragraph',
                    text: 'ratatui-style TUI in compose · Ctrl+Enter to send · Ctrl+R refresh',
                    align: 'center',
                    block: { border: 'plain' },
                },
            ],
        },
    };
}

export function calendarPreset(): TuiScene {
    return {
        cols: 36,
        rows: 12,
        root: {
            type: 'layout',
            direction: 'horizontal',
            constraints: [
                { kind: 'length', value: 22 },
                { kind: 'fill',   value: 1 },
            ],
            children: [
                { type: 'calendar', block: { border: 'plain' } },
                {
                    type: 'layout',
                    direction: 'vertical',
                    constraints: [
                        { kind: 'length', value: 7 },
                        { kind: 'fill',   value: 1 },
                    ],
                    children: [
                        { type: 'bigtext', text: '16:30', align: 'center' },
                        {
                            type: 'paragraph',
                            text: 'Today\nStandup\nReview\nQuote/0 bring-up',
                            block: { border: 'plain', title: 'Notes' },
                        },
                    ],
                },
            ],
        },
    };
}

export function statusPreset(): TuiScene {
    return {
        cols: 38,
        rows: 14,
        root: {
            type: 'block',
            props: { border: 'double', title: ' QUOTE/0 · STATUS ', titleAlign: 'center' },
            child: {
                type: 'layout',
                direction: 'vertical',
                constraints: [
                    { kind: 'length', value: 1 },
                    { kind: 'length', value: 1 },
                    { kind: 'length', value: 1 },
                    { kind: 'length', value: 1 },
                    { kind: 'fill',   value: 1 },
                    { kind: 'length', value: 4 },
                ],
                children: [
                    { type: 'paragraph', text: 'port    /dev/cu.usbmodem1101' },
                    { type: 'paragraph', text: 'layout  landscape-right' },
                    { type: 'paragraph', text: 'panel   UC8251D · 152×296' },
                    { type: 'paragraph', text: 'state   READY' },
                    {
                        type: 'barchart',
                        bars: [
                            { label: 'mon', value: 6 },
                            { label: 'tue', value: 8 },
                            { label: 'wed', value: 5 },
                            { label: 'thu', value: 11 },
                            { label: 'fri', value: 9 },
                        ],
                        barWidth: 3,
                        barGap: 1,
                        block: { border: 'plain', title: 'refreshes' },
                    },
                    { type: 'gauge', ratio: 0.73, label: '73% slot quota',
                      block: { border: 'plain' } },
                ],
            },
        },
    };
}
