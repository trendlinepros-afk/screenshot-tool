import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as https from 'https';

export interface UpdateCheckResult {
  status: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  message?: string;
  /** Download progress 0–100, present while status is 'downloading'. */
  percent?: number;
}

const GITHUB_OWNER = 'trendlinepros-afk';
const GITHUB_REPO = 'screenshot-tool';
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

let statusTarget: (() => BrowserWindow | null) | null = null;
let lastResult: UpdateCheckResult | null = null;

function send(result: UpdateCheckResult) {
  lastResult = result;
  const win = statusTarget?.();
  if (win && !win.isDestroyed()) win.webContents.send('update:status', result);
}

/**
 * Last status we emitted. The settings renderer pulls this on mount, so a
 * check kicked off before the window finished loading (e.g. from the tray
 * menu) is never lost.
 */
export function getLastStatus(): UpdateCheckResult | null {
  return lastResult;
}

export function initUpdater(getSettingsWindow: () => BrowserWindow | null): void {
  statusTarget = getSettingsWindow;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    send({
      status: 'available',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });
  });
  autoUpdater.on('update-not-available', () => {
    send({ status: 'up-to-date', currentVersion: app.getVersion() });
  });
  autoUpdater.on('download-progress', (progress) => {
    send({
      status: 'downloading',
      currentVersion: app.getVersion(),
      percent: Math.round(progress.percent),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send({
      status: 'downloaded',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
    });
  });
  autoUpdater.on('error', (err) => {
    send({ status: 'error', currentVersion: app.getVersion(), message: err.message });
  });
}

/** Fetch latest release info from the GitHub Releases API (for release notes). */
function fetchLatestRelease(): Promise<{ tag: string; notes: string } | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'ZirtolaShot', Accept: 'application/vnd.github+json' },
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.tag_name) resolve({ tag: json.tag_name, notes: json.body ?? '' });
            else resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function compareVersions(a: string, b: string): number {
  // parseInt tolerates prerelease suffixes like "0.2.0-beta.1"
  const pa = a.replace(/^v/, '').split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function checkForUpdates(): Promise<void> {
  send({ status: 'checking', currentVersion: app.getVersion() });

  // Query the GitHub API directly so we can show release notes even when the
  // electron-updater feed is unavailable (e.g. unpackaged dev builds).
  const latest = await fetchLatestRelease();
  if (!app.isPackaged) {
    if (!latest) {
      send({
        status: 'error',
        currentVersion: app.getVersion(),
        message: 'Could not reach the GitHub Releases API.',
      });
    } else if (compareVersions(latest.tag, app.getVersion()) > 0) {
      send({
        status: 'available',
        currentVersion: app.getVersion(),
        latestVersion: latest.tag.replace(/^v/, ''),
        releaseNotes: latest.notes,
      });
    } else {
      send({ status: 'up-to-date', currentVersion: app.getVersion() });
    }
    return;
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    // Enrich the "available" event with markdown notes from the API.
    if (result && latest && compareVersions(latest.tag, app.getVersion()) > 0) {
      send({
        status: 'available',
        currentVersion: app.getVersion(),
        latestVersion: result.updateInfo.version,
        releaseNotes: latest.notes,
      });
    }
  } catch (err) {
    send({
      status: 'error',
      currentVersion: app.getVersion(),
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) {
    // Dev builds can't install in place — hand off to the releases page.
    shell.openExternal(RELEASES_URL);
    return;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    send({
      status: 'error',
      currentVersion: app.getVersion(),
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
