'use client';

import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react';

import { Button } from '../ui/Button';
import { Checkbox, Field, FieldValueChip, Select, Slider } from '../ui/fields';
import type { Fit, NormalizedRect } from '@/lib/types';

export interface ScreenMirrorStats {
    captured: number;
    sent: number;
    skipped: number;
    lastHash: string;
}

export interface ScreenTabProps {
    previewVideoRef: RefObject<HTMLVideoElement | null>;
    hasStream: boolean;
    sourceLabel: string;
    sourceSize: { w: number; h: number };
    selection: NormalizedRect | null;
    streaming: boolean;
    canStream: boolean;
    fit: Fit;
    threshold: number;
    dither: boolean;
    fps: number;
    stats: ScreenMirrorStats;
    onStartCapture: () => void;
    onStopCapture: () => void;
    onSelectionChange: (rect: NormalizedRect | null) => void;
    onFitChange: (v: Fit) => void;
    onThresholdChange: (v: number) => void;
    onDitherChange: (v: boolean) => void;
    onFpsChange: (v: number) => void;
    onStartStreaming: () => void;
    onStopStreaming: () => void;
}

interface Point {
    x: number;
    y: number;
}

interface BoxRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function normaliseRect(a: Point, b: Point): NormalizedRect {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    return {
        x: clamp01(x1),
        y: clamp01(y1),
        w: clamp01(x2) - clamp01(x1),
        h: clamp01(y2) - clamp01(y1),
    };
}

function containRect(outerW: number, outerH: number, innerW: number, innerH: number): BoxRect | null {
    if (outerW <= 0 || outerH <= 0 || innerW <= 0 || innerH <= 0) return null;
    const scale = Math.min(outerW / innerW, outerH / innerH);
    const w = innerW * scale;
    const h = innerH * scale;
    return {
        x: (outerW - w) / 2,
        y: (outerH - h) / 2,
        w,
        h,
    };
}

function selectionLabel(selection: NormalizedRect | null, sourceSize: { w: number; h: number }): string {
    if (!selection) return 'Full shared surface';
    const w = Math.max(1, Math.round(selection.w * sourceSize.w));
    const h = Math.max(1, Math.round(selection.h * sourceSize.h));
    const x = Math.round(selection.x * sourceSize.w);
    const y = Math.round(selection.y * sourceSize.h);
    return `${w} × ${h} @ (${x}, ${y})`;
}

