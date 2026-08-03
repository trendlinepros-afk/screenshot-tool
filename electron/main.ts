import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  nativeImage,
  dialog,
  screen,
  shell,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { captureAllDisplays, DisplayCapture } from './capture';
import {
  AppSettings,
  getSettings,
  updateSettings,
  timestampedFilename,
} from './settings';
import { transcodeToMp4 } from './ffmpeg';
import {
  initUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getLastStatus,
} from './updater';

interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let recorderBorderWindow: BrowserWindow | null = null;

/** Pre-warmed overlay windows, one per display, keyed by display id. */
const overlayWindows = new Map<number, BrowserWindow>();
let captureActive = false;
let currentCaptures: DisplayCapture[] = [];
let quitting = false;

// ---------------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Second launch: surface the settings window so the user sees the app.
    openSettingsWindow();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPage(win: BrowserWindow, page: 'overlay' | 'settings' | 'recorder'): void {
  if (DEV_SERVER_URL) {
    win.loadURL(`${DEV_SERVER_URL}/${page}.html`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', `${page}.html`));
  }
}

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function appIcon(): Electron.NativeImage {
  const iconFile = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', '..', 'build', 'icon.png');
  return nativeImage.createFromPath(iconFile);
}

// ---------------------------------------------------------------------------
// Overlay windows (pre-warmed for <200ms hotkey response)
// ---------------------------------------------------------------------------

function createOverlayWindow(displayId: number, bounds: Electron.Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#111111',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenuBarVisibility(false);
  loadPage(win, 'overlay');
  win.on('closed', () => {
    if (overlayWindows.get(displayId) === win) overlayWindows.delete(displayId);
  });
  return win;
}

function prewarmOverlays(): void {
  for (const display of screen.getAllDisplays()) {
    if (!overlayWindows.has(display.id)) {
      overlayWindows.set(display.id, createOverlayWindow(display.id, display.bounds));
    }
  }
  // Drop windows for disconnected displays.
  const liveIds = new Set(screen.getAllDisplays().map((d) => d.id));
  for (const [id, win] of overlayWindows) {
    if (!liveIds.has(id)) {
      win.destroy();
      overlayWindows.delete(id);
    }
  }
}

async function startCapture(): Promise<void> {
  if (captureActive || recorderWindow) return;
  captureActive = true;
  try {
    currentCaptures = await captureAllDisplays();
    prewarmOverlays();
    for (const cap of currentCaptures) {
      const win = overlayWindows.get(cap.display.id);
      if (!win || win.isDestroyed()) continue;
      win.setBounds(cap.display.bounds);
      const payload = {
        displayId: cap.display.id,
        bitmap: cap.bitmap,
        bitmapWidth: cap.bitmapWidth,
        bitmapHeight: cap.bitmapHeight,
        bounds: cap.display.bounds,
      };
      // The overlay page reloads after each capture; if the hotkey fires again
      // mid-reload, wait for the load so the init message isn't dropped.
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => {
          if (!win.isDestroyed() && captureActive) win.webContents.send('overlay:init', payload);
        });
      } else {
        win.webContents.send('overlay:init', payload);
      }
      win.show();
    }
    // Focus the overlay on the display with the cursor so keys work there.
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    overlayWindows.get(cursorDisplay.id)?.focus();
  } catch (err) {
    captureActive = false;
    console.error('Capture failed:', err);
  }
}

function closeOverlays(): void {
  captureActive = false;
  for (const win of overlayWindows.values()) {
    if (!win.isDestroyed()) {
      win.hide();
      // Reset the page so the next capture starts clean and stays pre-warmed.
      loadPage(win, 'overlay');
    }
  }
}

// ---------------------------------------------------------------------------
// Recorder windows
// ---------------------------------------------------------------------------

const BORDER = 3;

