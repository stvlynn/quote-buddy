'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

/**
 * Standard button.  Variants:
 *   - default  Surface-2 bg, subtle border, use for secondary actions.
 *   - primary  Brand color, the single main action per view.
 *   - ghost    Transparent, hover only — good for inline tool actions.
 *   - danger   Red-tinted, for flash / delete / destructive actions.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'default', size = 'sm', leftIcon, rightIcon, className = '', children, ...rest },
    ref,
) {
    const base =
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium ' +
        'rounded transition-colors font-ui select-none ' +
        'disabled:opacity-45 disabled:cursor-not-allowed ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
        'focus-visible:ring-offset-bg';
    const sizeCls = size === 'md'
        ? 'h-8 px-3 text-dense'
        : 'h-7 px-3 text-dense';
    const variantCls = {
        default: 'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
        primary: 'bg-primary-strong text-white border border-primary-strong hover:bg-primary hover:border-primary',
        ghost:   'bg-transparent text-fg-muted border border-transparent hover:bg-surface-2 hover:text-fg',
        danger:  'bg-transparent text-[#ffb3b3] border border-[rgba(255,122,122,0.35)] hover:bg-err/15 hover:text-white hover:border-err',
    }[variant];

    return (
        <button
            ref={ref}
            className={`${base} ${sizeCls} ${variantCls} ${className}`}
            {...rest}
        >
            {leftIcon}
            {children != null && <span>{children}</span>}
            {rightIcon}
        </button>
    );
});
