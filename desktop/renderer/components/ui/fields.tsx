'use client';

import type {
    ChangeEvent,
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from 'react';

/* ------------------------------------------------------------------ */
/* Primitive inputs                                                    */
/* ------------------------------------------------------------------ */

const INPUT_BASE =
    'w-full h-7 px-2.5 rounded bg-input-bg text-fg border border-border ' +
    'font-ui text-dense placeholder:text-fg-subtle ' +
    'transition-colors hover:border-border-strong ' +
    'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
    const { className = '', ...rest } = props;
    return <input type="text" className={`${INPUT_BASE} ${className}`} {...rest} />;
}

export interface NumberInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number;
    onValueChange: (v: number) => void;
}

export function NumberInput({ value, onValueChange, className = '', ...rest }: NumberInputProps) {
    return (
        <input
            type="number"
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => {
                const n = parseFloat(e.target.value);
                onValueChange(Number.isFinite(n) ? n : 0);
            }}
            className={`${INPUT_BASE} ${className}`}
            {...rest}
        />
    );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const { className = '', ...rest } = props;
    return (
        <textarea
            spellCheck={false}
            className={
                'w-full px-2.5 py-2 rounded bg-input-bg text-fg border border-border ' +
                'font-mono text-sm leading-relaxed resize-y ' +
                'transition-colors hover:border-border-strong ' +
                'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ' +
                className
            }
            {...rest}
        />
    );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
    const { className = '', children, ...rest } = props;
    return (
        <select className={`${INPUT_BASE} cursor-pointer ${className}`} {...rest}>
            {children}
        </select>
    );
}

/* ------------------------------------------------------------------ */
/* Labelled field wrappers                                             */
/* ------------------------------------------------------------------ */

export function FieldLabel({
    children,
    htmlFor,
    valueSlot,
}: {
    children: ReactNode;
    htmlFor?: string;
    valueSlot?: ReactNode;
}) {
    return (
        <label
            htmlFor={htmlFor}
            className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"
        >
            <span>{children}</span>
            {valueSlot}
        </label>
    );
}

export function FieldValueChip({ children }: { children: ReactNode }) {
    return (
        <span className="font-mono text-xs text-fg bg-surface-2 px-1.5 py-0.5 rounded min-w-[2rem] text-center normal-case tracking-normal">
            {children}
        </span>
    );
}

export function Field({
    label,
    htmlFor,
    valueSlot,
    children,
}: {
    label: ReactNode;
    htmlFor?: string;
    valueSlot?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={htmlFor} valueSlot={valueSlot}>{label}</FieldLabel>
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Range slider (custom Tailwind-styled)                               */
/* ------------------------------------------------------------------ */

export interface SliderProps {
    id?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onValueChange: (v: number) => void;
    'aria-label'?: string;
}

export function Slider({ value, min, max, step = 1, onValueChange, id, ...rest }: SliderProps) {
    return (
        <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange(+e.target.value)}
            className="slider-range w-full h-5 cursor-pointer appearance-none bg-transparent p-0 m-0"
            {...rest}
        />
    );
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

export interface CheckboxProps {
    id?: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    label: ReactNode;
    title?: string;
}

export function Checkbox({ checked, onCheckedChange, label, id, title }: CheckboxProps) {
    return (
        <label
            htmlFor={id}
            title={title}
            className="inline-flex items-center gap-1.5 text-dense text-fg cursor-pointer select-none"
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onCheckedChange(e.target.checked)}
                className="app-checkbox"
            />
            <span>{label}</span>
        </label>
    );
}
