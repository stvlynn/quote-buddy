// Quote/0 desktop renderer.

import {
    NATIVE_WIDTH,
    NATIVE_HEIGHT,
    logicalSize,
    loadImage,
    renderImage,
    renderText,
    renderCompose,
    rotateToNative,
    packNativeToFramebuffer,
    hashBuffer,
} from './canvas.js';

/* ------------------------------------------------------------------ */
/* Element refs                                                        */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const portSelect = $('port-select');
const previewCanvas = $('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const previewHash = $('preview-hash');
const previewInfo = $('preview-info');
const previewSize = $('preview-size');
const replyBox = $('reply-box');
const logBox = $('log-box');
const bannerSpan = $('banner');

const layoutSelect = $('layout-select');
const invertCheckbox = $('invert-checkbox');

/* Image tab */
const imgPickBtn = $('img-pick');
const imgPathSpan = $('img-path');
const imgFitSelect = $('img-fit');
const imgThresholdInput = $('img-threshold');
const imgThresholdValue = $('img-threshold-value');
const imgDitherCheckbox = $('img-dither');

/* Text tab */
const textTitle = $('text-title');
const textBody = $('text-body');
const textFooter = $('text-footer');
const textTitleSize = $('text-title-size');
const textTitleSizeValue = $('text-title-size-value');
const textBodySize = $('text-body-size');
const textBodySizeValue = $('text-body-size-value');
const textBorderCheckbox = $('text-border');

/* Compose tab */
const composeJson = $('compose-json');
const composeLoadSampleBtn = $('compose-load-sample');
const composeValidateBtn = $('compose-validate');

/* Toolbar + actions */
const refreshPortsBtn = $('refresh-ports');
const btnPing = $('btn-ping');
const btnStatus = $('btn-status');
const btnFlashCustom = $('btn-flash-custom');
const btnFlashStock = $('btn-flash-stock');
const btnPreview = $('btn-preview');
const btnSend = $('btn-send');
const btnLogClear = $('log-clear');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
    activeTab: 'image',
    image: { dataUrl: null, path: null, imageEl: null },
    lastFrame: null,
    composeResolvedImages: new Map(), // path → HTMLImageElement (future use)
};

const SAMPLE_COMPOSE = {
    layout: 'landscape-right',
    background: 'white',
    border: true,
    elements: [
        { type: 'text', x: 12, y: 12, w: 200, h: 28, text: 'Quote/0', font_size: 22 },
        { type: 'text', x: 12, y: 50, w: 270, h: 72, text: 'Composed layout: mix text, rects, and lines.\nImages need data-URL in this build.', font_size: 14 },
        { type: 'line', x1: 12, y1: 128, x2: 282, y2: 128, width: 1 },
        { type: 'text', x: 12, y: 132, w: 270, h: 14, text: 'quote0 desktop', font_size: 11 },
    ],
};

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

function log(msg, kind = '') {
    const ts = new Date().toLocaleTimeString();
    const prefix = kind === 'ok' ? '[ok] ' : kind === 'err' ? '[err] ' : '';
    logBox.textContent += `${ts} ${prefix}${msg}\n`;
    logBox.scrollTop = logBox.scrollHeight;
}

btnLogClear.addEventListener('click', () => (logBox.textContent = ''));

function showReply(line, kind = '') {
    replyBox.textContent = line || '—';
    replyBox.className = `log device-reply ${kind}`;
}

/* ------------------------------------------------------------------ */
/* Port discovery                                                      */
/* ------------------------------------------------------------------ */

async function refreshPorts() {
    const previous = portSelect.value;
    const ports = await window.api.listPorts();
    portSelect.innerHTML = '';
    if (ports.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No Quote/0 detected';
        portSelect.appendChild(opt);
        portSelect.disabled = true;
        return;
    }
    portSelect.disabled = false;
    for (const p of ports) {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = `${p.path}${p.manufacturer ? `  (${p.manufacturer})` : ''}`;
        portSelect.appendChild(opt);
    }
    if (previous && [...portSelect.options].some((o) => o.value === previous)) {
        portSelect.value = previous;
    }
}
refreshPortsBtn.addEventListener('click', refreshPorts);

function getPort() {
    return portSelect.value || null;
}

/* ------------------------------------------------------------------ */
/* Tab switching                                                       */
/* ------------------------------------------------------------------ */

document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelector(`[data-tab-panel="${tab}"]`).classList.add('active');
        state.activeTab = tab;
        redrawPreview();
    });
});

/* ------------------------------------------------------------------ */
/* Image tab                                                           */
/* ------------------------------------------------------------------ */

