'use client';

import { MiniField, MiniGrid } from './MiniField';
import { NumberInput, Select, Textarea, Checkbox } from '../ui/fields';
import { Segmented } from '../ui/Segmented';
import type {
    Align,
    BwColor,
    Fit,
    ImageElement,
    LineElement,
    RectElement,
    TextElement,
    VAlign,
} from '@/lib/types';

const COMPACT_INPUT = 'h-[26px] text-sm px-1.5';

/* --------------------------- Text element --------------------------- */

export function TextEditor({
    el,
    onChange,
}: {
    el: TextElement;
    onChange: (patch: Partial<TextElement>) => void;
}) {
    return (
        <>
            <MiniGrid>
                <MiniField label="Content" span={4}>
                    <Textarea
                        value={el.text}
                        rows={2}
                        onChange={(e) => onChange({ text: e.target.value })}
                    />
                </MiniField>
            </MiniGrid>

            <MiniGrid>
                <MiniField label="X"><NumberInput className={COMPACT_INPUT} value={el.x} onValueChange={(v) => onChange({ x: v })} /></MiniField>
                <MiniField label="Y"><NumberInput className={COMPACT_INPUT} value={el.y} onValueChange={(v) => onChange({ y: v })} /></MiniField>
                <MiniField label="W"><NumberInput className={COMPACT_INPUT} min={1} value={el.w} onValueChange={(v) => onChange({ w: v })} /></MiniField>
                <MiniField label="H"><NumberInput className={COMPACT_INPUT} min={1} value={el.h} onValueChange={(v) => onChange({ h: v })} /></MiniField>
                <MiniField label="Font size" span={2}><NumberInput className={COMPACT_INPUT} min={6} max={72} value={el.font_size} onValueChange={(v) => onChange({ font_size: v })} /></MiniField>
                <MiniField label="Line spacing" span={2}><NumberInput className={COMPACT_INPUT} min={0} max={32} value={el.line_spacing} onValueChange={(v) => onChange({ line_spacing: v })} /></MiniField>
            </MiniGrid>

            <MiniGrid>
                <MiniField label="Align" span={2}>
                    <Segmented<Align>
                        value={el.align}
                        onValueChange={(v) => onChange({ align: v })}
                        options={[
                            { value: 'left',   label: 'L', title: 'Left' },
                            { value: 'center', label: 'C', title: 'Center' },
                            { value: 'right',  label: 'R', title: 'Right' },
                        ]}
                    />
                </MiniField>
                <MiniField label="V-align" span={2}>
                    <Segmented<VAlign>
                        value={el.valign}
                        onValueChange={(v) => onChange({ valign: v })}
                        options={[
                            { value: 'top',    label: 'T', title: 'Top' },
                            { value: 'middle', label: 'M', title: 'Middle' },
                            { value: 'bottom', label: 'B', title: 'Bottom' },
                        ]}
                    />
                </MiniField>
                <MiniField label="Color" span={2}>
                    <Segmented<BwColor>
                        value={el.fill}
                        onValueChange={(v) => onChange({ fill: v })}
                        options={[
                            { value: 'black', label: 'Black' },
                            { value: 'white', label: 'White' },
                        ]}
                    />
                </MiniField>
                <MiniField label="Padding" span={2}>
                    <NumberInput className={COMPACT_INPUT} min={0} max={32} value={el.padding} onValueChange={(v) => onChange({ padding: v })} />
                </MiniField>
            </MiniGrid>
        </>
    );
}

/* --------------------------- Rect element --------------------------- */

