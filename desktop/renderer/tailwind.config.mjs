/**
 * Tailwind theme follows the adola ui-patterns conventions:
 *   - `dense` (13px) is the default body in this desktop workbench.
 *   - Semantic colors: primary (brand), ok / warn / err (status).
 *   - Surface hierarchy: bg -> surface-1 -> surface-2 -> surface-3.
 */
/** @type {import('tailwindcss').Config} */
const config = {
    content: [
        './app/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
        './lib/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                bg:                '#0f1115',
                'surface-1':       '#161a21',
                'surface-2':       '#1c222b',
                'surface-3':       '#232a35',
                border:            '#2a3140',
                'border-strong':   '#384255',
                'input-bg':        '#12151b',
                fg:                '#e8ecf2',
                'fg-muted':        '#96a0b5',
                'fg-subtle':       '#6b7489',
                'fg-inverse':      '#0f1115',
                primary:           '#5dade2',
                'primary-strong': '#2884c9',
                ok:                '#5fd28c',
                warn:              '#f4c06a',
                err:               '#ff7a7a',
            },
            fontFamily: {
                ui:   ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
                       'Helvetica Neue', 'Arial', 'sans-serif'],
                mono: ['SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
            },
            fontSize: {
                xs:    ['11px', { lineHeight: '1.4' }],
                sm:    ['12px', { lineHeight: '1.6' }],
                dense: ['13px', { lineHeight: '1.5' }],
                base:  ['14px', { lineHeight: '1.6' }],
                md:    ['15px', { lineHeight: '1.4' }],
                lg:    ['18px', { lineHeight: '1.4' }],
                xl:    ['22px', { lineHeight: '1.3' }],
            },
            borderRadius: {
                sm: '4px',
                md: '6px',
                lg: '10px',
            },
            boxShadow: {
                preview: '0 10px 28px rgba(0, 0, 0, 0.55)',
                menu:    '0 12px 24px rgba(0, 0, 0, 0.45)',
            },
            transitionDuration: {
                fast: '120ms',
                base: '180ms',
            },
        },
    },
    plugins: [],
};

export default config;
