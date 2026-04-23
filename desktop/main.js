// Quote/0 desktop main process.
//
// Responsibilities:
//   1. Open the main BrowserWindow and load the renderer.
//   2. Expose serial IO (list ports, send a framebuffer, query STATUS / PING).
//   3. Drive esptool.py to flash firmware (stock merged image or custom app).
//   4. Provide file-open dialogs for images / firmware / custom layouts.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { SerialPort } = require('serialport');

const REPO_ROOT = path.resolve(__dirname, '..');
const ESPTOOL_PY = path.join(
    REPO_ROOT,
    '.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/esptool.py'
);
const PYTHON_BIN = path.join(
    REPO_ROOT,
    '.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/python'
);
const CUSTOM_BUILD_DIR = path.join(
    REPO_ROOT,
    'firmware/quote0-usb-epd/build'
);
const STOCK_IMAGE_DEFAULT_HINT = path.join(REPO_ROOT, '.workspace');

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
        const child = spawn(PYTHON_BIN, [ESPTOOL_PY, ...args], {
            cwd: REPO_ROOT,
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
    return (
        fs.existsSync(path.join(CUSTOM_BUILD_DIR, 'bootloader/bootloader.bin')) &&
        fs.existsSync(path.join(CUSTOM_BUILD_DIR, 'partition_table/partition-table.bin')) &&
        fs.existsSync(path.join(CUSTOM_BUILD_DIR, 'quote0_usb_epd.bin'))
    );
}

async function flashCustom(port, onLog) {
    if (!customAppFilesExist()) {
        throw new Error(
            'Custom firmware not built. Run: firmware/flash_and_diag.sh --skip-flash'
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
        '0x0', path.join(CUSTOM_BUILD_DIR, 'bootloader/bootloader.bin'),
        '0x8000', path.join(CUSTOM_BUILD_DIR, 'partition_table/partition-table.bin'),
        '0x10000', path.join(CUSTOM_BUILD_DIR, 'quote0_usb_epd.bin'),
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
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
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
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select stock firmware (merged .bin)',
        properties: ['openFile'],
        filters: [{ name: 'Merged firmware image', extensions: ['bin'] }],
        defaultPath: fs.existsSync(STOCK_IMAGE_DEFAULT_HINT)
            ? STOCK_IMAGE_DEFAULT_HINT
            : undefined,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('firmware:customAvailable', async () => {
    return {
        available: customAppFilesExist(),
        buildDir: CUSTOM_BUILD_DIR,
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
