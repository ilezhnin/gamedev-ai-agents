// Player settings: audio levels and camera controls, persisted locally.

import { readJSON, writeText, stringifyJSON } from './storage.js';

const KEY = 'iron-curtain-settings';

export const DEFAULTS = {
  master: 0.5,      // overall volume 0..1
  musicVol: 0.32,   // music channel 0..1
  sfxVol: 0.8,      // sound-effects channel 0..1
  voice: true,      // tactical advisor speech
  camSpeed: 22,     // cells per second
  edgeScroll: false, // scroll when the mouse touches the screen edge
  gameSpeed: 1      // sim speed multiplier 0.5..2 (UI stays real-time)
};

// unknown keys in the stored blob are harmless; missing ones fall back
export function loadSettings() {
  return { ...DEFAULTS, ...(readJSON(KEY) || {}) };
}

export function saveSettings(s) {
  const str = stringifyJSON(s);
  if (str != null) writeText(KEY, str);
}
