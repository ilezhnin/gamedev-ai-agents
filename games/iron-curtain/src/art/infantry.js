// Infantry art: tiny 12x12 soldiers drawn facing north, 2 walk frames + a
// fire frame each.
//
// Every trooper shares the same torso column and the same boot rows; only the
// weapon and head rows differ. Those shared rows live here once, so a new kind
// is a handful of ASCII lines in TROOPERS instead of three near-identical
// 12-row maps.

import { PAL, makeCanvas, drawMap } from '../palette.js';
import { HN } from './consts.js';

const BLANK = '............';

// standard torso: helmet-coloured shoulders over a belted waist
const TORSO = [
  '...kUUk.....',
  '..kUUUUk....',
  '..kuUUuk....'];
const LEGS_STAND = [
  '...kuuk.....',
  '...kuuk.....',
  '..kb..bk....'];
const LEGS_WALK = [
  '...kuuk.....',
  '..kb.uk.....',
  '.....kbk....'];

// Per kind: the upper body (weapon rows then the head row) for the resting
// pose, an optional firing variant, and a torso override. A firing pose that
// grows upward sets `drop` so the figure still fits the 12-row frame — the
// legs lose their topmost row instead of the boots falling off the canvas.
const TROOPERS = {
  rifle: {
    torso: TORSO,
    stand: [
      '....gg......',
      '....gg......',
      '..k.kk.k....',
      '..kUssUk....'],
    fire: {
      drop: 1,
      top: [
        '....rr......',
        '....gg......',
        '....gg......',
        '..kkkk.k....',
        '..kUssUk....'],
    },
  },

  // rocket trooper: launch tube on the shoulder, muzzle flare at the mouth
  rocket: {
    torso: TORSO,
    stand: [
      '...kGGk.....',
      '...kGgk.....',
      '...kGgk.....',
      '..kkssUk....'],
    fire: {
      top: [
        '...krrk.....',
        '...kGGk.....',
        '...kGgk.....',
        '..kkssUk....'],
    },
  },

  // unarmed sapper: yellow hardhat, tool case at the hip (the x column), and
  // no firing pose — pose 2 falls back to the stand rows.
  engineer: {
    torso: [
      '...kUUk.....',
      '..kUUUUk....',
      '..kUUUUx....',
      '..kuUUux....'],
    stand: [
      BLANK,
      '...yyyy.....',
      '..kyssyk....'],
  },
};

// pose: 0 = stand / walk A, 1 = walk B, 2 = fire
export function soldierFrames(kind) {
  // unknown kinds read as rocket troopers, as they always have
  const T = TROOPERS[kind] || TROOPERS.rocket;
  const mk = (pose) => {
    const [c, g] = makeCanvas(12, 12);
    const L = {
      k: PAL.ink, s: PAL.skin, b: PAL.boots,
      u: HN[1], U: HN[2], g: PAL.gun2, G: PAL.gun1, r: PAL.fire3,
      y: PAL.fire1, x: PAL.steel2,   // hardhat + toolbox for engineers
    };
    const fire = pose === 2 ? T.fire : null;
    const legs = pose === 1 ? LEGS_WALK : LEGS_STAND;
    drawMap(g, [
      ...(fire ? fire.top : T.stand),
      ...T.torso,
      ...legs.slice(fire ? (fire.drop || 0) : 0),
    ], L);
    return c;
  };
  return [mk(0), mk(1), mk(2)];
}
