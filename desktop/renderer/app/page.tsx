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
    renderText,
    rotateToNative,
} from '@/lib/canvas';
import { buildSpec, sampleElements } from '@/lib/compose';
import type {
    ComposeDoc,
    Fit,
    Layout,
    LogKind,
} from '@/lib/types';

type TabValue = 'image' | 'text' | 'compose';

const TABS: TabDef<TabValue>[] = [
    { value: 'image',   label: 'Image',   title: 'Render an image' },
    { value: 'text',    label: 'Text',    title: 'Compose a simple title/body/footer card' },
    { value: 'compose', label: 'Compose', title: 'Author a multi-element layout visually' },
];

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

    /* ------ preview ------ */
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewSize = useMemo(() => logicalSize(layout), [layout]);
    const [previewHash, setPreviewHash] = useState('—');
    const [previewInfo, setPreviewInfo] = useState('Choose an image or pick a tab.');
    const [reply, setReply] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '—', kind: '' });
    const lastFrameRef = useRef<Uint8Array | null>(null);

    const redrawPreview = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = previewSize.w;
        canvas.height = previewSize.h;

        let composed: HTMLCanvasElement | null = null;
        try {
            if (tab === 'image') {
                if (!imageSource) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    setPreviewInfo('Pick an image to render.');
                    setPreviewHash('—');
                    lastFrameRef.current = null;
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
            } else {
                composed = renderCompose({
                    spec: buildSpec(composeDoc, imageSource?.el ?? null),
                    layout,
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(`preview error: ${message}`, 'err');
            return;
        }
        if (!composed) return;

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
        setPreviewInfo(`${onCount} white px · ${ratio}% coverage · invert=${invert ? 'on' : 'off'}`);
    }, [
        tab, layout, imageSource, imgFit, imgThreshold, imgDither,
        textState, composeDoc, invert, previewSize, log,
    ]);

    /* Redraw on any dependency change */
    useEffect(() => { redrawPreview(); }, [redrawPreview]);

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
        if (!lastFrameRef.current) {
            await redrawPreview();
            if (!lastFrameRef.current) return log('no frame to send', 'err');
        }
        setSending(true);
        device.setConnState('busy', 'Sending');
        try {
            const r = await api.sendFrame(device.selectedPort, Array.from(lastFrameRef.current!));
            const ok = r.startsWith('OK');
            setReplyAndLog(r, ok ? 'ok' : 'err', `sent ${lastFrameRef.current!.length} B → `);
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
        const binPath = await api.pickStockImage();
        if (!binPath) return;
        if (!confirm(`Flash stock image?\n\n${binPath}\n\nThis overwrites the entire 4MB flash. The device will reboot when complete.`)) return;
        device.setFlashing(true);
        device.setConnState('busy', 'Flashing');
        log(`flashing stock: ${binPath}`);
        const res = await api.flashStock(device.selectedPort, binPath);
        device.setFlashing(false);
        if (res.ok) {
            log('stock firmware flashed', 'ok');
            window.setTimeout(() => device.refresh(), 1500);
        } else {
            log(`flash failed: ${res.error}`, 'err');
            device.setConnState('error', 'Flash failed');
        }
    };

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
                    className="panel-shell flex flex-col p-3 gap-3 overflow-y-auto"
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
        </div>
    );
}
