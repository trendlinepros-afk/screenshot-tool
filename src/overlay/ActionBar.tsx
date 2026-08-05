import type { RegionRect } from '../shared/types';

interface Props {
  selection: RegionRect;
  busy: boolean;
  onCopy: () => void;
  onSave: () => void;
  onRecord: () => void;
  onCancel: () => void;
}

export function ActionBar({ selection, busy, onCopy, onSave, onRecord, onCancel }: Props) {
  const BAR_H = 36;
  const BAR_W = 270;

  // horizontal bar under the bottom edge; flip above/inside if no room
  let top = selection.y + selection.height + 8;
  if (top + BAR_H > window.innerHeight) top = selection.y - BAR_H - 8;
  if (top < 0) top = selection.y + selection.height - BAR_H - 8;
  let left = selection.x + selection.width - BAR_W;
  if (left < 4) left = Math.max(4, selection.x);
  if (left + BAR_W > window.innerWidth) left = window.innerWidth - BAR_W - 4;

  const btn =
    'flex h-7 items-center gap-1.5 rounded px-2.5 text-sm text-neutral-200 hover:bg-neutral-700 hover:text-white disabled:opacity-50';

  return (
    <div
      data-ui
      className="absolute z-30 flex items-center gap-1 rounded-lg bg-neutral-900/95 p-1 shadow-lg ring-1 ring-white/10"
      style={{ left, top, height: BAR_H }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className={btn} onClick={onSave} disabled={busy} title="Save to file (Ctrl+S)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        Save
      </button>
      <button className={btn} onClick={onCopy} disabled={busy} title="Copy to clipboard (Ctrl+C)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Copy
      </button>
      <button
        className={btn}
        onClick={onRecord}
        disabled={busy}
        title="Record this region — press the screenshot hotkey again to stop"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        Rec
      </button>
      <div className="h-5 w-px bg-white/15" />
      <button className={btn} onClick={onCancel} title="Cancel (Esc)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
