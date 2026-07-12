// Player settings: audio levels and camera controls, persisted locally.

const KEY = 'iron-curtain-settings';

export const DEFAULTS = {
  master: 0.5,      // overall volume 0..1
  musicVol: 0.32,   // music channel 0..1
  voice: true,      // tactical advisor speech
  camSpeed: 22,     // cells per second
  edgeScroll: false // scroll when the mouse touches the screen edge
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw);
    return { ...DEFAULTS, ...data };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
