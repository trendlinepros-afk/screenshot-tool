import { useState } from 'react';

/** Convert a KeyboardEvent into an Electron accelerator string, or null. */
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');

  let key: string | null = null;
  const code = e.code;
  if (code === 'PrintScreen') key = 'PrintScreen';
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
  else if (/^Key([A-Z])$/.test(code)) key = code.slice(3);
  else if (/^Digit([0-9])$/.test(code)) key = code.slice(5);
  else if (code === 'Space') key = 'Space';
  else if (code === 'Escape') key = null; // reserved for cancel
  else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code))
    key = code.replace('Arrow', '');
  else if (code === 'Home' || code === 'End' || code === 'PageUp' || code === 'PageDown')
    key = code;
  else if (code === 'Insert' || code === 'Delete') key = code;
  else if (code === 'Backquote') key = '`';
  else if (code === 'Minus') key = '-';
  else if (code === 'Equal') key = '=';

  if (!key) return null;
  // PrintScreen works alone; other plain keys need a modifier to be sane
  if (mods.length === 0 && !['PrintScreen'].includes(key) && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}

interface Props {
  value: string;
  onChange: (accelerator: string) => void;
}

export function HotkeyInput({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [warning, setWarning] = useState('');

  const capture = async (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    const accelerator = eventToAccelerator(e);
    if (!accelerator) return; // modifier-only press — keep waiting
    const result = await window.zirtola.validateHotkey(accelerator);
    if (!result.ok) {
      setWarning(result.reason ?? 'This hotkey cannot be used.');
      setRecording(false);
      return;
    }
    setWarning('');
    setRecording(false);
    onChange(accelerator);
  };

  return (
    <div>
      <button
        onKeyDown={capture}
        // On Windows, PrtScn only fires a keyup — capture it there too.
        onKeyUp={(e) => {
          if (e.code === 'PrintScreen') capture(e);
        }}
        onClick={() => {
          setWarning('');
          setRecording(true);
        }}
        onBlur={() => setRecording(false)}
        className={`w-44 rounded-md border px-3 py-1.5 text-left font-mono text-sm ${
          recording
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500'
        }`}
      >
        {recording ? 'Press a key…' : value}
      </button>
      {warning && <p className="mt-1 text-xs text-amber-400">{warning}</p>}
    </div>
  );
}
