'use client';

import {
    RefreshCw,
    Send,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { PreviewPanel } from '@/components/PreviewPanel';
import { StatusPanel } from '@/components/StatusPanel';
import { Tabs, type TabDef } from '@/components/Tabs';
import { Toolbar } from '@/components/Toolbar';
import { ComposeTab } from '@/components/tabs/ComposeTab';
import { ImageTab } from '@/components/tabs/ImageTab';
import { ScreenTab, type ScreenMirrorStats } from '@/components/tabs/ScreenTab';
import { TextTab, type TextTabState } from '@/components/tabs/TextTab';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select } from '@/components/ui/fields';
import { IconButton } from '@/components/ui/IconButton';
import { useDevice } from '@/hooks/useDevice';
import { useLog } from '@/hooks/useLog';
import { getApi } from '@/lib/api';
import {
    countBits,
    hashBuffer,
    loadImage,
    logicalSize,
    NATIVE_HEIGHT,
    NATIVE_WIDTH,
    packNativeToFramebuffer,
    renderCompose,
    renderImage,
    renderScreenCapture,
    renderText,
    rotateToNative,
} from '@/lib/canvas';
import { buildSpec, sampleElements } from '@/lib/compose';
import type {
    ComposeDoc,
    Fit,
    Layout,
    LogKind,
    NormalizedRect,
} from '@/lib/types';

type TabValue = 'image' | 'text' | 'compose' | 'screen';

const TABS: TabDef<TabValue>[] = [
    { value: 'image',   label: 'Image',   title: 'Render an image' },
    { value: 'text',    label: 'Text',    title: 'Compose a simple title/body/footer card' },
    { value: 'compose', label: 'Compose', title: 'Author a multi-element layout visually' },
    { value: 'screen',  label: 'Screen',  title: 'Mirror a cropped region from your desktop live' },
];

const DEFAULT_SCREEN_STATS: ScreenMirrorStats = {
    captured: 0,
    sent: 0,
    skipped: 0,
    lastHash: '—',
};

function describeScreenSelection(selection: NormalizedRect | null, sourceSize: { w: number; h: number }): string {
    if (!selection) return 'full shared surface';
    const w = Math.max(1, Math.round(selection.w * sourceSize.w));
    const h = Math.max(1, Math.round(selection.h * sourceSize.h));
    const x = Math.round(selection.x * sourceSize.w);
    const y = Math.round(selection.y * sourceSize.h);
    return `${w}×${h} @ (${x}, ${y})`;
}

function attachMediaStream(video: HTMLVideoElement | null, stream: MediaStream | null) {
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) {
        video.muted = true;
        video.playsInline = true;
        void video.play().catch(() => undefined);
    }
}

