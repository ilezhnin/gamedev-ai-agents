// Angle helpers shared by aiming, driving and sprite-frame selection. Facings
// wrap at 2*PI, so every comparison has to go through these rather than plain
// subtraction.

import { FACINGS } from '../sprites.js';

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function facingIndex(angle) {
  const step = (Math.PI * 2) / FACINGS;
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / step) % FACINGS;
}
