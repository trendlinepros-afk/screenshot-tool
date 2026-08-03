export type CaptureMode = 'screenshot' | 'record';

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

/** Sent to the overlay window when a capture session starts. */
export interface OverlayInit {
  mode: CaptureMode;
  displayId: number;
  /** Data URL of the frozen screen image at full physical resolution. */
  imageDataUrl: string;
  /** Display bounds in CSS (device-independent) pixels. */
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
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
  scaleFactor: number;
  fps: number;
  recordSystemAudio: boolean;
  recordMicrophone: boolean;
}

export interface UpdateCheckResult {
  status: 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  message?: string;
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
  saveRecording(buffer: ArrayBuffer): Promise<string | null>;
  recordingClosed(): void;

  // settings
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  pickFolder(): Promise<string | null>;
  validateHotkey(accelerator: string, kind: 'screenshot' | 'video'): Promise<HotkeyValidation>;
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<void>;
  onUpdateStatus(cb: (result: UpdateCheckResult) => void): () => void;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): void;
}

declare global {
  interface Window {
    zirtola: ZirtolaApi;
  }
}