function openRecorder(displayId: number, region: RegionRect): void {
  const capture = currentCaptures.find((c) => c.display.id === displayId);
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  if (!capture) {
    closeOverlays();
    return;
  }
  closeOverlays();

  const absRegion = {
    x: display.bounds.x + region.x,
    y: display.bounds.y + region.y,
    width: region.width,
    height: region.height,
  };

  // Click-through outline drawn entirely outside the recorded region so it
  // never appears in the video.
  recorderBorderWindow = new BrowserWindow({
    x: absRegion.x - BORDER,
    y: absRegion.y - BORDER,
    width: absRegion.width + BORDER * 2,
    height: absRegion.height + BORDER * 2,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
  });
  recorderBorderWindow.setIgnoreMouseEvents(true);
  recorderBorderWindow.setAlwaysOnTop(true, 'screen-saver');
  recorderBorderWindow.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        `<body style="margin:0;background:transparent">
           <div style="position:fixed;inset:0;border:${BORDER}px solid #ef4444;border-radius:2px;box-sizing:border-box"></div>
         </body>`
      )
  );

  // Control bar below the region (or above when there is no room).
  const barW = 320;
  const barH = 56;
  let barY = absRegion.y + absRegion.height + BORDER + 8;
  if (barY + barH > display.bounds.y + display.bounds.height) {
    barY = absRegion.y - barH - BORDER - 8;
  }
  if (barY < display.bounds.y) {
    barY = absRegion.y + absRegion.height - barH - 8;
  }
  const barX = Math.min(
    Math.max(absRegion.x, display.bounds.x),
    display.bounds.x + display.bounds.width - barW
  );

  recorderWindow = new BrowserWindow({
    x: barX,
    y: Math.max(barY, display.bounds.y),
    width: barW,
    height: barH,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  recorderWindow.setAlwaysOnTop(true, 'screen-saver');
  loadPage(recorderWindow, 'recorder');

  const settings = getSettings();
  recorderWindow.webContents.once('did-finish-load', () => {
    recorderWindow?.webContents.send('recorder:init', {
      sourceId: capture.sourceId,
      displayId,
      region,
      displaySize: { width: display.size.width, height: display.size.height },
      scaleFactor: display.scaleFactor,
      fps: settings.videoFps,
      recordSystemAudio: settings.recordSystemAudio,
      recordMicrophone: settings.recordMicrophone,
    });
  });

  recorderWindow.on('closed', () => {
    recorderWindow = null;
    recorderBorderWindow?.destroy();
    recorderBorderWindow = null;
  });
}

function closeRecorder(): void {
  recorderWindow?.destroy();
  recorderWindow = null;
  recorderBorderWindow?.destroy();
  recorderBorderWindow = null;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function autoSaveDir(): string | null {
  const folder = getSettings().autoSaveFolder;
  return folder && fs.existsSync(folder) ? folder : null;
}

async function askSavePath(ext: 'png' | 'jpg' | 'mp4'): Promise<string | null> {
  const filename = timestampedFilename(ext);
  const dir = autoSaveDir();
  const filters =
    ext === 'mp4'
      ? [{ name: 'MP4 Video', extensions: ['mp4'] }]
      : [{ name: ext.toUpperCase() + ' Image', extensions: [ext] }];
  const result = await dialog.showSaveDialog({
    defaultPath: dir ? path.join(dir, filename) : filename,
    filters,
  });
  return result.canceled || !result.filePath ? null : result.filePath;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle('image:copy', (_e, dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(image);
    closeOverlays();
  });

  ipcMain.handle('image:save', async (_e, dataUrl: string, format: 'png' | 'jpg') => {
    // Hide overlays before any dialog so the frozen screen doesn't block it.
    const image = nativeImage.createFromDataURL(dataUrl);
    closeOverlays();
    const settings = getSettings();
    const dir = autoSaveDir();
    const filePath = dir
      ? path.join(dir, timestampedFilename(format))
      : await askSavePath(format);
    if (!filePath) return null;
    const buffer = format === 'jpg' ? image.toJPEG(settings.jpgQuality) : image.toPNG();
    fs.writeFileSync(filePath, buffer);
    // Optional convenience: auto-saved screenshots also land on the clipboard.
    if (dir && settings.autoSaveAlsoCopy) clipboard.writeImage(image);
    return filePath;
  });

  ipcMain.on('capture:cancel', () => closeOverlays());

  ipcMain.on('record:start', (_e, displayId: number, region: RegionRect) => {
    openRecorder(displayId, region);
  });

  ipcMain.handle('record:save', async (_e, buffer: ArrayBuffer) => {
    const tempWebm = path.join(app.getPath('temp'), `zirtola-${Date.now()}.webm`);
    fs.writeFileSync(tempWebm, Buffer.from(buffer));
    try {
      // Videos always prompt for a destination (defaulting to the auto-save
      // folder), per the intended workflow.
      const outPath = await askSavePath('mp4');
      if (!outPath) return null;
      await transcodeToMp4(tempWebm, outPath);
      return outPath;
    } finally {
      fs.rmSync(tempWebm, { force: true });
    }
  });

  ipcMain.on('record:closed', () => closeRecorder());

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
    const before = getSettings();
    const next = updateSettings(patch);
    if (patch.hotkeyScreenshot !== undefined) {
      registerHotkeys();
    }
    if (patch.launchOnStartup !== undefined && patch.launchOnStartup !== before.launchOnStartup) {
      applyLoginItem();
    }
    return next;
  });

  ipcMain.handle('settings:pick-folder', async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    };
    const result =
      settingsWindow && !settingsWindow.isDestroyed()
        ? await dialog.showOpenDialog(settingsWindow, options)
        : await dialog.showOpenDialog(options);
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('settings:validate-hotkey', (_e, accelerator: string) => {
    // Probe-register to detect conflicts with other applications; our own
    // current registration of the same accelerator is fine.
    if (globalShortcut.isRegistered(accelerator)) return { ok: true };
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => {});
    } catch {
      return { ok: false, reason: 'Invalid hotkey.' };
    }
    if (ok) globalShortcut.unregister(accelerator);
    return ok
      ? { ok: true }
      : { ok: false, reason: 'This hotkey is already in use by another application.' };
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:last', () => getLastStatus());
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.on('update:install', () => quitAndInstall());
}

