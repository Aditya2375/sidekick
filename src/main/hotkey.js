'use strict';

// Global hotkey validation. Accepts Electron accelerator syntax but only a
// safe subset: modifier keys + one normal key. Anything else is rejected so a
// settings edit cannot register something broken or dangerous.
const MODIFIERS = new Set(['Control', 'Ctrl', 'Shift', 'Alt', 'Command', 'Cmd', 'Super', 'Meta']);
const KEY_RE = /^([A-Za-z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Minus)$/;

function isValidAccelerator(acc) {
  if (typeof acc !== 'string' || acc.length === 0 || acc.length > 64) return false;
  const parts = acc.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  const mods = parts.slice(0, -1);
  const key = parts[parts.length - 1];
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (new Set(mods.map((m) => m.toLowerCase())).size !== mods.length) return false;
  return KEY_RE.test(key);
}

module.exports = { isValidAccelerator };
