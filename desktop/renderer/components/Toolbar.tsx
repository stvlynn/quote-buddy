'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { StatePill } from './ui/StatePill';
import type { ConnState, SerialPortInfo } from '@/lib/types';

export interface ToolbarProps {
    connState: ConnState;
    connLabel: string;
    ports: SerialPortInfo[];
    selectedPort: string;
    onSelectPort: (path: string) => void;
    onRefresh: () => void;
    onPing: () => void;
    onStatus: () => void;
    onFlashStock: () => void;
    onFlashCustom: () => void;
    flashing: boolean;
}

export function Toolbar(p: ToolbarProps) {
    const hasPort = !!p.selectedPort;
    const canCommand = hasPort && !p.flashing;

    return (
        <header
            role="toolbar"
            aria-label="Quote/0 toolbar"
            className="flex items-center gap-4 px-3 py-2 min-h-[44px] bg-surface-1 border-b border-border shrink-0"
        >
            <div className="flex items-center gap-2">
                <span className="font-semibold text-dense tracking-wide">
                    Quote/0
                    <span className="text-fg-subtle font-normal ml-1.5">Desktop</span>
                </span>
            </div>

            <StatePill state={p.connState} label={p.connLabel} />

            <div className="flex items-center gap-2">
                <label htmlFor="port-select" className="text-sm text-fg-muted font-medium">Port</label>
                <select
                    id="port-select"
                    value={p.selectedPort}
                    disabled={p.ports.length === 0}
                    onChange={(e) => p.onSelectPort(e.target.value)}
                    aria-label="Select serial port"
                    className={
                        'h-7 px-2.5 rounded bg-input-bg text-fg border border-border ' +
                        'text-dense cursor-pointer transition-colors ' +
                        'hover:border-border-strong ' +
                        'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ' +
                        'disabled:opacity-60 disabled:cursor-not-allowed'
                    }
                >
                    {p.ports.length === 0
                        ? <option value="">No Quote/0 detected</option>
                        : p.ports.map((port) => (
                            <option key={port.path} value={port.path} title={port.path}>
                                {port.path.replace(/^\/dev\//, '')}
                                {port.manufacturer ? `  (${port.manufacturer})` : ''}
                            </option>
                        ))}
                </select>
                <IconButton
                    icon={<RefreshCw size={14} />}
                    aria-label="Rescan serial ports"
                    title="Rescan serial ports (⌘R)"
                    onClick={p.onRefresh}
                    disabled={p.flashing}
                />
            </div>

            <div className="flex items-center gap-2">
                <Button onClick={p.onPing} disabled={!canCommand} title="Send PING command to the device">Ping</Button>
                <Button onClick={p.onStatus} disabled={!canCommand} title="Ask the device for STATUS">Status</Button>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="danger"
                    disabled={!hasPort || p.flashing}
                    onClick={p.onFlashStock}
                    title="Restore the bundled stock firmware (falls back to manual .bin selection if needed)"
                >
                    Restore stock
                </Button>
                <Button
                    variant="danger"
                    disabled={!hasPort || p.flashing}
                    onClick={p.onFlashCustom}
                    title="Flash the custom Quote/0 app"
                >
                    Flash custom
                </Button>
            </div>

            <div className="ml-auto" />
        </header>
    );
}
