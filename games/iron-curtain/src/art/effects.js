// Effects art: the short-lived stuff the renderer spawns and throws away —
// explosions, flame, smoke, muzzle flashes, projectiles, debris chips — plus
// the always-on world dressing (unit shadows, drifting cloud blobs, the EMP
// shock ring and the rally flag).

import { PAL, makeCanvas, px, makeRng } from '../palette.js';

export function explosionFrames() {
  const frames = [];
  const steps = 6;
  for (let f = 0; f < steps; f++) {
    const [c, g] = makeCanvas(32, 32);
    const t = f / (steps - 1);
    const r = 4 + t * 11;
    const cx = 16, cy = 16;
    const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, Math.max(0.5, rad), 0, 7); g.fill(); };
    if (t < 0.7) {
      ring(r, PAL.fire4); ring(r * 0.8, PAL.fire3); ring(r * 0.55, PAL.fire2); ring(r * 0.3, PAL.fire1);
      if (t < 0.3) ring(r * 0.15, '#ffffff');
    } else {
      ring(r, PAL.smoke2); ring(r * 0.7, PAL.smoke1); ring(r * 0.35, PAL.fire4);
    }
    // debris pixels
    const rng = makeRng(90 + f * 31);
    for (let i = 0; i < 10; i++) {
      const a = rng() * 6.28, d = r * (0.8 + rng() * 0.5);
      px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng() < 0.5 ? PAL.fire2 : PAL.smoke2);
    }
    frames.push(c);
  }
  return frames;
}

export function puffFrames() {
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const [c, g] = makeCanvas(12, 12);
    const r = 2 + f * 1.7;
    g.fillStyle = f < 2 ? PAL.fire2 : PAL.smoke1;
    g.beginPath(); g.arc(6, 6, r, 0, 7); g.fill();
    g.fillStyle = f < 1 ? PAL.fire1 : PAL.smoke2;
    g.beginPath(); g.arc(6, 5, r * 0.5, 0, 7); g.fill();
    frames.push(c);
  }
  return frames;
}

// short-lived flame projectile: a 3-frame orange puff stream
export function flameFrames() {
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const [c, g] = makeCanvas(12, 12);
    const r = 3 + f * 1.2;
    g.fillStyle = PAL.fire4; g.beginPath(); g.arc(6, 6, r + 1, 0, 7); g.fill();
    g.fillStyle = PAL.fire3; g.beginPath(); g.arc(6, 6, r, 0, 7); g.fill();
    g.fillStyle = PAL.fire2; g.beginPath(); g.arc(6, 6 - f * 0.5, r * 0.6, 0, 7); g.fill();
    g.fillStyle = PAL.fire1; g.beginPath(); g.arc(6, 5, r * 0.3, 0, 7); g.fill();
    const rng = makeRng(700 + f * 17);
    for (let i = 0; i < 5; i++) px(g, 3 + rng() * 6, 2 + rng() * 7, i % 2 ? PAL.fire1 : PAL.fire2);
    frames.push(c);
  }
  return frames;
}

export function muzzleFrame() {
  const [c, g] = makeCanvas(8, 8);
  px(g, 3, 1, PAL.fire1, 2, 5);
  px(g, 1, 3, PAL.fire1, 6, 2);
  px(g, 3, 3, '#ffffff', 2, 2);
  return c;
}

export function shellSprite() {
  const [c, g] = makeCanvas(6, 6);
  px(g, 2, 1, PAL.fire1, 2, 3);
  px(g, 2, 4, PAL.fire2, 2, 1);
  return c;
}

export function rocketSprite() {
  const [c, g] = makeCanvas(8, 8);
  px(g, 3, 0, PAL.steel1, 2, 4);
  px(g, 3, 4, PAL.fire2, 2, 2);
  px(g, 3, 6, PAL.fire1, 2, 1);
  return c;
}

export function smokeFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const [c, g] = makeCanvas(14, 14);
    const rng = makeRng(500 + f * 13);
    for (let i = 0; i < 6; i++) {
      const x = 3 + rng() * 7, y = 10 - f * 2.4 - rng() * 3;
      const r = 1.5 + rng() * (1 + f * 0.5);
      g.fillStyle = i % 2 ? PAL.smoke1 : PAL.smoke2;
      g.globalAlpha = 0.85 - f * 0.16;
      g.beginPath(); g.arc(x, Math.max(2, y), r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    frames.push(c);
  }
  return frames;
}

// Tiny rally-point flag: a dark pole with a gold pennant, drawn at the
// destination cell of a selected factory/barracks so the player can see
// where fresh units will muster.
export function flagSprite() {
  const [c, g] = makeCanvas(12, 16);
  // shadow under the pole
  px(g, 3, 15, PAL.shadow, 5, 1);
  // pole
  px(g, 3, 1, PAL.ink, 1, 14);
  px(g, 4, 1, '#8f8065', 1, 14);
  // pennant, notched at the fly end
  const gold = PAL.ore1, goldHi = PAL.oreHi, red = '#c23a2a';
  px(g, 5, 1, PAL.ink, 6, 7);
  px(g, 5, 2, gold, 5, 5);
  px(g, 5, 2, goldHi, 5, 1);
  px(g, 5, 3, red, 4, 1);
  px(g, 9, 3, gold, 1, 3);
  // triangular notch on the flying edge
  px(g, 8, 2, PAL.ink, 1, 1);
  px(g, 7, 6, PAL.ink, 3, 1);
  return c;
}

// EMP shock ring: concentric electric-blue rings on transparent, scaled up
// and faded by the renderer over ~0.7s when a blast lands.
export function empRingSprite() {
  const S = 64;
  const [c, g] = makeCanvas(S, S);
  const cx = S / 2, cy = S / 2;
  for (const [r, col, lw] of [[30, PAL.zap, 3], [22, PAL.zapCore, 2], [14, PAL.zap, 2]]) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  // a few radial sparks
  const rng = makeRng(8123);
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, d = 24 + rng() * 6;
    px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, PAL.zapCore, 2, 2);
  }
  return c;
}

// A soft dark ground shadow for units — one shared ellipse, scaled per unit.
export function unitShadowSprite() {
  const [c, g] = makeCanvas(24, 14);
  g.fillStyle = 'rgba(0,0,0,1)';
  g.beginPath(); g.ellipse(12, 7, 10, 5, 0, 0, 7); g.fill();
  return c;
}

// Tiny ember/debris chip flung by big explosions.
export function debrisSprite() {
  const [c, g] = makeCanvas(3, 3);
  px(g, 0, 0, PAL.fire2, 2, 2);
  px(g, 0, 0, PAL.fire1);
  px(g, 1, 1, PAL.smoke2);
  return c;
}

// A large soft cloud-shadow blob that drifts over the terrain. Radial alpha
// falloff so the edges are feathered; the caller keeps opacity very low.
export function cloudShadowSprite(seed) {
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  const rng = makeRng(seed);
  // a few overlapping radial gradients make an organic, non-circular blob
  for (let i = 0; i < 5; i++) {
    const cx = S / 2 + (rng() - 0.5) * 46, cy = S / 2 + (rng() - 0.5) * 32;
    const r = 26 + rng() * 26;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  return c;
}
