import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
    title: 'Quote/0 Desktop',
    description: 'Control app for the Quote/0 e-paper device.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                {/* Electron's file:// protocol still needs a viewport meta for proper scaling. */}
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {/* CSP mirrors the old static build: only self-hosted assets, inline styles for Tailwind. */}
                <meta
                    httpEquiv="Content-Security-Policy"
                    content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
