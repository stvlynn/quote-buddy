'use client';

import { MiniField, MiniGrid } from './MiniField';
import { NumberInput, Select, Textarea } from '../ui/fields';
import { TuiRenderer } from '../tui/TuiRenderer';
import { tuiPresetScene } from '@/lib/compose';
import type { TuiScene } from '@/lib/tui/scene';
import type { TuiElement, TuiPreset } from '@/lib/types';

const COMPACT_INPUT = 'h-[26px] text-sm px-1.5';

export function TuiEditor({
    el,
    onChange,
}: {
    el: TuiElement;
    onChange: (patch: Partial<TuiElement>) => void;
}) {
    const scene = el.scene as TuiScene;
    const sceneJson = (() => {
        try { return JSON.stringify(el.scene, null, 2); }
        catch { return ''; }
    })();

    const applyPreset = (preset: TuiPreset) => {
        if (preset === 'custom') {
            onChange({ preset });
            return;
        }
        const { scene: s, cellW, cellH } = tuiPresetScene(preset);
        onChange({
            preset,
            scene: s,
            cellW,
            cellH,
            w: s.cols * cellW,
            h: s.rows * cellH,
        });
    };

    const applySceneJson = (text: string) => {
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed === 'object' && parsed !== null) {
                onChange({ scene: parsed, preset: 'custom' });
            }
        } catch {
            // ignore parse errors while typing — commit happens on blur via
            // the textarea's value round-trip.
        }
    };

    return (
        <>
            <p className="m-0 text-xs text-fg-muted">
                ratatui-style widget scene rasterised into the framebuffer.
                Pick a preset or edit the scene JSON directly.
            </p>

            <MiniGrid>
                <MiniField label="Preset" span={2}>
                    <Select
                        className={COMPACT_INPUT}
                        value={el.preset}
                        onChange={(e) => applyPreset(e.target.value as TuiPreset)}
                    >
                        <option value="dashboard">Dashboard</option>
                        <option value="calendar">Calendar</option>
                        <option value="status">Status</option>
                        <option value="custom">Custom</option>
                    </Select>
                </MiniField>
                <MiniField label="Cell W"><NumberInput className={COMPACT_INPUT} min={2} max={24} value={el.cellW} onValueChange={(v) => onChange({ cellW: v })} /></MiniField>
                <MiniField label="Cell H"><NumberInput className={COMPACT_INPUT} min={2} max={32} value={el.cellH} onValueChange={(v) => onChange({ cellH: v })} /></MiniField>
            </MiniGrid>

            <MiniGrid>
                <MiniField label="X"><NumberInput className={COMPACT_INPUT} value={el.x} onValueChange={(v) => onChange({ x: v })} /></MiniField>
                <MiniField label="Y"><NumberInput className={COMPACT_INPUT} value={el.y} onValueChange={(v) => onChange({ y: v })} /></MiniField>
                <MiniField label="W"><NumberInput className={COMPACT_INPUT} min={1} value={el.w} onValueChange={(v) => onChange({ w: v })} /></MiniField>
                <MiniField label="H"><NumberInput className={COMPACT_INPUT} min={1} value={el.h} onValueChange={(v) => onChange({ h: v })} /></MiniField>
            </MiniGrid>

            {scene && scene.root && (
                <div className="rounded border border-border bg-[#0d1015] p-2 overflow-auto">
                    <TuiRenderer scene={scene} fontSize={11} />
                </div>
            )}

            <MiniGrid>
                <MiniField label="Scene JSON" span={4}>
                    <Textarea
                        rows={8}
                        spellCheck={false}
                        defaultValue={sceneJson}
                        onBlur={(e) => applySceneJson(e.target.value)}
                    />
                </MiniField>
            </MiniGrid>
        </>
    );
}
