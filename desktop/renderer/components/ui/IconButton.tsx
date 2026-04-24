'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Required — icon-only buttons must have a text label for screen readers. */
    'aria-label': string;
    icon: ReactNode;
    variant?: Variant;
    size?: Size;
    /** When true, hover turns the button red (used for destructive actions on cards). */
    dangerHover?: boolean;
}

/**
 * Square icon-only button.
 *
 * Per the adola ui-patterns rules (ICONS.md §4), icon-only buttons MUST
 * have both `aria-label` and `title`.  We default `title` to `aria-label`
 * so callers don't forget either.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    {
        icon,
        variant = 'ghost',
        size = 'sm',
        dangerHover = false,
        className = '',
        title,
        'aria-label': ariaLabel,
        ...rest
    },
    ref,
) {
    const sizeCls = { xs: 'w-6 h-6', sm: 'w-7 h-7', md: 'w-8 h-8' }[size];
    const variantCls = {
        default: 'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
        primary: 'bg-primary-strong text-white border border-primary-strong hover:bg-primary',
        ghost:   'bg-transparent text-fg-muted border border-transparent hover:bg-surface-2 hover:text-fg',
        danger:  'bg-transparent text-[#ffb3b3] border border-[rgba(255,122,122,0.35)] hover:bg-err/15 hover:text-white hover:border-err',
    }[variant];
    const dangerHoverCls = dangerHover
        ? 'hover:!bg-err/15 hover:!text-err'
        : '';

    return (
        <button
            ref={ref}
            aria-label={ariaLabel}
            title={title ?? ariaLabel}
            className={
                'inline-flex items-center justify-center shrink-0 rounded transition-colors ' +
                'disabled:opacity-45 disabled:cursor-not-allowed ' +
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
                `${sizeCls} ${variantCls} ${dangerHoverCls} ${className}`
            }
            {...rest}
        >
            {icon}
        </button>
    );
});
