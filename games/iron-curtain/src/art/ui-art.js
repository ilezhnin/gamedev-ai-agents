// Interface art: the pieces drawn for the player rather than the battlefield —
// sidebar cameos, veterancy chevrons, commander-power glyphs and the animated
// title logo. Selection boxes, health bars and cursors are drawn live (see
// src/render/fx.js, src/ui.js and src/cursors.js) rather than baked here.

import { PAL, makeCanvas, px, outlineRect } from '../palette.js';

// Veterancy rank pips: 1-2 tiny gold chevrons with an ink outline, worn
// above a ranked unit's health bar. Index 0 = rank1 (one), 1 = rank2 (two).
export function rankChevrons() {
  const mk = (n) => {
    const [c, g] = makeCanvas(14, 10);
    const chevron = (oy) => {
      // an ink-outlined gold "^" a few pixels wide
      for (let i = 0; i < 4; i++) {
        px(g, 3 + i, oy + i, PAL.ink);
        px(g, 10 - i, oy + i, PAL.ink);
      }
      for (let i = 0; i < 3; i++) {
        px(g, 4 + i, oy + i, PAL.ore1);
        px(g, 9 - i, oy + i, PAL.ore1);
      }
      px(g, 6, oy, PAL.oreHi, 2, 1);
    };
    if (n === 1) chevron(3);
    else { chevron(0); chevron(5); }
    return c;
  };
  return [mk(1), mk(2)];
}

// Commander-power cameo glyphs (48x36): recon sweep (radar arcs) + EMP bolt.
export function powerIcon(kind) {
  const [c, g] = makeCanvas(48, 36);
  const grad = g.createLinearGradient(0, 0, 0, 36);
  grad.addColorStop(0, '#2a3038'); grad.addColorStop(1, '#12161c');
  g.fillStyle = grad; g.fillRect(0, 0, 48, 36);
  if (kind === 'recon') {
    // sweeping radar arcs from the bottom-left origin
    g.strokeStyle = '#7fe08a'; g.lineWidth = 2;
    for (const r of [10, 17, 24]) { g.beginPath(); g.arc(12, 28, r, -Math.PI / 2, 0); g.stroke(); }
    g.fillStyle = '#bfe8ff';
    g.beginPath(); g.moveTo(12, 28); g.lineTo(34, 12); g.lineTo(36, 16); g.closePath(); g.fill();
    px(g, 11, 27, '#eafff0', 3, 3);
  } else {
    // jagged EMP bolt inside a broken ring
    g.strokeStyle = '#5f8fd0'; g.lineWidth = 2;
    g.beginPath(); g.arc(24, 18, 13, 0.6, Math.PI * 2 - 0.6); g.stroke();
    g.fillStyle = '#bfe8ff';
    g.beginPath();
    g.moveTo(26, 6); g.lineTo(19, 19); g.lineTo(24, 19); g.lineTo(20, 30);
    g.lineTo(31, 15); g.lineTo(25, 15); g.lineTo(30, 6); g.closePath(); g.fill();
    px(g, 23, 8, '#ffffff', 2, 2);
  }
  outlineRect(g, 0, 0, 48, 36, '#0a0a0a');
  return c;
}

// Deterministic lightning schedule: 0 (calm) .. 1 (bright flash). A short
// double-blink recurs a few seconds apart so the title feels alive without
// ever settling into a distracting strobe.
function lightningLevel(t) {
  const period = 4.1;
  const p = ((t % period) + period) % period;
  if (p < 0.07) return 1;
  if (p > 0.13 && p < 0.19) return 0.6;
  return 0;
}