// ---------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------

/**
 * One hotkey does both jobs: start a capture, or — while a recording is in
 * progress — stop it (the recorder renderer finalizes and prompts for a
 * save location).
 */
function hotkeyAction(): void {
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.webContents.send('recorder:stop');
    return;
  }
  startCapture();
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  const settings = getSettings();
  try {
    globalShortcut.register(settings.hotkeyScreenshot, hotkeyAction);
  } catch (err) {
    console.error('Failed to register screenshot hotkey:', err);
  }
}

// ---------------------------------------------------------------------------
// Settings window & tray
// ---------------------------------------------------------------------------

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    title: 'Zirtola Shot — Settings',
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadPage(settingsWindow, 'settings');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Tray-menu update check: the settings window may not exist yet, and status
 * messages sent before its renderer loads would be dropped. Start the check
 * only once the page has loaded (the renderer additionally pulls the last
 * status on mount, covering the remaining races).
 */
function checkForUpdatesFromTray(): void {
  openSettingsWindow();
  const win = settingsWindow;
  if (!win) return;
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => checkForUpdates());
  } else {
    checkForUpdates();
  }
}

function openAutoSaveFolder(): void {
  const folder = getSettings().autoSaveFolder;
  if (folder && fs.existsSync(folder)) {
    shell.openPath(folder);
  } else {
    shell.openPath(app.getPath('pictures'));
  }
}

function createTray(): void {
  const icon = appIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Zirtola Shot');
  const menu = Menu.buildFromTemplate([
    { label: 'Take screenshot / stop recording', click: () => hotkeyAction() },
    { type: 'separator' },
    { label: 'Open auto-save folder', click: () => openAutoSaveFolder() },
    { label: 'Settings', click: () => openSettingsWindow() },
    { label: 'Check for updates', click: () => checkForUpdatesFromTray() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => hotkeyAction());
}

function applyLoginItem(): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: getSettings().launchOnStartup,
    path: process.execPath,
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpc();
  createTray();
  registerHotkeys();
  prewarmOverlays();
  applyLoginItem();
  initUpdater(() => settingsWindow);

  screen.on('display-added', prewarmOverlays);
  screen.on('display-removed', prewarmOverlays);
  screen.on('display-metrics-changed', prewarmOverlays);
});

// Tray app: stay alive when all windows are closed.
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  globalShortcut.unregisterAll();
});
