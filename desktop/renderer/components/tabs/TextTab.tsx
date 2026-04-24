'use client';

import {
    Checkbox,
    Field,
    FieldValueChip,
    Slider,
    Textarea,
    TextInput,
} from '../ui/fields';

export interface TextTabState {
    title: string;
    body: string;
    footer: string;
    titleSize: number;
    bodySize: number;
    border: boolean;
}

export interface TextTabProps {
    state: TextTabState;
    onChange: (next: Partial<TextTabState>) => void;
}

export function TextTab({ state, onChange }: TextTabProps) {
    return (
        <div className="flex flex-col gap-3">
            <Field label="Title" htmlFor="text-title">
                <TextInput
                    id="text-title"
                    value={state.title}
                    onChange={(e) => onChange({ title: e.target.value })}
                />
            </Field>
            <Field label="Body" htmlFor="text-body">
                <Textarea
                    id="text-body"
                    rows={6}
                    value={state.body}
                    onChange={(e) => onChange({ body: e.target.value })}
                    placeholder="Anything. Line breaks are preserved."
                />
            </Field>
            <Field label="Footer" htmlFor="text-footer">
                <TextInput
                    id="text-footer"
                    value={state.footer}
                    onChange={(e) => onChange({ footer: e.target.value })}
                    placeholder="Optional"
                />
            </Field>
            <Field
                label="Title size"
                htmlFor="text-title-size"
                valueSlot={<FieldValueChip>{state.titleSize}</FieldValueChip>}
            >
                <Slider
                    id="text-title-size"
                    min={10}
                    max={48}
                    value={state.titleSize}
                    onValueChange={(v) => onChange({ titleSize: v })}
                    aria-label="Title size"
                />
            </Field>
            <Field
                label="Body size"
                htmlFor="text-body-size"
                valueSlot={<FieldValueChip>{state.bodySize}</FieldValueChip>}
            >
                <Slider
                    id="text-body-size"
                    min={8}
                    max={32}
                    value={state.bodySize}
                    onValueChange={(v) => onChange({ bodySize: v })}
                    aria-label="Body size"
                />
            </Field>
            <Checkbox
                id="text-border"
                checked={state.border}
                onCheckedChange={(v) => onChange({ border: v })}
                label="Draw outer border"
            />
        </div>
    );
}