// The title logo doubles as an animated backdrop. Pass a seconds value `t`
// (default 0 for the static first paint) to drift the cloud bands and fire
// the occasional lightning flicker. Redraw at ~10fps while the title shows.
export function drawTitleLogo(canvas, t = 0) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const flash = lightningLevel(t);
  g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, W, H);
  // storm sky bands (lift toward violet-white during a flash)
  for (let y = 0; y < 70; y += 2) {
    const base = y % 4 ? 0x16121c : 0x1c1524;
    if (flash) {
      const r = ((base >> 16) & 255) + flash * 70;
      const gg = ((base >> 8) & 255) + flash * 60;
      const b = (base & 255) + flash * 80;
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    } else g.fillStyle = y % 4 ? '#16121c' : '#1c1524';
    g.fillRect(0, y, W, 2);
  }
  // slow drifting cloud bands — two layers at different speeds, wrapping
  const band = (yTop, h, speed, alpha) => {
    g.fillStyle = `rgba(60,52,74,${alpha})`;
    const off = ((t * speed) % (W + 64)) - 64;
    for (let k = -1; k < 6; k++) {
      const x = off + k * 84;
      g.fillRect(x, yTop, 52, h);
      g.fillRect(x + 14, yTop - 2, 26, h + 4);
    }
  };
  band(20, 6, 7, 0.16 + flash * 0.25);
  band(44, 5, 12, 0.12 + flash * 0.25);
  // horizon glow
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(200,60,30,${0.05 + i * 0.02})`;
    g.fillRect(0, 96 - i * 3, W, 3);
  }
  g.fillStyle = '#111'; g.fillRect(0, 100, W, H - 100);
  // silhouetted skyline + tanks
  g.fillStyle = '#070709';
  for (let i = 0; i < 12; i++) {
    const bw = 12 + ((i * 37) % 24), bh = 12 + ((i * 53) % 30);
    g.fillRect(8 + i * 26, 100 - bh, bw, bh);
  }
  g.fillStyle = '#050507';
  for (const tx of [40, 150, 250]) {
    g.fillRect(tx, 112, 30, 9);
    g.fillRect(tx + 8, 106, 13, 7);
    g.fillRect(tx + 14, 102, 14, 3);
  }
  // big blocky title
  const word = (txt, x, y, size, fill, shadow) => {
    g.font = `bold ${size}px monospace`;
    g.textBaseline = 'top';
    g.fillStyle = shadow; g.fillText(txt, x + 2, y + 3);
    g.fillStyle = fill; g.fillText(txt, x, y);
  };
  word('IRON', 66, 18, 42, '#e0a83a', '#5c3612');
  word('CURTAIN', 42, 56, 42, '#c23a2a', '#4a120c');
  g.fillStyle = '#e8dcc0';
  g.font = 'bold 10px monospace';
  g.fillText('A COLD-WAR RTS HOMAGE', 84, 132);
  // lightning bolt accent — glows brighter on a flash
  g.fillStyle = flash ? '#ffffff' : '#bfe8ff';
  g.beginPath();
  g.moveTo(160, 4); g.lineTo(150, 26); g.lineTo(158, 26); g.lineTo(146, 50);
  g.lineTo(166, 22); g.lineTo(157, 22); g.lineTo(168, 4); g.closePath();
  g.fill();
  // version tag, bottom-right
  g.fillStyle = '#6d6455';
  g.font = 'bold 9px monospace';
  g.textAlign = 'right';
  g.fillText('v0.2', W - 5, H - 12);
  g.textAlign = 'left';
}

// 64x48 sidebar icons in the classic cameo proportion: sprite on a dark
// gradient plate with a caption strip (caption drawn by DOM, not here).
export function makeCameo(sprite, label, scale = 1) {
  const [c, g] = makeCanvas(64, 48);
  const grad = g.createLinearGradient(0, 0, 0, 48);
  grad.addColorStop(0, '#3a4048'); grad.addColorStop(1, '#181c22');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 48);
  // faint grid
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 1, 48);
  for (let y = 0; y < 48; y += 8) g.fillRect(0, y, 64, 1);
  if (sprite) {
    const sw = sprite.width * scale, sh = sprite.height * scale;
    const fit = Math.min(56 / sw, 40 / sh, 2.2);
    const w = Math.max(8, Math.floor(sw * fit)), h = Math.max(8, Math.floor(sh * fit));
    g.imageSmoothingEnabled = false;
    g.drawImage(sprite, (64 - w) / 2, (44 - h) / 2, w, h);
  }
  outlineRect(g, 0, 0, 64, 48, '#0a0a0a');
  return c;
}