export function ScreenTab(p: ScreenTabProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef<Point | null>(null);
    const pointerIdRef = useRef<number | null>(null);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    const [draftSelection, setDraftSelection] = useState<NormalizedRect | null>(null);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const measure = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const displayRect = useMemo(
        () => containRect(containerSize.w, containerSize.h, p.sourceSize.w, p.sourceSize.h),
        [containerSize, p.sourceSize.w, p.sourceSize.h],
    );

    const activeSelection = draftSelection ?? p.selection;

    const overlayStyle = useMemo(() => {
        if (!displayRect || !activeSelection) return null;
        return {
            left: `${displayRect.x + activeSelection.x * displayRect.w}px`,
            top: `${displayRect.y + activeSelection.y * displayRect.h}px`,
            width: `${activeSelection.w * displayRect.w}px`,
            height: `${activeSelection.h * displayRect.h}px`,
        };
    }, [displayRect, activeSelection]);

    const eventToNormalizedPoint = (event: ReactPointerEvent<HTMLDivElement>): Point | null => {
        const host = hostRef.current;
        if (!host || !displayRect) return null;
        const bounds = host.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const relX = (x - displayRect.x) / displayRect.w;
        const relY = (y - displayRect.y) / displayRect.h;
        if (!dragStartRef.current && (relX < 0 || relX > 1 || relY < 0 || relY > 1)) return null;
        return { x: clamp01(relX), y: clamp01(relY) };
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!p.hasStream) return;
        const point = eventToNormalizedPoint(event);
        if (!point) return;
        dragStartRef.current = point;
        pointerIdRef.current = event.pointerId;
        setDraftSelection({ x: point.x, y: point.y, w: 0, h: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId || !dragStartRef.current) return;
        const point = eventToNormalizedPoint(event);
        if (!point) return;
        setDraftSelection(normaliseRect(dragStartRef.current, point));
    };

    const finishSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId || !dragStartRef.current) return;
        const point = eventToNormalizedPoint(event) ?? dragStartRef.current;
        const next = normaliseRect(dragStartRef.current, point);
        dragStartRef.current = null;
        pointerIdRef.current = null;
        setDraftSelection(null);
        if (next.w < 0.01 || next.h < 0.01) return;
        p.onSelectionChange(next);
    };

    const cancelSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) return;
        dragStartRef.current = null;
        pointerIdRef.current = null;
        setDraftSelection(null);
    };

    return (
        <div className="flex flex-col gap-3">
            <Field label="Capture source">
                <div className="flex items-center gap-2">
                    <Button variant="primary" onClick={p.onStartCapture}>
                        {p.hasStream ? 'Reshare screen…' : 'Share screen…'}
                    </Button>
                    <Button
                        onClick={p.onStopCapture}
                        disabled={!p.hasStream}
                        title="Stop screen sharing and release the display stream"
                    >
                        Stop share
                    </Button>
                </div>
            </Field>

            <div className="rounded-md border border-border bg-surface-2/60 px-2.5 py-2 text-sm text-fg-muted">
                <div className="font-medium text-fg">{p.hasStream ? p.sourceLabel : 'No screen shared yet'}</div>
                <div className="mt-0.5 text-xs">
                    {p.hasStream && p.sourceSize.w > 0 && p.sourceSize.h > 0
                        ? `${p.sourceSize.w} × ${p.sourceSize.h}`
                        : 'Pick a display or a window, then drag in the preview to crop it.'}
                </div>
            </div>

            <Field label="Selection" valueSlot={<FieldValueChip>{selectionLabel(p.selection, p.sourceSize)}</FieldValueChip>}>
                <div className="flex gap-2">
                    <Button
                        onClick={() => p.onSelectionChange(null)}
                        disabled={!p.hasStream}
                        title="Use the full shared surface"
                    >
                        Use full frame
                    </Button>
                    <span className="self-center text-xs text-fg-muted">
                        Drag again to redefine the crop.
                    </span>
                </div>
            </Field>

            <div
                ref={hostRef}
                className="relative h-56 overflow-hidden rounded-md border border-border bg-input-bg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishSelection}
                onPointerCancel={cancelSelection}
            >
                {p.hasStream ? (
                    <>
                        <video
                            ref={p.previewVideoRef as RefObject<HTMLVideoElement>}
                            autoPlay
                            muted
                            playsInline
                            className="absolute rounded-sm shadow-preview"
                            style={displayRect ? {
                                left: displayRect.x,
                                top: displayRect.y,
                                width: displayRect.w,
                                height: displayRect.h,
                            } : {
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                        />
                        <div className="absolute inset-0 cursor-crosshair" />
                        {overlayStyle && (
                            <div
                                className="absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(15,17,21,0.48)]"
                                style={overlayStyle}
                            />
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-fg-muted">
                        Share a display or a window to start cropping. The mirrored preview appears here.
                    </div>
                )}
            </div>

            <p className="m-0 text-xs leading-relaxed text-fg-muted">
                Drag in the live preview to crop the shared area. While mirroring, Quote/0 only uploads frames whose 1-bit hash changed.
            </p>

            <Field label="Fit" htmlFor="screen-fit">
                <Select id="screen-fit" value={p.fit} onChange={(e) => p.onFitChange(e.target.value as Fit)}>
                    <option value="contain">Contain</option>
                    <option value="cover">Cover</option>
                    <option value="stretch">Stretch</option>
                </Select>
            </Field>

            <Field
                label="Threshold"
                htmlFor="screen-threshold"
                valueSlot={<FieldValueChip>{p.threshold}</FieldValueChip>}
            >
                <Slider
                    id="screen-threshold"
                    min={0}
                    max={255}
                    value={p.threshold}
                    onValueChange={p.onThresholdChange}
                    aria-label="Screen threshold"
                />
            </Field>

            <Field
                label="Mirror FPS"
                htmlFor="screen-fps"
                valueSlot={<FieldValueChip>{p.fps}</FieldValueChip>}
            >
                <Slider
                    id="screen-fps"
                    min={1}
                    max={8}
                    value={p.fps}
                    onValueChange={p.onFpsChange}
                    aria-label="Mirror FPS"
                />
            </Field>

            <Checkbox
                id="screen-dither"
                checked={p.dither}
                onCheckedChange={p.onDitherChange}
                label="Floyd–Steinberg dither"
            />

            <div className="grid grid-cols-2 gap-2 text-xs text-fg-muted">
                <div className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5">
                    <div className="uppercase tracking-wider">Captured</div>
                    <div className="mt-1 font-mono text-sm text-fg">{p.stats.captured}</div>
                </div>
                <div className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5">
                    <div className="uppercase tracking-wider">Sent</div>
                    <div className="mt-1 font-mono text-sm text-fg">{p.stats.sent}</div>
                </div>
                <div className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5">
                    <div className="uppercase tracking-wider">Skipped</div>
                    <div className="mt-1 font-mono text-sm text-fg">{p.stats.skipped}</div>
                </div>
                <div className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5">
                    <div className="uppercase tracking-wider">Last hash</div>
                    <div className="mt-1 font-mono text-sm text-fg">{p.stats.lastHash}</div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="primary"
                    onClick={p.onStartStreaming}
                    disabled={!p.canStream || p.streaming}
                    title={!p.canStream ? 'Share a screen and select a port first' : 'Start mirroring the selected screen area'}
                >
                    Start live mirror
                </Button>
                <Button
                    onClick={p.onStopStreaming}
                    disabled={!p.streaming}
                    title="Stop the live mirror loop"
                >
                    Stop mirror
                </Button>
                <span className={
                    'text-xs ' + (p.streaming ? 'text-ok' : 'text-fg-muted')
                }>
                    {p.streaming ? 'Mirroring live' : 'Idle'}
                </span>
            </div>
        </div>
    );
}
