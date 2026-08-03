import { desktopCapturer, screen, Display } from 'electron';

export interface DisplayCapture {
  display: Display;
  /**
   * Raw BGRA bitmap of the display at full physical resolution. Sending the
   * raw pixels (instead of a PNG data URL) skips a full encode in the main
   * process and a full decode in the renderer — the difference between the
   * overlay appearing in ~300ms vs ~1.5s on a 4K screen.
   */
  bitmap: Buffer;
  bitmapWidth: number;
  bitmapHeight: number;
  /** desktopCapturer source id ("screen:x:y") for live recording. */
  sourceId: string;
}

/**
 * Capture a frozen frame of every display at its full physical resolution.
 * DPI-aware: thumbnailSize is the display size multiplied by its scale factor,
 * so captures stay pixel-sharp on scaled displays.
 */
export async function captureAllDisplays(): Promise<DisplayCapture[]> {
  const displays = screen.getAllDisplays();
  const maxWidth = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
  const maxHeight = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.ceil(maxWidth), height: Math.ceil(maxHeight) },
  });

  const results: DisplayCapture[] = [];
  for (let i = 0; i < displays.length; i++) {
    const display = displays[i];
    // Match by display_id when available; fall back to index order, which
    // desktopCapturer keeps consistent with screen.getAllDisplays on Windows.
    const source =
      sources.find((s) => s.display_id === String(display.id)) ?? sources[i] ?? sources[0];
    if (!source) continue;

    // No resize, no PNG encode — hand the renderer the raw pixels and let it
    // map coordinates against the actual bitmap dimensions.
    const size = source.thumbnail.getSize();
    results.push({
      display,
      bitmap: source.thumbnail.toBitmap(),
      bitmapWidth: size.width,
      bitmapHeight: size.height,
      sourceId: source.id,
    });
  }
  return results;
}
