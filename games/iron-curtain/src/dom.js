// Three-line DOM helpers for the screen and HUD wiring.
//
// The UI is hand-written DOM against a fixed index.html, so `getElementById`
// plus `addEventListener('click', ...)` was the single most repeated shape in
// the codebase. These exist to make the wiring read as a list of what happens
// rather than a list of how it is looked up — nothing more; there is no widget
// framework hiding here.

export function byId(id) { return document.getElementById(id); }

export function onClick(id, fn) { byId(id).addEventListener('click', fn); }

export function onInput(id, fn) { byId(id).addEventListener('input', fn); }

// An ON/OFF pill: the label and the lit state always move together, and
// forgetting one of the two is the bug this prevents.
export function setToggle(id, on) {
  const el = byId(id);
  el.textContent = on ? 'ON' : 'OFF';
  el.classList.toggle('on', on);
}
