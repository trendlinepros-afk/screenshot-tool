import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayInit, RegionRect } from '../shared/types';
import { drawShape, Point, Shape, ToolName } from './shapes';
import { AnnotationToolbar } from './AnnotationToolbar';
import { ActionBar } from './ActionBar';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Drag =
  | { kind: 'new'; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; orig: RegionRect }
  | { kind: 'resize'; handle: Handle; orig: RegionRect }
  | { kind: 'annotate'; shape: Shape };

const HANDLES: { name: Handle; cursor: string }[] = [
  { name: 'nw', cursor: 'nwse-resize' },
  { name: 'n', cursor: 'ns-resize' },
  { name: 'ne', cursor: 'nesw-resize' },
  { name: 'e', cursor: 'ew-resize' },
  { name: 'se', cursor: 'nwse-resize' },
  { name: 's', cursor: 'ns-resize' },
  { name: 'sw', cursor: 'nesw-resize' },
  { name: 'w', cursor: 'ew-resize' },
];

function normalizeRect(a: Point, b: Point): RegionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function clampRect(r: RegionRect, w: number, h: number): RegionRect {
  const x = Math.max(0, Math.min(r.x, w - r.width));
  const y = Math.max(0, Math.min(r.y, h - r.height));
  return { x, y, width: Math.min(r.width, w), height: Math.min(r.height, h) };
}

