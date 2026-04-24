// Quote/0 desktop main process.
//
// Responsibilities:
//   1. Open the main BrowserWindow and load the renderer.
//   2. Expose serial IO (list ports, send a framebuffer, query STATUS / PING).
//   3. Drive esptool.py to flash firmware (stock merged image or custom app).
//   4. Provide file-open dialogs for images / firmware / custom layouts.

const { app, BrowserWindow, ipcMain, dialog, protocol, net, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { SerialPort } = require('serialport');

/* ------------------------------------------------------------------ */
/* Resource resolution: support both dev (run from repo) and packaged  */
/* ------------------------------------------------------------------ */

const IS_PACKAGED = app.isPackaged;
const REPO_ROOT = IS_PACKAGED ? null : path.resolve(__dirname, '..');

// Dev-mode paths (inside the repo).
const DEV_ESPTOOL_PY = REPO_ROOT
    ? path.join(REPO_ROOT, '.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/esptool.py')
    : null;
const DEV_PYTHON_BIN = REPO_ROOT
    ? path.join(REPO_ROOT, '.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/python')
    : null;
const DEV_CUSTOM_BUILD_DIR = REPO_ROOT
    ? path.join(REPO_ROOT, 'firmware/quote0-usb-epd/build')
    : null;
const DEV_STOCK_HINT = REPO_ROOT ? path.join(REPO_ROOT, '.workspace') : null;
const BUNDLED_STOCK_FILENAME = 'quote0-stock-2.0.8-merged.bin';

// Packaged-mode paths (resources/firmware-resources/ inside the app bundle).
const PACKAGED_RES_DIR = process.resourcesPath
    ? path.join(process.resourcesPath, 'firmware-resources')
    : null;

/**
 * Locate esptool.  Packaged macOS GUI apps often launch with a minimal
 * PATH (`/usr/bin:/bin:...`), so we explicitly probe the common places
 * Homebrew / pip-user / pyenv put things.  Returns one of:
 *   { python, esptoolPy, source }   — run `python <esptoolPy>`
 *   { systemCmd, source }           — run the binary directly
 *   { python, module: 'esptool' }   — run `python -m esptool`
 *   null                            — nothing found
 */
function resolveEsptool() {
    // 1. Dev-mode bundled Python venv.
    if (DEV_ESPTOOL_PY && fs.existsSync(DEV_ESPTOOL_PY)) {
        return { python: DEV_PYTHON_BIN, esptoolPy: DEV_ESPTOOL_PY, source: 'bundled' };
    }

    // 2. Extend PATH with common GUI-app-missing locations, then use it
    //    for everything below.
    const extraPaths = [
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/local/sbin',
        path.join(os.homedir(), '.local/bin'),
        path.join(os.homedir(), 'Library/Python/3.12/bin'),
        path.join(os.homedir(), 'Library/Python/3.11/bin'),
        path.join(os.homedir(), 'Library/Python/3.10/bin'),
        path.join(os.homedir(), 'Library/Python/3.9/bin'),
    ].filter((p) => {
        try { return fs.statSync(p).isDirectory(); } catch { return false; }
    });
    const mergedPath = [...extraPaths, process.env.PATH || '']
        .filter(Boolean)
        .join(':');
    const spawnEnv = { ...process.env, PATH: mergedPath };

    // Helper to try `which` in the merged PATH.
    const tryWhich = (name) => {
        const r = spawnSync('/usr/bin/which', [name], { env: spawnEnv });
        if (r.status !== 0) return null;
        const p = r.stdout.toString().trim();
        return p || null;
    };

    // 3. System esptool.py on PATH.
    const espPy = tryWhich('esptool.py');
    if (espPy) return { python: null, esptoolPy: espPy, source: `system-esptool.py (${espPy})` };

    // 4. System esptool (new-style entrypoint).
    const espNew = tryWhich('esptool');
    if (espNew) return { systemCmd: espNew, source: `system-esptool (${espNew})` };

    // 5. Any python3 with an installed `esptool` module (pip install esptool).
    for (const py of ['python3', 'python']) {
        const which = tryWhich(py);
        if (!which) continue;
        const probe = spawnSync(which, ['-c', 'import esptool; print(esptool.__file__)'], { env: spawnEnv });
        if (probe.status === 0) {
            return { python: which, module: 'esptool', source: `${py} -m esptool (${which})` };
        }
    }

    return null;
}

/** Return paths to the three custom-firmware bin files. */
function resolveCustomFirmware() {
    const tryDir = (dir) => {
        if (!dir) return null;
        const bootloader = path.join(dir, 'bootloader.bin');
        const partTable = path.join(dir, 'partition-table.bin');
        const app = path.join(dir, 'quote0_usb_epd.bin');
        // build/ layout: subdirs. packaged layout: flat next to each other.
        const bootloaderSub = path.join(dir, 'bootloader', 'bootloader.bin');
        const partTableSub = path.join(dir, 'partition_table', 'partition-table.bin');

        if (fs.existsSync(bootloader) && fs.existsSync(partTable) && fs.existsSync(app)) {
            return { dir, bootloader, partTable, app };
        }
        if (fs.existsSync(bootloaderSub) && fs.existsSync(partTableSub) && fs.existsSync(app)) {
            return { dir, bootloader: bootloaderSub, partTable: partTableSub, app };
        }
        // Offset-prefixed flat layout used in release zip.
        const flatB = path.join(dir, '0x0_bootloader.bin');
        const flatP = path.join(dir, '0x8000_partition-table.bin');
        const flatA = path.join(dir, '0x10000_quote0_usb_epd.bin');
        if (fs.existsSync(flatB) && fs.existsSync(flatP) && fs.existsSync(flatA)) {
            return { dir, bootloader: flatB, partTable: flatP, app: flatA };
        }
        return null;
    };
    return tryDir(DEV_CUSTOM_BUILD_DIR) || tryDir(PACKAGED_RES_DIR);
}

function resolveStockFirmware() {
    const candidates = [];
    if (DEV_STOCK_HINT) {
        candidates.push({
            path: path.join(DEV_STOCK_HINT, BUNDLED_STOCK_FILENAME),
            source: 'workspace-bundled',
        });
        try {
            const stockInWorkspace = fs.readdirSync(DEV_STOCK_HINT)
                .filter((name) => /^2\.0\.8_merged_.*\.bin$/i.test(name))
                .sort();
            for (const name of stockInWorkspace) {
                candidates.push({ path: path.join(DEV_STOCK_HINT, name), source: 'workspace-stock' });
            }
        } catch {
            // Ignore missing .workspace in packaged mode / fresh clones.
        }
    }
    if (PACKAGED_RES_DIR) {
        candidates.push({
            path: path.join(PACKAGED_RES_DIR, BUNDLED_STOCK_FILENAME),
            source: 'packaged-bundled',
        });
    }

    for (const candidate of candidates) {
        if (candidate.path && fs.existsSync(candidate.path)) {
            return candidate;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Protocol helpers                                                    */
/* ------------------------------------------------------------------ */

const WIDTH = 152;
const HEIGHT = 296;
const FRAME_BYTES = (WIDTH * HEIGHT) / 8;

function crc32(buf) {
    let crc = 0xffffffff >>> 0;
    for (let i = 0; i < buf.length; ++i) {
        crc = (crc ^ buf[i]) >>> 0;
        for (let bit = 0; bit < 8; ++bit) {
            const mask = -(crc & 1) >>> 0;
            crc = ((crc >>> 1) ^ (0xedb88320 & mask)) >>> 0;
        }
    }
    return (~crc) >>> 0;
}

/** Open a serial port, send a one-liner command, wait for a single reply line. */
async function sendTextCommand(portPath, line, timeoutMs = 5000) {
    return openAndExchange(portPath, async (port, waitLine) => {
        port.write(line + '\n');
        return waitLine(timeoutMs);
    });
}

/** Push a framebuffer and wait for the "OK ..." or "ERR ..." reply. */
async function sendFrame(portPath, frameBytes) {
    if (frameBytes.length !== FRAME_BYTES) {
        throw new Error(`frame must be ${FRAME_BYTES} bytes, got ${frameBytes.length}`);
    }
    const crc = crc32(frameBytes).toString(16).padStart(8, '0');
    const header = `Q0IMG1 ${WIDTH} ${HEIGHT} 1BPP ${frameBytes.length} ${crc}\n`;

    return openAndExchange(portPath, async (port, waitLine) => {
        port.write(header);
        port.write(Buffer.from(frameBytes));
        return waitLine(60_000);
    });
}

/**
 * Shared serial scaffold.  Opens the port, drains existing banner output,
 * then lets the caller `write()` and await a single '\n'-terminated response.
 *
 * The Quote/0 firmware uses the same UART for both the Q0 text protocol
 * (request/response) and its ESP-IDF debug logs (e.g. "I (9589) UART_CMD:
 * [RX] 5 bytes ...").  We filter the log lines out here so the renderer
 * only ever sees real protocol replies: lines beginning with `PONG`,
 * `OK`, `ERR`, or `Q0READY` (the banner, which we also drop because the
 * caller is usually waiting for a command-specific reply).
 */
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;
function isProtocolReply(line) {
    const s = line.replace(ANSI_RE, '').trim();
    if (!s) return false;
    // Protocol replies are exactly these four shapes.
    return /^(PONG\b|OK(\s|$)|ERR(\s|$))/.test(s);
}
function cleanLine(line) {
    return line.replace(ANSI_RE, '').replace(/\r$/, '').trim();
}

function openAndExchange(portPath, exchange) {
    return new Promise((resolve, reject) => {
        const port = new SerialPort({
            path: portPath,
            baudRate: 115200,
            autoOpen: false,
        });

        let rxBuffer = '';
        const lineWaiters = [];

        port.on('data', (chunk) => {
            rxBuffer += chunk.toString('ascii');
            let nl;
            while ((nl = rxBuffer.indexOf('\n')) >= 0) {
                const raw = rxBuffer.slice(0, nl).replace(/\r$/, '');
                rxBuffer = rxBuffer.slice(nl + 1);
                // Drop firmware log lines / banners — only surface genuine
                // protocol replies to the waiter.
                if (!isProtocolReply(raw)) continue;
                const waiter = lineWaiters.shift();
                if (waiter) waiter.resolve(cleanLine(raw));
            }
        });

        const waitLine = (timeoutMs) =>
            new Promise((res, rej) => {
                const timer = setTimeout(() => {
                    const i = lineWaiters.indexOf(entry);
                    if (i >= 0) lineWaiters.splice(i, 1);
                    rej(new Error(`serial read timeout after ${timeoutMs} ms`));
                }, timeoutMs);
                const entry = {
                    resolve: (v) => {
                        clearTimeout(timer);
                        res(v);
                    },
                };
                lineWaiters.push(entry);
            });

        port.open(async (err) => {
            if (err) return reject(err);
            try {
                // Swallow any banner/greeting that may arrive right after open.
                await new Promise((r) => setTimeout(r, 150));
                const result = await exchange(port, waitLine);
                port.close(() => resolve(result));
            } catch (e) {
                port.close(() => reject(e));
            }
        });
    });
}

/* ------------------------------------------------------------------ */
/* Firmware flashing                                                   */
/* ------------------------------------------------------------------ */

function runEsptool(args, onStdout) {
    return new Promise((resolve, reject) => {
        const resolved = resolveEsptool();
        if (!resolved) {
            return reject(new Error(
                'esptool not found. Install it with one of:\n' +
                '  pip3 install --user esptool\n' +
                '  brew install esptool\n' +
                'Then restart Quote/0 Desktop.\n' +
                'Looked on PATH and in /opt/homebrew/bin, /usr/local/bin, ~/.local/bin, ~/Library/Python/3.x/bin.'
            ));
        }

        let cmd, cmdArgs;
        if (resolved.systemCmd) {
            cmd = resolved.systemCmd;
            cmdArgs = args;
        } else if (resolved.module) {
            // `python -m esptool ...`
            cmd = resolved.python;
            cmdArgs = ['-m', resolved.module, ...args];
        } else if (resolved.python) {
            cmd = resolved.python;
            cmdArgs = [resolved.esptoolPy, ...args];
        } else {
            // esptool.py found in PATH but without a python — shell it directly.
            cmd = resolved.esptoolPy;
            cmdArgs = args;
        }

        // Propagate the augmented PATH so that children can find any helper
        // binaries they need (e.g. python imports).
        const extraPaths = [
            '/opt/homebrew/bin', '/opt/homebrew/sbin',
            '/usr/local/bin', '/usr/local/sbin',
            path.join(os.homedir(), '.local/bin'),
        ];
        const mergedPath = [...extraPaths, process.env.PATH || ''].filter(Boolean).join(':');

        onStdout('stdout', `[${resolved.source}]\n$ ${cmd} ${cmdArgs.join(' ')}\n`);
        const child = spawn(cmd, cmdArgs, {
            cwd: REPO_ROOT || process.cwd(),
            env: { ...process.env, PATH: mergedPath },
        });
        child.stdout.on('data', (data) => onStdout('stdout', data.toString()));
        child.stderr.on('data', (data) => onStdout('stderr', data.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`esptool exited with code ${code}`));
        });
    });
}

function customAppFilesExist() {
    return resolveCustomFirmware() != null;
}

async function flashCustom(port, onLog) {
    const fw = resolveCustomFirmware();
    if (!fw) {
        throw new Error(
            'Custom firmware not found. Expected one of:\n' +
            `  ${DEV_CUSTOM_BUILD_DIR || '(dev build dir n/a)'}\n` +
            `  ${PACKAGED_RES_DIR || '(bundled firmware dir n/a)'}`
        );
    }
    const args = [
        '--chip', 'esp32c3',
        '--port', port,
        '--baud', '460800',
        '--before', 'default_reset',
        '--after', 'hard_reset',
        'write_flash',
        '--flash_mode', 'dio',
        '--flash_freq', '80m',
        '--flash_size', '4MB',
        '0x0', fw.bootloader,
        '0x8000', fw.partTable,
        '0x10000', fw.app,
    ];
    await runEsptool(args, onLog);
}

async function flashStock(port, mergedBinPath, onLog) {
    const resolved = mergedBinPath
        ? { path: mergedBinPath, source: 'manual-file' }
        : resolveStockFirmware();
    if (!resolved || !fs.existsSync(resolved.path)) {
        throw new Error(
            'Bundled stock image not found. Expected one of:\n' +
            `  ${DEV_STOCK_HINT ? path.join(DEV_STOCK_HINT, BUNDLED_STOCK_FILENAME) : '(dev stock n/a)'}\n` +
            `  ${PACKAGED_RES_DIR ? path.join(PACKAGED_RES_DIR, BUNDLED_STOCK_FILENAME) : '(packaged stock n/a)'}\n` +
            'You can still choose a merged stock .bin manually.'
        );
    }
    const args = [
        '--chip', 'esp32c3',
        '--port', port,
        '--baud', '460800',
        'write_flash',
        '0x0', resolved.path,
    ];
    onLog('stdout', `[stock:${resolved.source}] ${resolved.path}\n`);
    await runEsptool(args, onLog);
}

/* ------------------------------------------------------------------ */
/* Window and IPC                                                      */
/* ------------------------------------------------------------------ */

let mainWindow = null;

function installDisplayMediaHandler() {
    const ses = session.defaultSession;
    if (!ses || typeof ses.setDisplayMediaRequestHandler !== 'function') return;

    ses.setDisplayMediaRequestHandler(async (_request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 0, height: 0 },
                fetchWindowIcons: false,
            });
            const preferred = sources.find((source) => source.display_id) || sources[0];
            if (!preferred) {
                callback({});
                return;
            }
            callback({ video: preferred, audio: null });
        } catch (err) {
            console.error('[display-media] failed to enumerate sources:', err);
            callback({});
        }
    }, {
        useSystemPicker: true,
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        title: 'Quote/0 Desktop',
        backgroundColor: '#0f1115',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const tag = ['log', 'warn', 'err', 'info'][level] || 'log';
        console.log(`[renderer:${tag}] ${sourceId}:${line} ${message}`);
    });

    // Development: point at the Next.js dev server.
    // Production: load the statically-exported Next.js build from ./out
    // through the `app://` custom protocol (so absolute paths like
    // /_next/static/... resolve correctly, which a plain file:// load
    // would not).
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
        mainWindow.loadURL(devUrl);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadURL('app://quote0/index.html');
    }
}

