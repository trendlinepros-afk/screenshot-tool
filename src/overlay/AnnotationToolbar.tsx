import { useRef } from 'react';
import type { RegionRect } from '../shared/types';
import type { ToolName } from './shapes';

const ICONS: Record<ToolName, JSX.Element> = {
  pen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <line x1="5" y1="19" x2="17" y2="7" />
      <polyline points="9 7 17 7 17 15" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  ),
};

const TOOL_ORDER: ToolName[] = ['pen', 'line', 'arrow', 'box', 'text'];
const TOOL_TITLES: Record<ToolName, string> = {
  pen: 'Free draw',
  line: 'Line',
  arrow: 'Arrow',
  box: 'Box',
  text: 'Text',
};

interface Props {
  selection: RegionRect;
  tool: ToolName | null;
  color: string;
  onToolChange: (tool: ToolName | null) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
}

export function AnnotationToolbar({
  selection,
  tool,
  color,
  onToolChange,
  onColorChange,
  onUndo,
}: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const BAR_W = 36;
  const BAR_H = TOOL_ORDER.length * 32 + 2 * 32 + 12;

  // vertical bar on the right edge of the selection; flip inside if no room
  let left = selection.x + selection.width + 8;
  if (left + BAR_W > window.innerWidth) left = selection.x + selection.width - BAR_W - 8;
  let top = selection.y;
  if (top + BAR_H > window.innerHeight) top = Math.max(4, window.innerHeight - BAR_H - 4);

  return (
    <div
      data-ui
      className="absolute z-30 flex flex-col items-center gap-1 rounded-lg bg-neutral-900/95 p-1 shadow-lg ring-1 ring-white/10"
      style={{ left, top, width: BAR_W }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {TOOL_ORDER.map((name) => (
        <button
          key={name}
          title={TOOL_TITLES[name]}
          onClick={() => onToolChange(tool === name ? null : name)}
          className={`flex h-7 w-7 items-center justify-center rounded ${
            tool === name
              ? 'bg-brand text-white'
              : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          {ICONS[name]}
        </button>
      ))}
      <div className="my-0.5 h-px w-5 bg-white/15" />
      <button
        title="Color"
        onClick={() => colorInputRef.current?.click()}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-700"
      >
        <span
          className="h-4 w-4 rounded-full ring-1 ring-white/40"
          style={{ backgroundColor: color }}
        />
      </button>
      <input
        ref={colorInputRef}
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      <button
        title="Undo (Ctrl+Z)"
        onClick={onUndo}
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-300 hover:bg-neutral-700 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <polyline points="9 14 4 9 9 4" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>
    </div>
  );
}
