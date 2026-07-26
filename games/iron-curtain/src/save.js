// localStorage save slot: write, read-and-validate, clear. Knows nothing about
// the sim beyond the version stamp — the caller builds and restores the blob.

import { SAVE_VERSION } from './sim/persist.js';

const SAVE_KEY = 'iron-curtain-save';
const SAVE_MAX_BYTES = 3.5 * 1024 * 1024;   // skip autosave past this (safety)

export function writeSave(data) {
  try {
    const str = JSON.stringify(data);
    if (str.length > SAVE_MAX_BYTES) return;   // too large: skip silently
    localStorage.setItem(SAVE_KEY, str);
  } catch { /* quota exceeded or serialize error: leave the old save be */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ok */ }
}

// parse + validate the stored save; a corrupt/version-mismatched blob is
// deleted and treated as "no save"
export function readSave() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION || !data.map) { clearSave(); return null; }
    return data;
  } catch { clearSave(); return null; }
}

export function hasValidSave() { return !!readSave(); }
