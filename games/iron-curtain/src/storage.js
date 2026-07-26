// localStorage, wrapped.
//
// Storage is allowed to fail — private browsing, a full quota, storage
// disabled outright — and at this layer every failure means the same thing:
// carry on without persistence. Three call sites (settings, setup, save slot)
// had grown three different try/catch shapes; this is the one shape.
//
// Nothing here throws, and nothing here logs: a game that can't remember your
// volume slider is still a game.

export function readText(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// true when the value actually landed
export function writeText(key, str) {
  try { localStorage.setItem(key, str); return true; } catch { return false; }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to clean up */ }
}

export function parseJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function stringifyJSON(value) {
  try { return JSON.stringify(value); } catch { return null; }
}

// missing key and corrupt JSON are the same answer: `fallback`
export function readJSON(key, fallback = null) {
  const raw = readText(key);
  return raw == null ? fallback : parseJSON(raw, fallback);
}
