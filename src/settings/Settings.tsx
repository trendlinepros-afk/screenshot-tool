import { useEffect, useState } from 'react';
import type { AppSettings, UpdateCheckResult } from '../shared/types';
import { HotkeyInput } from './HotkeyInput';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-neutral-200">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-brand' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    window.zirtola.getSettings().then(setSettings);
    window.zirtola.getVersion().then(setVersion);
    return window.zirtola.onUpdateStatus(setUpdate);
  }, []);

  if (!settings) return null;

  const patch = async (p: Partial<AppSettings>) => {
    const next = await window.zirtola.setSettings(p);
    setSettings(next);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">
          Z
        </div>
        <div>
          <h1 className="text-lg font-semibold">Zirtola Shot</h1>
          <p className="text-xs text-neutral-400">Settings</p>
        </div>
      </header>

      <Section title="Saving">
        <Row label="Auto-save folder">
          <div className="flex items-center gap-2">
            <span
              className="max-w-[220px] truncate text-xs text-neutral-400"
              title={settings.autoSaveFolder ?? undefined}
            >
              {settings.autoSaveFolder ?? 'Ask every time'}
            </span>
            <button
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm hover:border-neutral-500"
              onClick={async () => {
                const folder = await window.zirtola.pickFolder();
                if (folder) patch({ autoSaveFolder: folder });
              }}
            >
              Browse…
            </button>
            {settings.autoSaveFolder && (
              <button
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm text-neutral-400 hover:border-neutral-500"
                onClick={() => patch({ autoSaveFolder: null })}
              >
                Clear
              </button>
            )}
          </div>
        </Row>
        <Row label="Image format">
          <div className="flex items-center gap-2">
            {(['png', 'jpg'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => patch({ imageFormat: fmt })}
                className={`rounded-md px-3 py-1 text-sm uppercase ${
                  settings.imageFormat === fmt
                    ? 'bg-brand text-white'
                    : 'border border-neutral-700 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </Row>
        {settings.imageFormat === 'jpg' && (
          <Row label={`JPG quality (${settings.jpgQuality})`}>
            <input
              type="range"
              min={10}
              max={100}
              value={settings.jpgQuality}
              onChange={(e) => patch({ jpgQuality: Number(e.target.value) })}
              className="w-44 accent-brand"
            />
          </Row>
        )}
      </Section>

      <Section title="Hotkeys">
        <Row label="Screenshot capture">
          <HotkeyInput
            value={settings.hotkeyScreenshot}
            kind="screenshot"
            onChange={(hotkeyScreenshot) => patch({ hotkeyScreenshot })}
          />
        </Row>
        <Row label="Video capture">
          <HotkeyInput
            value={settings.hotkeyVideo}
            kind="video"
            onChange={(hotkeyVideo) => patch({ hotkeyVideo })}
          />
        </Row>
      </Section>

      <Section title="Video">
        <Row label="Frame rate">
          <select
            value={settings.videoFps}
            onChange={(e) => patch({ videoFps: Number(e.target.value) })}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          >
            {[15, 24, 30, 60].map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
          </select>
        </Row>
        <Row label="Record system audio">
          <Toggle
            checked={settings.recordSystemAudio}
            onChange={(recordSystemAudio) => patch({ recordSystemAudio })}
          />
        </Row>
        <Row label="Record microphone">
          <Toggle
            checked={settings.recordMicrophone}
            onChange={(recordMicrophone) => patch({ recordMicrophone })}
          />
        </Row>
      </Section>

      <Section title="Startup">
        <Row label="Launch Zirtola Shot on Windows login">
          <Toggle
            checked={settings.launchOnStartup}
            onChange={(launchOnStartup) => patch({ launchOnStartup })}
          />
        </Row>
      </Section>

      <Section title="Updates">
        <div className="flex items-center justify-between gap-4">
          <button
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            disabled={update?.status === 'checking'}
            onClick={() => window.zirtola.checkForUpdates()}
          >
            {update?.status === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          {update?.status === 'up-to-date' && (
            <span className="text-sm text-green-400">You're up to date ✓</span>
          )}
          {update?.status === 'error' && (
            <span className="max-w-[260px] truncate text-sm text-amber-400" title={update.message}>
              {update.message ?? 'Update check failed'}
            </span>
          )}
        </div>
        {update?.status === 'available' && (
          <div className="rounded-md border border-brand/40 bg-brand/10 p-3">
            <p className="text-sm font-medium">
              Version {update.latestVersion} is available (you have {update.currentVersion})
            </p>
            {update.releaseNotes && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">
                {update.releaseNotes}
              </pre>
            )}
            <button
              className="mt-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
              onClick={() => window.zirtola.downloadUpdate()}
            >
              Download &amp; install
            </button>
          </div>
        )}
        {update?.status === 'downloaded' && (
          <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3">
            <p className="text-sm">Update downloaded. Restart to install.</p>
            <button
              className="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
              onClick={() => window.zirtola.quitAndInstall()}
            >
              Restart now
            </button>
          </div>
        )}
      </Section>

      <footer className="pb-2 pt-1 text-center text-xs text-neutral-500">
        Zirtola Shot v{version}
      </footer>
    </div>
  );
}