/**
 * Register an `app://` protocol that serves the static Next.js export
 * from `desktop/out/`.  This is required because Next's static build
 * emits absolute asset URLs like `/_next/static/...` which would resolve
 * to the filesystem root under the stock `file://` protocol.
 *
 * We use `app://quote0/...` as the root — the `quote0` host is arbitrary
 * and stays constant so that relative resolution of `/_next/...` stays
 * inside the export.
 */
function registerAppProtocol() {
    const rootDir = path.join(__dirname, 'out');

    protocol.handle('app', (request) => {
        const url = new URL(request.url);
        // url.pathname is "/...something" relative to the host.  We treat
        // an empty or trailing-slash path as /index.html.
        let rel = decodeURIComponent(url.pathname || '/');
        if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
        rel = rel.replace(/^\/+/, '');

        const filePath = path.normalize(path.join(rootDir, rel));
        if (!filePath.startsWith(rootDir)) {
            return new Response('forbidden', { status: 403 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
    });
}

ipcMain.handle('serial:list', async () => {
    const ports = await SerialPort.list();
    return ports
        .map((p) => ({
            path: p.path,
            manufacturer: p.manufacturer || '',
            serialNumber: p.serialNumber || '',
            vendorId: p.vendorId || '',
            productId: p.productId || '',
        }))
        .filter((p) => {
            const likely =
                /usbmodem|usbserial|ttyACM|ttyUSB/.test(p.path) ||
                /303a/i.test(p.vendorId);
            return likely;
        });
});

ipcMain.handle('serial:sendFrame', async (_event, portPath, frameArray) => {
    const frame = Buffer.from(frameArray);
    return await sendFrame(portPath, frame);
});

ipcMain.handle('serial:command', async (_event, portPath, command) => {
    return await sendTextCommand(portPath, command);
});

ipcMain.handle('dialog:pickImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select image',
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] },
        ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const mime =
        filePath.toLowerCase().endsWith('.png') ? 'image/png' :
        filePath.toLowerCase().endsWith('.webp') ? 'image/webp' :
        filePath.toLowerCase().endsWith('.gif') ? 'image/gif' :
        filePath.toLowerCase().endsWith('.bmp') ? 'image/bmp' :
        'image/jpeg';
    return { path: filePath, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
});

ipcMain.handle('dialog:pickStockImage', async () => {
    const bundled = resolveStockFirmware();
    const defaultPath = bundled
        ? path.dirname(bundled.path)
        : DEV_STOCK_HINT && fs.existsSync(DEV_STOCK_HINT)
            ? DEV_STOCK_HINT
            : PACKAGED_RES_DIR && fs.existsSync(PACKAGED_RES_DIR)
                ? PACKAGED_RES_DIR
                : os.homedir();
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select stock firmware (merged .bin)',
        properties: ['openFile'],
        filters: [{ name: 'Merged firmware image', extensions: ['bin'] }],
        defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('firmware:customAvailable', async () => {
    const fw = resolveCustomFirmware();
    return {
        available: fw != null,
        buildDir: fw ? fw.dir : (DEV_CUSTOM_BUILD_DIR || PACKAGED_RES_DIR || 'n/a'),
    };
});

ipcMain.handle('firmware:stockAvailable', async () => {
    const stock = resolveStockFirmware();
    return {
        available: stock != null,
        path: stock?.path || '',
        source: stock?.source || 'missing',
    };
});

ipcMain.handle('firmware:flashCustom', async (event, portPath) => {
    const webContents = event.sender;
    const onLog = (stream, text) => webContents.send('firmware:log', { stream, text });
    try {
        await flashCustom(portPath, onLog);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('firmware:flashStock', async (event, portPath, binPath) => {
    const webContents = event.sender;
    const onLog = (stream, text) => webContents.send('firmware:log', { stream, text });
    try {
        await flashStock(portPath, binPath, onLog);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

/* ------------------------------------------------------------------ */
/* App lifecycle                                                       */
/* ------------------------------------------------------------------ */

// Custom protocol scheme MUST be registered before `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

app.whenReady().then(() => {
    registerAppProtocol();
    installDisplayMediaHandler();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