export function Overlay() {
  const [init, setInit] = useState<OverlayInit | null>(null);
  const [selection, setSelection] = useState<RegionRect | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<ToolName | null>(null);
  const [color, setColor] = useState('#ef4444');
  const [editingText, setEditingText] = useState<{ x: number; y: number; value: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  // Geometry drags (draw/move/resize) hide the handles and toolbars; annotate
  // drags keep the toolbars visible. State (not just a ref) so the UI updates.
  const [dragKind, setDragKind] = useState<null | 'geometry' | 'annotate'>(null);

  const dragRef = useRef<Drag | null>(null);
  const liveShapeRef = useRef<Shape | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ selection, shapes, tool, color, init, editingText, busy });
  stateRef.current = { selection, shapes, tool, color, init, editingText, busy };

  // ---- init from main process --------------------------------------------
  useEffect(() => {
    return window.zirtola.onOverlayInit((data) => {
      setInit(data);
      setSelection(null);
      setShapes([]);
      setTool(null);
      setEditingText(null);
      setBusy(false);
      setDragKind(null);
      dragRef.current = null;
      liveShapeRef.current = null;
      const img = new Image();
      img.src = data.imageDataUrl;
      imageRef.current = img;
    });
  }, []);

  // ---- annotation canvas redraw ------------------------------------------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const { selection: sel, shapes: shs } = stateRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!sel) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sel.x, sel.y, sel.width, sel.height);
    ctx.clip();
    for (const s of shs) drawShape(ctx, s);
    if (liveShapeRef.current) drawShape(ctx, liveShapeRef.current);
    ctx.restore();
  }, []);

  useEffect(() => {
    redraw();
  }, [selection, shapes, redraw]);

  // ---- export -------------------------------------------------------------
  const exportImage = useCallback(
    (format: 'png' | 'jpg', quality: number, extra?: Shape | null): string | null => {
      const { selection: sel, shapes: base, init: cfg } = stateRef.current;
      const shs = extra ? [...base, extra] : base;
      const img = imageRef.current;
      if (!sel || !cfg || !img || sel.width < 1 || sel.height < 1) return null;
      const scale = cfg.scaleFactor;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sel.width * scale));
      canvas.height = Math.max(1, Math.round(sel.height * scale));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        img,
        Math.round(sel.x * scale),
        Math.round(sel.y * scale),
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      ctx.scale(scale, scale);
      ctx.translate(-sel.x, -sel.y);
      for (const s of shs) drawShape(ctx, s);
      return format === 'jpg'
        ? canvas.toDataURL('image/jpeg', quality / 100)
        : canvas.toDataURL('image/png');
    },
    []
  );

  /** Commit any in-progress text edit; returns the committed shape (if any). */
  const commitPendingText = useCallback((): Shape | null => {
    const { editingText: et, color: c } = stateRef.current;
    setEditingText(null);
    if (et && et.value.trim()) {
      const shape: Shape = { tool: 'text', x: et.x, y: et.y, text: et.value, color: c, fontSize: 18 };
      setShapes((prev) => [...prev, shape]);
      return shape;
    }
    return null;
  }, []);

  const doCopy = useCallback(() => {
    if (stateRef.current.busy) return;
    const extra = commitPendingText();
    const dataUrl = exportImage('png', 100, extra);
    if (!dataUrl) return;
    setBusy(true);
    window.zirtola.copyImage(dataUrl);
  }, [commitPendingText, exportImage]);

  const doSave = useCallback(async () => {
    if (stateRef.current.busy) return;
    const extra = commitPendingText();
    const settings = await window.zirtola.getSettings();
    const dataUrl = exportImage(settings.imageFormat, settings.jpgQuality, extra);
    if (!dataUrl) return;
    setBusy(true);
    await window.zirtola.saveImage(dataUrl, settings.imageFormat);
  }, [commitPendingText, exportImage]);

  const doStartRecording = useCallback(() => {
    const { selection: sel, init: cfg } = stateRef.current;
    if (!sel || !cfg || sel.width < 8 || sel.height < 8) return;
    window.zirtola.startRecording(cfg.displayId, {
      x: Math.round(sel.x),
      y: Math.round(sel.y),
      width: Math.round(sel.width),
      height: Math.round(sel.height),
    });
  }, []);

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { editingText: et, init: cfg } = stateRef.current;
      if (e.key === 'Escape') {
        if (et) {
          setEditingText(null);
        } else {
          window.zirtola.cancelCapture();
        }
        return;
      }
      if (et) return; // let the textarea handle typing
      if (e.key === 'z' && e.ctrlKey) {
        e.preventDefault();
        setShapes((prev) => prev.slice(0, -1));
        return;
      }
      if ((e.key === 'c' && e.ctrlKey) || e.key === 'Enter') {
        e.preventDefault();
        if (!stateRef.current.selection) return;
        if (cfg?.mode === 'record') doStartRecording();
        else doCopy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doCopy, doStartRecording]);

  // ---- mouse --------------------------------------------------------------
  const hitSelection = (p: Point, sel: RegionRect | null): boolean =>
    !!sel &&
    p.x >= sel.x &&
    p.x <= sel.x + sel.width &&
    p.y >= sel.y &&
    p.y <= sel.y + sel.height;

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || busy) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-ui]')) return; // toolbar/action-bar clicks
    const p = { x: e.clientX, y: e.clientY };

    if (editingText) {
      commitPendingText();
      return;
    }

    const handle = target.dataset.handle as Handle | undefined;
    if (handle && selection) {
      dragRef.current = { kind: 'resize', handle, orig: selection };
      setDragKind('geometry');
      return;
    }

    if (selection && tool && hitSelection(p, selection)) {
      if (tool === 'text') {
        setEditingText({ x: p.x, y: p.y, value: '' });
        return;
      }
      const width = 3;
      const shape: Shape =
        tool === 'pen'
          ? { tool: 'pen', points: [p], color, width }
          : { tool, from: p, to: p, color, width };
      dragRef.current = { kind: 'annotate', shape };
      liveShapeRef.current = shape;
      setDragKind('annotate');
      return;
    }

    if (selection && !tool && hitSelection(p, selection)) {
      dragRef.current = { kind: 'move', startX: p.x, startY: p.y, orig: selection };
      setDragKind('geometry');
      return;
    }

    // start a fresh selection
    setShapes([]);
    setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
    dragRef.current = { kind: 'new', startX: p.x, startY: p.y };
    setDragKind('geometry');
  };

  // Move/up live on window so a drag ends cleanly even when the button is
  // released outside this display's overlay window.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = {
        x: Math.max(0, Math.min(e.clientX, window.innerWidth)),
        y: Math.max(0, Math.min(e.clientY, window.innerHeight)),
      };
      switch (drag.kind) {
        case 'new':
          setSelection(normalizeRect({ x: drag.startX, y: drag.startY }, p));
          break;
        case 'move': {
          const next = {
            ...drag.orig,
            x: drag.orig.x + (e.clientX - drag.startX),
            y: drag.orig.y + (e.clientY - drag.startY),
          };
          setSelection(clampRect(next, window.innerWidth, window.innerHeight));
          break;
        }
        case 'resize': {
          const { handle: h, orig } = drag;
          const left = h.includes('w') ? p.x : orig.x;
          const right = h.includes('e') ? p.x : orig.x + orig.width;
          const top = h.includes('n') ? p.y : orig.y;
          const bottom = h.includes('s') ? p.y : orig.y + orig.height;
          setSelection(normalizeRect({ x: left, y: top }, { x: right, y: bottom }));
          break;
        }
        case 'annotate': {
          const shape = drag.shape;
          if (shape.tool === 'pen') shape.points.push(p);
          else if (shape.tool !== 'text') shape.to = p;
          liveShapeRef.current = shape;
          redraw();
          break;
        }
      }
    };

    const onMouseUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragKind(null);
      if (!drag) return;
      if (drag.kind === 'annotate') {
        const shape = liveShapeRef.current;
        liveShapeRef.current = null;
        if (shape) setShapes((prev) => [...prev, shape]);
      } else if (drag.kind === 'new') {
        setSelection((sel) => (sel && sel.width >= 4 && sel.height >= 4 ? sel : null));
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [redraw]);

  if (!init) return <div className="h-full w-full bg-neutral-900" />;

  const sel = selection;
  const scale = init.scaleFactor;
  const badge =
    sel && sel.width > 0
      ? `${Math.round(sel.width * scale)}×${Math.round(sel.height * scale)}`
      : null;

  const cursor = tool && sel ? 'crosshair' : sel ? 'default' : 'crosshair';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor }}
      onMouseDown={onMouseDown}
    >
      {/* frozen screen, dimmed */}
      <img
        src={init.imageDataUrl}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={{ filter: 'brightness(0.45)' }}
      />

      {sel && (
        <>
          {/* full-brightness crop of the frozen screen */}
          <div
            className="absolute overflow-hidden"
            style={{
              cursor: tool ? 'crosshair' : 'move',
              left: sel.x,
              top: sel.y,
              width: sel.width,
              height: sel.height,
              backgroundImage: `url(${init.imageDataUrl})`,
              backgroundSize: `${window.innerWidth}px ${window.innerHeight}px`,
              backgroundPosition: `${-sel.x}px ${-sel.y}px`,
            }}
          />
          {/* selection border */}
          <div
            className="pointer-events-none absolute border border-brand"
            style={{
              left: sel.x - 1,
              top: sel.y - 1,
              width: sel.width + 2,
              height: sel.height + 2,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.35)',
            }}
          />
        </>
      )}

      {/* annotation layer */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {sel && badge && (
        <div
          className="pointer-events-none absolute rounded bg-neutral-900/90 px-1.5 py-0.5 font-mono text-xs text-white shadow"
          style={{
            left: sel.x,
            top: sel.y >= 24 ? sel.y - 22 : sel.y + 4,
          }}
        >
          {badge}
        </div>
      )}

      {/* resize handles */}
      {sel &&
        !dragKind &&
        HANDLES.map(({ name, cursor: hc }) => {
          const cx = name.includes('w') ? sel.x : name.includes('e') ? sel.x + sel.width : sel.x + sel.width / 2;
          const cy = name.includes('n') ? sel.y : name.includes('s') ? sel.y + sel.height : sel.y + sel.height / 2;
          return (
            <div
              key={name}
              data-handle={name}
              className="absolute z-10 h-2.5 w-2.5 rounded-sm border border-white bg-brand"
              style={{ left: cx - 5, top: cy - 5, cursor: hc }}
            />
          );
        })}

      {/* inline text editor */}
      {editingText && (
        <textarea
          autoFocus
          data-ui
          value={editingText.value}
          onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitPendingText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditingText(null);
            }
            e.stopPropagation();
          }}
          onBlur={commitPendingText}
          className="absolute z-20 min-h-[28px] w-64 resize-none border border-dashed border-white/70 bg-transparent p-0 font-semibold outline-none"
          style={{
            left: editingText.x,
            top: editingText.y,
            color,
            fontSize: 18,
            lineHeight: 1.25,
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}
        />
      )}

      {sel && sel.width >= 4 && dragKind !== 'geometry' && init.mode === 'screenshot' && (
        <AnnotationToolbar
          selection={sel}
          tool={tool}
          color={color}
          onToolChange={setTool}
          onColorChange={setColor}
          onUndo={() => setShapes((prev) => prev.slice(0, -1))}
        />
      )}

      {sel && sel.width >= 4 && dragKind !== 'geometry' && (
        <ActionBar
          selection={sel}
          mode={init.mode}
          busy={busy}
          onCopy={doCopy}
          onSave={doSave}
          onRecord={doStartRecording}
          onCancel={() => window.zirtola.cancelCapture()}
        />
      )}

      {!sel && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-neutral-900/80 px-4 py-1.5 text-sm text-neutral-200 shadow">
          {init.mode === 'record'
            ? 'Drag to choose the recording region — Esc to cancel'
            : 'Drag to select a region — Ctrl+C to copy, Esc to cancel'}
        </div>
      )}
    </div>
  );
}
