// Quote/0 desktop main process.
//
// Responsibilities:
//   1. Open the main BrowserWindow and load the renderer.
//   2. Expose serial IO (list ports, send a framebuffer, query STATUS / PING).
//   3. Drive esptool.py to flash firmware (stock merged image or custom app).
//   4. Provide file-open dialogs for images / firmware / custom layouts.

const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
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

// Packaged-mode paths (resources/firmware-resources/ inside the app bundle).
const PACKAGED_RES_DIR = process.resourcesPath
    ? path.join(process.resourcesPath, 'firmware-resources')
    : null;

/** Locate esptool.py + python. Packaged builds fall back to the user's PATH. */
function resolveEsptool() {
    // 1. Dev-mode bundled Python venv.
    if (DEV_ESPTOOL_PY && fs.existsSync(DEV_ESPTOOL_PY)) {
        return { python: DEV_PYTHON_BIN, esptoolPy: DEV_ESPTOOL_PY, source: 'bundled' };
    }
    // 2. System esptool.py on PATH.
    const sys = spawnSync('which', ['esptool.py']);
    if (sys.status === 0) {
        const p = sys.stdout.toString().trim();
        if (p) return { python: null, esptoolPy: p, source: 'system-esptool.py' };
    }
    // 3. System esptool (new style command).
    const sysNew = spawnSync('which', ['esptool']);
    if (sysNew.status === 0) {
        const p = sysNew.stdout.toString().trim();
        if (p) return { python: null, esptoolPy: null, systemCmd: p, source: 'system-esptool' };
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
 */
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
                const line = rxBuffer.slice(0, nl).replace(/\r$/, '');
                rxBuffer = rxBuffer.slice(nl + 1);
                const waiter = lineWaiters.shift();
                if (waiter) waiter.resolve(line);
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
                // Swallow greeting ('Q0READY ...') that may arrive right after open.
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
                'esptool not found. Install it with:\n' +
                '  python3 -m pip install --user esptool\n' +
                'or make sure `esptool.py` is on your PATH.'
            ));
        }

        let cmd, cmdArgs;
        if (resolved.systemCmd) {
            // system `esptool` (no .py) — call it directly.
            cmd = resolved.systemCmd;
            cmdArgs = args;
        } else if (resolved.python) {
            // bundled venv python + esptool.py script.
            cmd = resolved.python;
            cmdArgs = [resolved.esptoolPy, ...args];
        } else {
            // esptool.py somewhere on PATH — run with system python3.
            cmd = 'python3';
            cmdArgs = [resolved.esptoolPy, ...args];
        }

        onStdout('stdout', `$ ${cmd} ${cmdArgs.join(' ')}\n`);
        const child = spawn(cmd, cmdArgs, {
            cwd: REPO_ROOT || process.cwd(),
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
    if (!fs.existsSync(mergedBinPath)) {
        throw new Error(`stock image not found: ${mergedBinPath}`);
    }
    const args = [
        '--chip', 'esp32c3',
        '--port', port,
        '--baud', '460800',
        'write_flash',
        '0x0', mergedBinPath,
    ];
    await runEsptool(args, onLog);
}

/* ------------------------------------------------------------------ */
/* Window and IPC                                                      */
/* ------------------------------------------------------------------ */

let mainWindow = null;

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
    const defaultPath =
        DEV_STOCK_HINT && fs.existsSync(DEV_STOCK_HINT)
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
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