imgPickBtn.addEventListener('click', async () => {
    const result = await window.api.pickImage();
    if (!result) return;
    state.image.path = result.path;
    state.image.dataUrl = result.dataUrl;
    state.image.imageEl = await loadImage(result.dataUrl);
    imgPathSpan.textContent = result.path.split('/').pop();
    imgPathSpan.title = result.path;
    redrawPreview();
});

imgThresholdInput.addEventListener('input', (e) => {
    imgThresholdValue.textContent = e.target.value;
    redrawPreview();
});
imgFitSelect.addEventListener('change', redrawPreview);
imgDitherCheckbox.addEventListener('change', redrawPreview);

/* ------------------------------------------------------------------ */
/* Text tab                                                            */
/* ------------------------------------------------------------------ */

[textTitle, textBody, textFooter].forEach((el) =>
    el.addEventListener('input', redrawPreview)
);
textTitleSize.addEventListener('input', (e) => {
    textTitleSizeValue.textContent = e.target.value;
    redrawPreview();
});
textBodySize.addEventListener('input', (e) => {
    textBodySizeValue.textContent = e.target.value;
    redrawPreview();
});
textBorderCheckbox.addEventListener('change', redrawPreview);

/* Preload a default body so first open shows something. */
textBody.value = 'Quote/0 is awake.\nText, image, and compose modes all\nrender in the desktop app.';

/* ------------------------------------------------------------------ */
/* Compose tab                                                         */
/* ------------------------------------------------------------------ */

composeLoadSampleBtn.addEventListener('click', () => {
    composeJson.value = JSON.stringify(SAMPLE_COMPOSE, null, 2);
    redrawPreview();
});

composeValidateBtn.addEventListener('click', () => {
    try {
        parseCompose();
        log('compose spec parses OK', 'ok');
    } catch (e) {
        log(`compose spec invalid: ${e.message}`, 'err');
    }
});

composeJson.addEventListener('input', () => {
    // Debounce by doing the redraw directly — JSON errors just keep the
    // previous preview.
    redrawPreview();
});
composeJson.value = JSON.stringify(SAMPLE_COMPOSE, null, 2);

function parseCompose() {
    const raw = composeJson.value.trim();
    if (!raw) throw new Error('spec is empty');
    const spec = JSON.parse(raw);
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
        throw new Error('spec must be an object');
    }
    if (!Array.isArray(spec.elements)) {
        throw new Error('spec.elements must be an array');
    }
    return spec;
}

/* ------------------------------------------------------------------ */
/* Layout + preview                                                    */
/* ------------------------------------------------------------------ */

layoutSelect.addEventListener('change', redrawPreview);
invertCheckbox.addEventListener('change', redrawPreview);
btnPreview.addEventListener('click', redrawPreview);

function setPreviewSize(layout) {
    const { w, h } = logicalSize(layout);
    // Draw the preview at 2x logical to avoid browser smoothing blur on HiDPI.
    const scale = 2;
    previewCanvas.width = w;
    previewCanvas.height = h;
    previewCanvas.style.width = `${w * scale}px`;
    previewCanvas.style.height = `${h * scale}px`;
    previewSize.textContent = `${w} × ${h}`;
}

async function redrawPreview() {
    const layout = layoutSelect.value;
    setPreviewSize(layout);

    let composed;
    try {
        if (state.activeTab === 'image') {
            if (!state.image.imageEl) {
                // blank white
                previewCtx.fillStyle = '#fff';
                previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
                previewInfo.textContent = 'Pick an image to render.';
                previewHash.textContent = '—';
                state.lastFrame = null;
                return;
            }
            composed = await renderImage({
                img: state.image.imageEl,
                layout,
                fit: imgFitSelect.value,
                threshold: +imgThresholdInput.value,
                dither: imgDitherCheckbox.checked,
            });
        } else if (state.activeTab === 'text') {
            composed = renderText({
                title: textTitle.value,
                body: textBody.value,
                footer: textFooter.value,
                layout,
                titleSize: +textTitleSize.value,
                bodySize: +textBodySize.value,
                border: textBorderCheckbox.checked,
            });
        } else if (state.activeTab === 'compose') {
            let spec;
            try {
                spec = parseCompose();
            } catch {
                previewInfo.textContent = 'Compose JSON invalid — keeping last preview.';
                return;
            }
            composed = await renderCompose({ spec, layout });
        }
    } catch (err) {
        log(`preview error: ${err.message}`, 'err');
        return;
    }

    if (!composed) return;

    // Paint to on-screen canvas.
    previewCtx.fillStyle = '#fff';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(composed, 0, 0);

    // Pack what the device will actually get.
    const native = rotateToNative(composed, layout);
    const frame = packNativeToFramebuffer(native, { invert: invertCheckbox.checked });
    state.lastFrame = frame;
    previewHash.textContent = hashBuffer(frame);
    const onCount = countBits(frame);
    const ratio = (100 * onCount / (NATIVE_WIDTH * NATIVE_HEIGHT)).toFixed(1);
    previewInfo.textContent = `${onCount} white px (${ratio}%) · invert=${invertCheckbox.checked}`;
}

