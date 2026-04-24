'use client';

import { FolderOpen } from 'lucide-react';
import { Button } from '../ui/Button';
import { Checkbox, Field, FieldValueChip, Select, Slider } from '../ui/fields';
import type { Fit } from '@/lib/types';

export interface ImageTabProps {
    sourcePath: string | null;
    fit: Fit;
    threshold: number;
    dither: boolean;
    onPick: () => void;
    onFitChange: (v: Fit) => void;
    onThresholdChange: (v: number) => void;
    onDitherChange: (v: boolean) => void;
}

export function ImageTab(p: ImageTabProps) {
    const shortName = p.sourcePath ? p.sourcePath.split('/').pop() : null;
    return (
        <div className="flex flex-col gap-3">
            <Field label="Source image">
                <div className="flex items-center gap-2">
                    <Button onClick={p.onPick} leftIcon={<FolderOpen size={14} />}>
                        Choose file…
                    </Button>
                    <span
                        title={p.sourcePath ?? 'No file selected'}
                        className="text-sm text-fg-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0 flex-1"
                    >
                        {shortName ?? 'No file selected'}
                    </span>
                </div>
            </Field>

            <Field label="Fit" htmlFor="img-fit">
                <Select id="img-fit" value={p.fit} onChange={(e) => p.onFitChange(e.target.value as Fit)}>
                    <option value="contain">Contain</option>
                    <option value="cover">Cover</option>
                    <option value="stretch">Stretch</option>
                </Select>
            </Field>

            <Field
                label="Threshold"
                htmlFor="img-threshold"
                valueSlot={<FieldValueChip>{p.threshold}</FieldValueChip>}
            >
                <Slider
                    id="img-threshold"
                    min={0}
                    max={255}
                    value={p.threshold}
                    onValueChange={p.onThresholdChange}
                    aria-label="Threshold"
                />
            </Field>

            <Checkbox
                id="img-dither"
                checked={p.dither}
                onCheckedChange={p.onDitherChange}
                label="Floyd–Steinberg dither"
            />
        </div>
    );
}