export function RectEditor({
    el,
    onChange,
}: {
    el: RectElement;
    onChange: (patch: Partial<RectElement>) => void;
}) {
    return (
        <>
            <MiniGrid>
                <MiniField label="X"><NumberInput className={COMPACT_INPUT} value={el.x} onValueChange={(v) => onChange({ x: v })} /></MiniField>
                <MiniField label="Y"><NumberInput className={COMPACT_INPUT} value={el.y} onValueChange={(v) => onChange({ y: v })} /></MiniField>
                <MiniField label="W"><NumberInput className={COMPACT_INPUT} min={1} value={el.w} onValueChange={(v) => onChange({ w: v })} /></MiniField>
                <MiniField label="H"><NumberInput className={COMPACT_INPUT} min={1} value={el.h} onValueChange={(v) => onChange({ h: v })} /></MiniField>
            </MiniGrid>

            <MiniGrid>
                <MiniField label="Fill" span={2}>
                    <Select
                        className={COMPACT_INPUT}
                        value={el.fill}
                        onChange={(e) => onChange({ fill: e.target.value as RectElement['fill'] })}
                    >
                        <option value="">— none</option>
                        <option value="black">Black</option>
                        <option value="white">White</option>
                    </Select>
                </MiniField>
                <MiniField label="Outline" span={2}>
                    <Select
                        className={COMPACT_INPUT}
                        value={el.outline}
                        onChange={(e) => onChange({ outline: e.target.value as RectElement['outline'] })}
                    >
                        <option value="">— none</option>
                        <option value="black">Black</option>
                        <option value="white">White</option>
                    </Select>
                </MiniField>
                <MiniField label="Line width" span={2}>
                    <NumberInput
                        className={COMPACT_INPUT}
                        min={1}
                        max={10}
                        value={el.width}
                        onValueChange={(v) => onChange({ width: v })}
                    />
                </MiniField>
            </MiniGrid>
        </>
    );
}

/* --------------------------- Line element --------------------------- */

export function LineEditor({
    el,
    onChange,
}: {
    el: LineElement;
    onChange: (patch: Partial<LineElement>) => void;
}) {
    return (
        <MiniGrid>
            <MiniField label="X1"><NumberInput className={COMPACT_INPUT} value={el.x1} onValueChange={(v) => onChange({ x1: v })} /></MiniField>
            <MiniField label="Y1"><NumberInput className={COMPACT_INPUT} value={el.y1} onValueChange={(v) => onChange({ y1: v })} /></MiniField>
            <MiniField label="X2"><NumberInput className={COMPACT_INPUT} value={el.x2} onValueChange={(v) => onChange({ x2: v })} /></MiniField>
            <MiniField label="Y2"><NumberInput className={COMPACT_INPUT} value={el.y2} onValueChange={(v) => onChange({ y2: v })} /></MiniField>
            <MiniField label="Width" span={2}>
                <NumberInput className={COMPACT_INPUT} min={1} max={10} value={el.width} onValueChange={(v) => onChange({ width: v })} />
            </MiniField>
            <MiniField label="Color" span={2}>
                <Segmented<BwColor>
                    value={el.fill}
                    onValueChange={(v) => onChange({ fill: v })}
                    options={[
                        { value: 'black', label: 'Black' },
                        { value: 'white', label: 'White' },
                    ]}
                />
            </MiniField>
        </MiniGrid>
    );
}

/* --------------------------- Image element --------------------------- */

export function ImageEditor({
    el,
    onChange,
    sourceName,
}: {
    el: ImageElement;
    onChange: (patch: Partial<ImageElement>) => void;
    sourceName: string | null;
}) {
    return (
        <>
            <p className="m-0 text-xs text-fg-muted">
                {sourceName
                    ? <>Using source from Image tab: <span className="text-fg">{sourceName}</span></>
                    : <>No source image — pick one in the Image tab.</>}
            </p>
            <MiniGrid>
                <MiniField label="X"><NumberInput className={COMPACT_INPUT} value={el.x} onValueChange={(v) => onChange({ x: v })} /></MiniField>
                <MiniField label="Y"><NumberInput className={COMPACT_INPUT} value={el.y} onValueChange={(v) => onChange({ y: v })} /></MiniField>
                <MiniField label="W"><NumberInput className={COMPACT_INPUT} min={1} value={el.w} onValueChange={(v) => onChange({ w: v })} /></MiniField>
                <MiniField label="H"><NumberInput className={COMPACT_INPUT} min={1} value={el.h} onValueChange={(v) => onChange({ h: v })} /></MiniField>
                <MiniField label="Fit" span={2}>
                    <Select
                        className={COMPACT_INPUT}
                        value={el.fit}
                        onChange={(e) => onChange({ fit: e.target.value as Fit })}
                    >
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                        <option value="stretch">Stretch</option>
                    </Select>
                </MiniField>
                <MiniField label="Threshold" span={2}>
                    <NumberInput
                        className={COMPACT_INPUT}
                        min={0}
                        max={255}
                        value={el.threshold}
                        onValueChange={(v) => onChange({ threshold: v })}
                    />
                </MiniField>
            </MiniGrid>
            <div className="flex flex-wrap gap-2.5 items-center">
                <Checkbox
                    checked={el.dither}
                    onCheckedChange={(v) => onChange({ dither: v })}
                    label="Dither"
                />
            </div>
        </>
    );
}
