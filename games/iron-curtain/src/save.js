// localStorage save slot: write, read-and-validate, clear. Knows nothing about
// the sim beyond the version stamp — the caller builds and restores the blob.

import { SAVE_VERSION } from './sim/persist.js';
import { readText, writeText, removeKey, parseJSON, stringifyJSON } from './storage.js';

const SAVE_KEY = 'iron-curtain-save';
const SAVE_MAX_BYTES = 3.5 * 1024 * 1024;   // skip autosave past this (safety)

// A failed write leaves the previous save in place, which is the right answer:
// a stale autosave beats no autosave.
export function writeSave(data) {
  const str = stringifyJSON(data);
  if (str == null || str.length > SAVE_MAX_BYTES) return;
  writeText(SAVE_KEY, str);
}

export function clearSave() { removeKey(SAVE_KEY); }

// parse + validate the stored save; a corrupt/version-mismatched blob is
// deleted and treated as "no save"
export function readSave() {
  const raw = readText(SAVE_KEY);
  if (!raw) return null;
  const data = parseJSON(raw);
  if (!data || data.version !== SAVE_VERSION || !data.map) { clearSave(); return null; }
  return data;
}

export function hasValidSave() { return !!readSave(); }