export default function Page() {
    /* ------ device / log ------ */
    const device = useDevice();
    const { lines, log, clear: clearLog } = useLog();

    /* ------ tab / shared state ------ */
    const [tab, setTab] = useState<TabValue>('image');
    const [layout, setLayout] = useState<Layout>('landscape-right');
    const [invert, setInvert] = useState(true);

    /* ------ image tab ------ */
    const [imageSource, setImageSource] = useState<{
        path: string; dataUrl: string; el: HTMLImageElement;
    } | null>(null);
    const [imgFit, setImgFit] = useState<Fit>('contain');
    const [imgThreshold, setImgThreshold] = useState(160);
    const [imgDither, setImgDither] = useState(false);

    /* ------ text tab ------ */
    const [textState, setTextState] = useState<TextTabState>({
        title: 'Quote/0',
        body: 'Quote/0 is awake.\nText, image, and compose modes all\nrender in the desktop app.',
        footer: '',
        titleSize: 22,
        bodySize: 15,
        border: true,
    });
    const patchText = useCallback((patch: Partial<TextTabState>) => {
        setTextState((s) => ({ ...s, ...patch }));
    }, []);

    /* ------ compose tab ------ */
    const [composeDoc, setComposeDoc] = useState<ComposeDoc>({
        background: 'white',
        border: true,
        elements: sampleElements(),
    });

    /* ------ screen tab ------ */
    const [screenFit, setScreenFit] = useState<Fit>('contain');
    const [screenThreshold, setScreenThreshold] = useState(160);
    const [screenDither, setScreenDither] = useState(false);
    const [screenFps, setScreenFps] = useState(2);
    const [screenSelection, setScreenSelection] = useState<NormalizedRect | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [screenSourceLabel, setScreenSourceLabel] = useState('No screen shared yet');
    const [screenSourceSize, setScreenSourceSize] = useState({ w: 0, h: 0 });
    const [screenStreaming, setScreenStreaming] = useState(false);
    const [screenStats, setScreenStats] = useState<ScreenMirrorStats>(DEFAULT_SCREEN_STATS);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenSourceVideoRef = useRef<HTMLVideoElement | null>(null);
    const screenPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
    const screenStreamingRef = useRef(false);
    const screenSendInFlightRef = useRef(false);
    const screenMirrorTimerRef = useRef<number | null>(null);
    const screenLastSentHashRef = useRef('');

    /* ------ preview ------ */
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewSize = useMemo(() => logicalSize(layout), [layout]);
    const [previewHash, setPreviewHash] = useState('—');
    const [previewInfo, setPreviewInfo] = useState('Choose an image or pick a tab.');
    const [reply, setReply] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '—', kind: '' });
    const lastFrameRef = useRef<Uint8Array | null>(null);

    const clearPreview = useCallback((message: string) => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            canvas.width = previewSize.w;
            canvas.height = previewSize.h;
            if (ctx) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        setPreviewInfo(message);
        setPreviewHash('—');
        lastFrameRef.current = null;
    }, [previewSize]);

    const presentPreview = useCallback((composed: HTMLCanvasElement, infoPrefix = '') => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = previewSize.w;
        canvas.height = previewSize.h;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(composed, 0, 0);

        const native = rotateToNative(composed, layout);
        const frame = packNativeToFramebuffer(native, { invert });
        lastFrameRef.current = frame;
        setPreviewHash(hashBuffer(frame));
        const onCount = countBits(frame);
        const ratio = (100 * onCount / (NATIVE_WIDTH * NATIVE_HEIGHT)).toFixed(1);
        const metrics = `${onCount} white px · ${ratio}% coverage · invert=${invert ? 'on' : 'off'}`;
        setPreviewInfo(infoPrefix ? `${infoPrefix} · ${metrics}` : metrics);
        return frame;
    }, [invert, layout, previewSize]);

    const redrawPreview = useCallback(async () => {
        let composed: HTMLCanvasElement | null = null;
        let infoPrefix = '';
        try {
            if (tab === 'image') {
                if (!imageSource) {
                    clearPreview('Pick an image to render.');
                    return;
                }
                composed = renderImage({
                    img: imageSource.el,
                    layout,
                    fit: imgFit,
                    threshold: imgThreshold,
                    dither: imgDither,
                });
            } else if (tab === 'text') {
                composed = renderText({
                    title: textState.title,
                    body: textState.body,
                    footer: textState.footer,
                    layout,
                    titleSize: textState.titleSize,
                    bodySize: textState.bodySize,
                    border: textState.border,
                });
            } else if (tab === 'compose') {
                composed = renderCompose({
                    spec: buildSpec(composeDoc, imageSource?.el ?? null),
                    layout,
                });
            } else {
                const video = screenSourceVideoRef.current;
                if (!screenStream) {
                    clearPreview('Share a screen to preview it here.');
                    return;
                }
                if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
                    clearPreview('Waiting for shared screen frames…');
                    return;
                }
                composed = renderScreenCapture({
                    video,
                    layout,
                    fit: screenFit,
                    threshold: screenThreshold,
                    dither: screenDither,
                    crop: screenSelection,
                });
                infoPrefix = `screen: ${describeScreenSelection(screenSelection, { w: video.videoWidth, h: video.videoHeight })}`;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(`preview error: ${message}`, 'err');
            return;
        }
        if (!composed) return;
        presentPreview(composed, infoPrefix);
    }, [
        clearPreview,
        composeDoc,
        imageSource,
        imgDither,
        imgFit,
        imgThreshold,
        layout,
        log,
        presentPreview,
        screenDither,
        screenFit,
        screenSelection,
        screenStream,
        screenThreshold,
        tab,
        textState,
    ]);

    /* Redraw on any dependency change */
    useEffect(() => { redrawPreview(); }, [redrawPreview]);

    /* ------ screen capture lifecycle ------ */
    useEffect(() => {
        screenStreamRef.current = screenStream;
    }, [screenStream]);

    useEffect(() => {
        attachMediaStream(screenSourceVideoRef.current, screenStream);
        attachMediaStream(screenPreviewVideoRef.current, screenStream);
    }, [screenStream, tab]);

    useEffect(() => {
        const video = screenSourceVideoRef.current;
        if (!video) return;
        const updateSize = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                setScreenSourceSize({ w: video.videoWidth, h: video.videoHeight });
            }
        };
        updateSize();
        video.addEventListener('loadedmetadata', updateSize);
        video.addEventListener('loadeddata', updateSize);
        return () => {
            video.removeEventListener('loadedmetadata', updateSize);
            video.removeEventListener('loadeddata', updateSize);
        };
    }, [screenStream]);

    const stopScreenStreamingInternal = useCallback((message?: string) => {
        setScreenStreaming(false);
        screenStreamingRef.current = false;
        screenSendInFlightRef.current = false;
        if (screenMirrorTimerRef.current != null) {
            window.clearInterval(screenMirrorTimerRef.current);
            screenMirrorTimerRef.current = null;
        }
        if (message) log(message);
        if (!device.flashing) {
            if (device.selectedPort) device.setConnState('connected', 'Ready');
            else device.setConnState('idle', 'No device');
        }
    }, [device, log]);

    const handleStopScreenStreaming = useCallback(() => {
        stopScreenStreamingInternal('screen mirror stopped');
    }, [stopScreenStreamingInternal]);

    const stopScreenCapture = useCallback((message?: string) => {
        stopScreenStreamingInternal();
        const stream = screenStreamRef.current;
        if (stream) {
            for (const track of stream.getTracks()) {
                track.onended = null;
                track.stop();
            }
        }
        screenStreamRef.current = null;
        setScreenStream(null);
        setScreenSourceLabel('No screen shared yet');
        setScreenSourceSize({ w: 0, h: 0 });
        if (screenSourceVideoRef.current) screenSourceVideoRef.current.srcObject = null;
        if (screenPreviewVideoRef.current) screenPreviewVideoRef.current.srcObject = null;
        if (message) log(message);
    }, [log, stopScreenStreamingInternal]);

    const handleStartScreenCapture = useCallback(async () => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            log('screen capture is not available in this Electron build', 'err');
            return;
        }
        try {
            stopScreenCapture();
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: Math.max(1, Math.min(screenFps, 8)) },
                audio: false,
            });
            const [track] = stream.getVideoTracks();
            if (!track) {
                stream.getTracks().forEach((item) => item.stop());
                throw new Error('no video track returned from getDisplayMedia');
            }
            track.onended = () => {
                stopScreenCapture('screen sharing ended');
            };
            const settings = track.getSettings();
            setScreenStream(stream);
            setScreenSourceLabel(track.label || 'Shared screen');
            setScreenSourceSize({
                w: typeof settings.width === 'number' ? settings.width : 0,
                h: typeof settings.height === 'number' ? settings.height : 0,
            });
            setScreenStats(DEFAULT_SCREEN_STATS);
            setTab('screen');
            log(`screen capture ready: ${track.label || 'display'}`, 'ok');
        } catch (err) {
            const name = err instanceof DOMException ? err.name : '';
            if (name === 'AbortError') {
                log('screen capture cancelled');
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            if (name === 'NotSupportedError' || /not supported/i.test(message)) {
                log('screen capture failed: this build is missing Electron display-media support; restart after updating the desktop app', 'err');
                return;
            }
            log(`screen capture failed: ${message}`, 'err');
        }
    }, [log, screenFps, stopScreenCapture]);

    const tickScreenMirror = useCallback(async () => {
        if (!screenStreamingRef.current || screenSendInFlightRef.current) return;
        const api = getApi();
        if (!api || !device.selectedPort) return;
        const video = screenSourceVideoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
            return;
        }

        let composed: HTMLCanvasElement;
        try {
            composed = renderScreenCapture({
                video,
                layout,
                fit: screenFit,
                threshold: screenThreshold,
                dither: screenDither,
                crop: screenSelection,
            });
        } catch {
            return;
        }

        const infoPrefix = `screen: ${describeScreenSelection(screenSelection, { w: video.videoWidth, h: video.videoHeight })}`;
        const frame = presentPreview(composed, infoPrefix);
        if (!frame) return;
        const frameHash = hashBuffer(frame);

        if (frameHash === screenLastSentHashRef.current) {
            setScreenStats((s) => ({
                ...s,
                captured: s.captured + 1,
                skipped: s.skipped + 1,
                lastHash: frameHash,
            }));
            return;
        }

        setScreenStats((s) => ({
            ...s,
            captured: s.captured + 1,
            lastHash: frameHash,
        }));

        screenSendInFlightRef.current = true;
        try {
            const r = await api.sendFrame(device.selectedPort, Array.from(frame));
            const ok = r.startsWith('OK');
            setReply({ text: r, kind: ok ? 'ok' : 'err' });
            if (!ok) {
                log(`screen mirror failed: ${r}`, 'err');
                device.setConnState('error', 'Mirror failed');
                setScreenStreaming(false);
                screenStreamingRef.current = false;
                return;
            }
            screenLastSentHashRef.current = frameHash;
            setScreenStats((s) => ({
                ...s,
                sent: s.sent + 1,
                lastHash: frameHash,
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setReply({ text: message, kind: 'err' });
            log(`screen mirror failed: ${message}`, 'err');
            device.setConnState('error', 'Mirror failed');
            setScreenStreaming(false);
            screenStreamingRef.current = false;
        } finally {
            screenSendInFlightRef.current = false;
        }
    }, [
        device,
        layout,
        log,
        presentPreview,
        screenDither,
        screenFit,
        screenSelection,
        screenThreshold,
    ]);

    useEffect(() => {
        screenStreamingRef.current = screenStreaming;
        if (screenMirrorTimerRef.current != null) {
            window.clearInterval(screenMirrorTimerRef.current);
            screenMirrorTimerRef.current = null;
        }
        if (!screenStreaming) return;
        device.setConnState('busy', 'Mirroring');
        const interval = Math.max(150, Math.round(1000 / Math.max(1, screenFps)));
        void tickScreenMirror();
        screenMirrorTimerRef.current = window.setInterval(() => {
            void tickScreenMirror();
        }, interval);
        return () => {
            if (screenMirrorTimerRef.current != null) {
                window.clearInterval(screenMirrorTimerRef.current);
                screenMirrorTimerRef.current = null;
            }
        };
    }, [device, screenFps, screenStreaming, tickScreenMirror]);

    useEffect(() => () => {
        stopScreenCapture();
    }, [stopScreenCapture]);

    /* ------ firmware log stream ------ */
    useEffect(() => {
        return device.onFirmwareLog((payload) => {
            const prefix = payload.stream === 'stderr' ? '[esptool.err]' : '[esptool]';
            log(`${prefix} ${payload.text.trim()}`);
        });
    }, [device, log]);

    /* ------ device actions ------ */
    const setReplyAndLog = (text: string, kind: LogKind, prefix: string) => {
        setReply({ text, kind: kind || '' });
        log(`${prefix}${text}`, kind);
    };

    const handlePing = async () => {
        const api = getApi();
        if (!api || !device.selectedPort) return log('no port selected', 'err');
        try {
            const r = await api.sendCommand(device.selectedPort, 'PING');
            const ok = r.trim() === 'PONG';
            setReplyAndLog(r, ok ? 'ok' : 'err', 'PING → ');
            if (!ok) device.setConnState('error', 'PING failed');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setReplyAndLog(message, 'err', 'PING failed: ');
            device.setConnState('error', 'PING failed');
        }
    };

    const handleStatus = async () => {
        const api = getApi();
        if (!api || !device.selectedPort) return log('no port selected', 'err');
        try {
            const r = await api.sendCommand(device.selectedPort, 'STATUS');
            const ok = r.startsWith('OK');
            setReplyAndLog(r, ok ? 'ok' : 'err', 'STATUS → ');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setReplyAndLog(message, 'err', 'STATUS failed: ');
            device.setConnState('error', 'STATUS failed');
        }
    };

    const [sending, setSending] = useState(false);

    const handleSend = useCallback(async () => {
        const api = getApi();
        if (!api || !device.selectedPort) return log('no port selected', 'err');
        let frame = lastFrameRef.current;
        if (!frame) {
            await redrawPreview();
            frame = lastFrameRef.current;
            if (!frame) return log('no frame to send', 'err');
        }
        setSending(true);
        device.setConnState('busy', 'Sending');
        try {
            const frameBytes = Array.from(frame);
            const r = await api.sendFrame(device.selectedPort, frameBytes);
            const ok = r.startsWith('OK');
            setReplyAndLog(r, ok ? 'ok' : 'err', `sent ${frame.length} B → `);
            device.setConnState(ok ? 'connected' : 'error', ok ? 'Ready' : 'Send failed');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setReplyAndLog(message, 'err', 'send failed: ');
            device.setConnState('error', 'Send failed');
        } finally {
            setSending(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [device.selectedPort, redrawPreview]);

    const handlePickImage = async () => {
        const api = getApi();
        if (!api) return;
        const result = await api.pickImage();
        if (!result) return;
        const el = await loadImage(result.dataUrl);
        setImageSource({ path: result.path, dataUrl: result.dataUrl, el });
    };

    const handleFlashCustom = async () => {
        const api = getApi();
        if (!api || !device.selectedPort) return log('no port selected', 'err');
        const info = await api.customFirmwareAvailable();
        if (!info.available) {
            log(`custom firmware not built. Expected in ${info.buildDir}`, 'err');
            return;
        }
        if (!confirm('Flash custom firmware?\n\nThis overwrites the active app partition.\nThe device will reboot when complete.')) return;
        device.setFlashing(true);
        device.setConnState('busy', 'Flashing');
        log('flashing custom firmware…');
        const res = await api.flashCustom(device.selectedPort);
        device.setFlashing(false);
        if (res.ok) {
            log('custom firmware flashed', 'ok');
            window.setTimeout(() => device.refresh(), 1500);
        } else {
            log(`flash failed: ${res.error}`, 'err');
            device.setConnState('error', 'Flash failed');
        }
    };

    const handleFlashStock = async () => {
        const api = getApi();
        if (!api || !device.selectedPort) return log('no port selected', 'err');

        const stock = await api.stockFirmwareAvailable();
        let binPath = stock.available ? stock.path : '';
        let sourceLabel = stock.available ? `built-in stock image (${stock.source})` : 'manual stock image';

        if (!binPath) {
            log('bundled stock firmware not found; falling back to manual file picker', 'err');
            const picked = await api.pickStockImage();
            if (!picked) return;
            binPath = picked;
            sourceLabel = 'manual stock image';
        }

        if (!confirm(`Restore stock firmware?\n\n${binPath}\n\nSource: ${sourceLabel}\n\nThis overwrites the entire 4MB flash. The device will reboot when complete.`)) return;
        device.setFlashing(true);
        device.setConnState('busy', 'Flashing');
        log(`restoring stock firmware: ${binPath}`);
        const res = await api.flashStock(device.selectedPort, stock.available ? undefined : binPath);
        device.setFlashing(false);
        if (res.ok) {
            log('stock firmware restored', 'ok');
            window.setTimeout(() => device.refresh(), 1500);
        } else {
            log(`flash failed: ${res.error}`, 'err');
            device.setConnState('error', 'Flash failed');
        }
    };

    const handleStartScreenStreaming = useCallback(() => {
        if (!device.selectedPort) {
            log('no port selected', 'err');
            return;
        }
        if (!screenStreamRef.current) {
            log('share a screen first', 'err');
            return;
        }
        screenLastSentHashRef.current = '';
        setScreenStats(DEFAULT_SCREEN_STATS);
        setScreenStreaming(true);
        device.setConnState('busy', 'Mirroring');
        log(`screen mirror started (${screenFps} fps max)`);
    }, [device, log, screenFps]);

    /* ------ keyboard shortcuts ------ */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (e.key.toLowerCase() === 'r' && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                device.refresh();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!sending && device.selectedPort && !device.flashing) handleSend();
                return;
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [device, handleSend, sending]);

    const sourceImageName = imageSource?.path.split('/').pop() ?? null;
    const canSend = !!device.selectedPort && !sending && !device.flashing;
    const canScreenMirror = !!device.selectedPort && !!screenStream && !device.flashing;
    const sendTitle = !device.selectedPort
        ? 'Select a port first'
        : device.flashing
            ? 'Busy — flashing in progress'
            : 'Send the current frame to the device (⌘↵)';

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <Toolbar
                connState={device.connState}
                connLabel={device.connLabel}
                ports={device.ports}
                selectedPort={device.selectedPort}
                onSelectPort={device.setSelectedPort}
                onRefresh={() => device.refresh()}
                onPing={handlePing}
                onStatus={handleStatus}
                onFlashStock={handleFlashStock}
                onFlashCustom={handleFlashCustom}
                flashing={device.flashing}
            />

            <main
                className="
                    flex-1 grid gap-3 p-3 min-h-0
                    grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto]
                    lg:grid-cols-[340px_minmax(0,1fr)_320px] lg:grid-rows-1
                "
            >
                {/* LEFT — controls */}
                <section
                    aria-label="Composer controls"
                    className="panel-shell flex flex-col min-h-0 p-3 gap-3 overflow-x-hidden overflow-y-auto"
                >
                    <Tabs tabs={TABS} value={tab} onValueChange={setTab}>
                        {tab === 'image' && (
                            <ImageTab
                                sourcePath={imageSource?.path ?? null}
                                fit={imgFit}
                                threshold={imgThreshold}
                                dither={imgDither}
                                onPick={handlePickImage}
                                onFitChange={setImgFit}
                                onThresholdChange={setImgThreshold}
                                onDitherChange={setImgDither}
                            />
                        )}
                        {tab === 'text' && (
                            <TextTab state={textState} onChange={patchText} />
                        )}
                        {tab === 'compose' && (
                            <ComposeTab
                                doc={composeDoc}
                                setDoc={setComposeDoc}
                                sourceImage={imageSource?.el ?? null}
                                sourceImageName={sourceImageName}
                                onLog={log}
                            />
                        )}
                        {tab === 'screen' && (
                            <ScreenTab
                                previewVideoRef={screenPreviewVideoRef}
                                hasStream={!!screenStream}
                                sourceLabel={screenSourceLabel}
                                sourceSize={screenSourceSize}
                                selection={screenSelection}
                                streaming={screenStreaming}
                                canStream={canScreenMirror}
                                fit={screenFit}
                                threshold={screenThreshold}
                                dither={screenDither}
                                fps={screenFps}
                                stats={screenStats}
                                onStartCapture={handleStartScreenCapture}
                                onStopCapture={() => stopScreenCapture('screen sharing stopped')}
                                onSelectionChange={setScreenSelection}
                                onFitChange={setScreenFit}
                                onThresholdChange={setScreenThreshold}
                                onDitherChange={setScreenDither}
                                onFpsChange={setScreenFps}
                                onStartStreaming={handleStartScreenStreaming}
                                onStopStreaming={handleStopScreenStreaming}
                            />
                        )}
                    </Tabs>

                    <Field label="Layout" htmlFor="layout-select">
                        <Select
                            id="layout-select"
                            value={layout}
                            onChange={(e) => setLayout(e.target.value as Layout)}
                        >
                            <option value="native">Native (152×296)</option>
                            <option value="native-180">Native 180°</option>
                            <option value="landscape-left">Landscape left</option>
                            <option value="landscape-right">Landscape right (296×152)</option>
                        </Select>
                    </Field>

                    <Checkbox
                        id="invert-checkbox"
                        checked={invert}
                        onCheckedChange={setInvert}
                        label="Invert before upload"
                    />

                    <div className="flex gap-2 mt-auto pt-3 border-t border-border">
                        <IconButton
                            icon={<RefreshCw size={14} />}
                            aria-label="Redraw preview"
                            title="Recompute preview from current inputs"
                            size="md"
                            onClick={redrawPreview}
                        />
                        <Button
                            variant="primary"
                            size="md"
                            className="flex-1 font-semibold"
                            disabled={!canSend}
                            title={sendTitle}
                            onClick={handleSend}
                            leftIcon={<Send size={14} />}
                            rightIcon={<span className="inline-flex items-center px-1 h-4 min-w-[16px] justify-center ml-auto bg-white/15 rounded font-mono text-[10px] opacity-90">⌘↵</span>}
                        >
                            {sending ? 'Sending…' : 'Send to Quote/0'}
                        </Button>
                    </div>
                </section>

                {/* CENTER — preview */}
                <PreviewPanel
                    canvasRef={canvasRef}
                    size={previewSize}
                    hash={previewHash}
                    info={previewInfo}
                />

                {/* RIGHT — log */}
                <StatusPanel
                    reply={reply}
                    log={lines}
                    onClearLog={clearLog}
                />
            </main>

            <video ref={screenSourceVideoRef} className="hidden" muted playsInline aria-hidden="true" />
        </div>
    );
}
