'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi } from '@/lib/api';
import type { ConnState, FirmwareLog, SerialPortInfo } from '@/lib/types';

export interface UseDevice {
    ports: SerialPortInfo[];
    selectedPort: string;
    setSelectedPort: (p: string) => void;
    refresh: () => Promise<void>;

    connState: ConnState;
    connLabel: string;
    setConnState: (state: ConnState, label: string) => void;

    flashing: boolean;
    setFlashing: (v: boolean) => void;

    onFirmwareLog: (cb: (p: FirmwareLog) => void) => () => void;
}

export function useDevice(): UseDevice {
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [selectedPort, setSelectedPort] = useState<string>('');
    const [connState, setConnStateRaw] = useState<ConnState>('idle');
    const [connLabel, setConnLabel] = useState('No device');
    const [flashing, setFlashing] = useState(false);

    const setConnState = useCallback((state: ConnState, label: string) => {
        setConnStateRaw(state);
        setConnLabel(label);
    }, []);

    const refresh = useCallback(async () => {
        const api = getApi();
        if (!api) return;
        const list = await api.listPorts();
        setPorts(list);
        setSelectedPort((prev) => {
            if (prev && list.some((p) => p.path === prev)) return prev;
            return list[0]?.path ?? '';
        });
        if (list.length === 0) {
            setConnStateRaw('idle');
            setConnLabel('No device');
        } else {
            setConnStateRaw((s) => (s === 'busy' ? s : 'connected'));
            setConnLabel((l) => (flashing ? l : 'Ready'));
        }
    }, [flashing]);

    useEffect(() => {
        refresh().catch(() => undefined);
    }, [refresh]);

    const onFirmwareLog = useCallback((cb: (p: FirmwareLog) => void) => {
        const api = getApi();
        if (!api) return () => undefined;
        return api.onFirmwareLog(cb);
    }, []);

    return useMemo<UseDevice>(() => ({
        ports,
        selectedPort,
        setSelectedPort,
        refresh,
        connState,
        connLabel,
        setConnState,
        flashing,
        setFlashing,
        onFirmwareLog,
    }), [ports, selectedPort, refresh, connState, connLabel, setConnState, flashing, onFirmwareLog]);
}