function countBits(buf) {
    let n = 0;
    for (let i = 0; i < buf.length; ++i) {
        let b = buf[i];
        while (b) { n += b & 1; b >>>= 1; }
    }
    return n;
}

/* ------------------------------------------------------------------ */
/* Device actions                                                      */
/* ------------------------------------------------------------------ */

btnPing.addEventListener('click', async () => {
    const port = getPort();
    if (!port) return log('no port selected', 'err');
    try {
        const reply = await window.api.sendCommand(port, 'PING');
        showReply(reply, reply.trim() === 'PONG' ? 'ok' : 'err');
        log(`PING → ${reply}`);
    } catch (e) {
        showReply(e.message, 'err');
        log(`PING failed: ${e.message}`, 'err');
    }
});

btnStatus.addEventListener('click', async () => {
    const port = getPort();
    if (!port) return log('no port selected', 'err');
    try {
        const reply = await window.api.sendCommand(port, 'STATUS');
        showReply(reply, reply.startsWith('OK') ? 'ok' : 'err');
        log(`STATUS → ${reply}`);
    } catch (e) {
        showReply(e.message, 'err');
        log(`STATUS failed: ${e.message}`, 'err');
    }
});

btnSend.addEventListener('click', async () => {
    const port = getPort();
    if (!port) return log('no port selected', 'err');
    if (!state.lastFrame) {
        await redrawPreview();
        if (!state.lastFrame) return log('no frame to send', 'err');
    }
    btnSend.disabled = true;
    btnSend.textContent = 'Sending…';
    try {
        const reply = await window.api.sendFrame(port, Array.from(state.lastFrame));
        showReply(reply, reply.startsWith('OK') ? 'ok' : 'err');
        log(`sent ${state.lastFrame.length} B → ${reply}`, reply.startsWith('OK') ? 'ok' : 'err');
    } catch (e) {
        showReply(e.message, 'err');
        log(`send failed: ${e.message}`, 'err');
    } finally {
        btnSend.disabled = false;
        btnSend.textContent = 'Send to Quote/0';
    }
});

/* ------------------------------------------------------------------ */
/* Firmware flashing                                                   */
/* ------------------------------------------------------------------ */

window.api.onFirmwareLog((payload) => {
    const prefix = payload.stream === 'stderr' ? '[esptool.err]' : '[esptool]';
    log(`${prefix} ${payload.text.trim()}`);
});

btnFlashCustom.addEventListener('click', async () => {
    const port = getPort();
    if (!port) return log('no port selected', 'err');
    const info = await window.api.customFirmwareAvailable();
    if (!info.available) {
        log(`custom firmware not built. Expected in ${info.buildDir}`, 'err');
        return;
    }
    if (!confirm('Flash custom firmware? This overwrites the active app partition.')) return;
    setFlashing(true);
    log('flashing custom firmware…');
    const res = await window.api.flashCustom(port);
    setFlashing(false);
    if (res.ok) {
        log('custom firmware flashed', 'ok');
        setTimeout(refreshPorts, 1500);
    } else {
        log(`flash failed: ${res.error}`, 'err');
    }
});

btnFlashStock.addEventListener('click', async () => {
    const port = getPort();
    if (!port) return log('no port selected', 'err');
    const binPath = await window.api.pickStockImage();
    if (!binPath) return;
    if (!confirm(`Flash stock image?\n\n${binPath}\n\nThis overwrites the entire 4MB flash.`)) return;
    setFlashing(true);
    log(`flashing stock: ${binPath}`);
    const res = await window.api.flashStock(port, binPath);
    setFlashing(false);
    if (res.ok) {
        log('stock firmware flashed', 'ok');
        setTimeout(refreshPorts, 1500);
    } else {
        log(`flash failed: ${res.error}`, 'err');
    }
});

function setFlashing(on) {
    [btnFlashCustom, btnFlashStock, btnSend, btnPing, btnStatus].forEach((b) =>
        (b.disabled = on)
    );
    bannerSpan.textContent = on ? 'Flashing…' : 'Quote/0 desktop';
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

(async () => {
    await refreshPorts();
    redrawPreview();
})();
