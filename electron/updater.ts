import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as https from 'https';

export interface UpdateCheckResult {
  status: 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  message?: string;
}

const GITHUB_OWNER = 'trendlinepros-afk';
const GITHUB_REPO = 'screenshot-tool';

let statusTarget: (() => BrowserWindow | null) | null = null;

function send(result: UpdateCheckResult) {
  const win = statusTarget?.();
  if (win && !win.isDestroyed()) win.webContents.send('update:status', result);
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
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
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
