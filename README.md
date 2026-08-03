# Zirtola Shot

A fast, Lightshot-style **screenshot and screen-recording tool for Windows**, built with
Electron, React, TypeScript, Vite, and Tailwind.

Press a hotkey, the screen freezes, drag a box, hit **Ctrl+C** — the region is on your
clipboard. That's the whole workflow.

## Features

- **Instant region capture** — global hotkey (default `PrtScn`) freezes the whole desktop
  (all monitors) in a dimmed overlay; drag to select, with a live pixel-dimension badge.
- **Adjustable selection** — corner and edge handles to resize, drag inside to move.
- **One-keystroke copy** — `Ctrl+C` (or `Enter`) copies the region to the clipboard as a
  real PNG, paste-able into Paint, Word, Discord, anywhere. `Esc` cancels.
- **Annotations** — pencil, line, arrow, box, and inline text, with a color picker and
  undo (`Ctrl+Z`). Annotations are rendered into the copied/saved image.
- **Save to file** — PNG (default) or JPG with a quality slider, named
  `ZirtolaShot_YYYY-MM-DD_HH-mm-ss.png`, into your auto-save folder (or Save As).
- **Screen recording** — draw a box, hit **Rec** on the action bar, and the screen
  un-dims while just those pixels record to MP4 (H.264 via bundled ffmpeg). Press the
  hotkey again (or the stop button) to finish and pick where to save. Pause/resume and
  an elapsed-time counter included; configurable frame rate, optional system audio and
  microphone.
- **System tray app** — lives in the tray, with menu items for screenshot, recording,
  the auto-save folder, settings, update checks, and quit. Single-instance.
- **Multi-monitor & DPI-aware** — overlays cover every display; captures are pixel-sharp
  on scaled displays.
- **Rebindable hotkeys** — with conflict detection.
- **Auto-launch on login** — on by default, toggleable.
- **In-app updates** — checks GitHub Releases, shows release notes, and installs in place
  via electron-updater.

## Install

Grab the latest `ZirtolaShot-Setup-x.y.z.exe` from
[Releases](https://github.com/trendlinepros-afk/screenshot-tool/releases) and run it.
The app starts in the system tray.

## Usage

| Action | Default key |
| --- | --- |
| Take screenshot | `PrtScn` |
| Copy selection | `Ctrl+C` or `Enter` |
| Cancel capture | `Esc` |
| Undo annotation | `Ctrl+Z` |
| Start recording | **Rec** button on the selection |
| Stop recording | `PrtScn` (same hotkey) |

The hotkey is rebindable in **Settings** (tray icon → Settings).

## Development

```bash
npm install
npm run dev        # vite dev server + electron
npm run typecheck  # strict TS across main + renderer
npm run dist       # build the Windows NSIS installer into release/
```

The Electron main process lives in `electron/`, the renderer apps (capture overlay,
settings window, recorder control bar) in `src/`.

## Releasing

Tag a version and push — GitHub Actions builds the Windows installer and attaches it to
the GitHub Release, which the in-app updater picks up:

```bash
npm version 0.2.0
git push --follow-tags
```

## License

[MIT](LICENSE)
