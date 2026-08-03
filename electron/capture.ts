import { desktopCapturer, screen, Display } from 'electron';

export interface DisplayCapture {
  display: Display;
  /** PNG data URL at full physical resolution of the display. */
  imageDataUrl: string;
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

    const physW = Math.round(display.size.width * display.scaleFactor);
    const physH = Math.round(display.size.height * display.scaleFactor);
    const image = source.thumbnail.resize({ width: physW, height: physH });
    results.push({
      display,
      imageDataUrl: image.toDataURL(),
      sourceId: source.id,
    });
  }
  return results;
}

export function findSourceIdForDisplay(
  captures: DisplayCapture[],
  displayId: number
): string | null {
  return captures.find((c) => c.display.id === displayId)?.sourceId ?? null;
}
