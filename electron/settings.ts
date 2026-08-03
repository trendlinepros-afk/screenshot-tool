import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface AppSettings {
  autoSaveFolder: string | null;
  hotkeyScreenshot: string;
  hotkeyVideo: string;
  imageFormat: 'png' | 'jpg';
  jpgQuality: number;
  videoFps: number;
  recordSystemAudio: boolean;
  recordMicrophone: boolean;
  launchOnStartup: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveFolder: null,
  hotkeyScreenshot: 'PrintScreen',
  hotkeyVideo: 'Ctrl+PrintScreen',
  imageFormat: 'png',
  jpgQuality: 90,
  videoFps: 30,
  recordSystemAudio: false,
  recordMicrophone: false,
  launchOnStartup: true,
};

const listeners: Array<(s: AppSettings) => void> = [];
let cached: AppSettings | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function getSettings(): AppSettings {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    cached = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return cached!;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  cached = next;
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('Failed to persist settings:', err);
  }
  for (const cb of listeners) cb(next);
  return next;
}

export function onSettingsChanged(cb: (s: AppSettings) => void): void {
  listeners.push(cb);
}

/** Timestamped filename like ZirtolaShot_2026-08-03_14-05-09.png */
export function timestampedFilename(ext: 'png' | 'jpg' | 'mp4'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `ZirtolaShot_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${ext}`
  );
}
