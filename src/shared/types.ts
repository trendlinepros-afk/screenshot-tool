export interface AppSettings {
  autoSaveFolder: string | null;
  /** Also save copied screenshots to the auto-save folder. */
  copyAlsoSave: boolean;
  /** One hotkey: opens capture, and stops an in-progress recording. */
  hotkeyScreenshot: string;
  imageFormat: 'png' | 'jpg';
  jpgQuality: number;
  videoFps: number;
  recordSystemAudio: boolean;
  recordMicrophone: boolean;
  launchOnStartup: boolean;
}

/** Sent to the overlay window when a capture session starts. */
export interface OverlayInit {
  displayId: number;
  /** Raw BGRA pixels of the frozen screen at full physical resolution. */
  bitmap: Uint8Array;
  bitmapWidth: number;
  bitmapHeight: number;
  /** Display bounds in CSS (device-independent) pixels. */
  bounds: { x: number; y: number; width: number; height: number };
}

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sent to the recorder control window when recording setup completes. */
export interface RecorderInit {
  sourceId: string;
  displayId: number;
  /** Region in CSS pixels, relative to the display. */
  region: RegionRect;
  /** Display size in CSS pixels, for mapping the region onto the stream. */
  displaySize: { width: number; height: number };
  scaleFactor: number;
  fps: number;
  recordSystemAudio: boolean;
  recordMicrophone: boolean;
}

export interface UpdateCheckResult {
  status: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  message?: string;
  /** Download progress 0–100, present while status is 'downloading'. */
  percent?: number;
}

export interface HotkeyValidation {
  ok: boolean;
  reason?: string;
}

export interface ZirtolaApi {
  // overlay
  onOverlayInit(cb: (init: OverlayInit) => void): () => void;
  overlayReady(): void;
  copyImage(dataUrl: string): Promise<void>;
  saveImage(dataUrl: string, format: 'png' | 'jpg'): Promise<string | null>;
  cancelCapture(): void;
  startRecording(displayId: number, region: RegionRect): void;

  // recorder control window
  onRecorderInit(cb: (init: RecorderInit) => void): () => void;
  onRecorderStop(cb: () => void): () => void;
  saveRecording(buffer: ArrayBuffer): Promise<string | null>;
  recordingClosed(): void;

  // settings
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  pickFolder(): Promise<string | null>;
  validateHotkey(accelerator: string): Promise<HotkeyValidation>;
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<void>;
  getLastUpdateStatus(): Promise<UpdateCheckResult | null>;
  onUpdateStatus(cb: (result: UpdateCheckResult) => void): () => void;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): void;
}

declare global {
  interface Window {
    zirtola: ZirtolaApi;
  }
}
