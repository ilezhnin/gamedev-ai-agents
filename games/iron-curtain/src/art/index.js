// The art package's public face: assembles the sprite atlas out of the
// per-domain modules and re-exports the handful of symbols the rest of the
// game imports (TILE, FACINGS, BIOMES, buildSprites, drawTitleLogo, makeCameo).
//
// All in-game art is generated at boot — no image files. Original pixel work
// in a 16-bit console spirit: chunky shapes, hard ink outlines, dithered
// shading.

import { HOUSE, houseRecolor } from '../palette.js';
import { TILE, FACINGS } from './consts.js';
import {
  BIOMES, groundTile, dirtTile, waterTile, shoreTile, edgeTile, roadTile,
  rockTile, treeTile, ruinTile, iceTile, oreOverlay, gemOverlay, scorchDecal,
} from './tiles.js';
import { VEHICLE_PARTS, facingsOf, treadShift, harvSpinFrames } from './vehicles.js';
import { soldierFrames } from './infantry.js';
import {
  buildingSprites, guardTowerGun, radarDishFrames, crackOverlay,
} from './buildings.js';
import {
  explosionFrames, puffFrames, flameFrames, muzzleFrame, shellSprite,
  rocketSprite, smokeFrames, flagSprite, debrisSprite, unitShadowSprite,
  cloudShadowSprite, empRingSprite,
} from './effects.js';
import { rankChevrons, powerIcon, drawTitleLogo, makeCameo } from './ui-art.js';

export { TILE, FACINGS, BIOMES, drawTitleLogo, makeCameo };

// A unit's atlas entry is shaped one of two ways: vehicles carry `hull` (one
// canvas per facing), infantry carry `frames` (pose -> facing). Anything that
// just wants "a picture of this unit" — cameo strips, the selection panel, the
// first frame of a new view — goes through here instead of re-deriving it.
export function unitBodyFrame(set) {
  if (!set) return null;
  return set.hull ? set.hull[0] : set.frames[0][0];
}

export function buildSprites() {
  const S = {};

  // terrain per biome
  S.tiles = {};
  for (const biome of Object.keys(BIOMES)) {
    S.tiles[biome] = {
      ground: [1, 2, 3, 4].map((s) => groundTile(s, biome)),
      dirt: [11, 12].map((s) => dirtTile(s, biome)),
      water: [0, 1, 2, 3].map((f) => waterTile(21, f, biome)),
      rock: [31, 32].map((s) => rockTile(s, biome)),
      tree: [41, 42, 43].map((s) => treeTile(s, biome)),
      ruin: [51, 52, 53].map((s) => ruinTile(s, biome)),
    };
    // frozen taiga shores get a separate ice sheet tile set
    if (biome === 'taiga') S.tiles[biome].ice = [iceTile(61, 0), iceTile(61, 1)];
  }
  S.ore = [oreOverlay(1), oreOverlay(2), oreOverlay(3)];
  S.gem = [gemOverlay(1), gemOverlay(2), gemOverlay(3)];
  S.scorch = scorchDecal();
  S.shore = (base, mask, biome) => shoreTile(base, mask, biome);
  S.edge = (base, mask, biome) => edgeTile(base, mask, biome);
  S.road = (base, mask, biome) => roadTile(base, mask, biome);

  // faction-tinted body sets
  const factions = {
    player: HOUSE.player, enemy: HOUSE.enemy,
    enemy2: HOUSE.enemy2, enemy3: HOUSE.enemy3,
  };

  S.units = {};
  for (const [house, colors] of Object.entries(factions)) {
    const tint = (c) => houseRecolor(c, colors);
    // a tracked vehicle: base facings ("hull") + a tread-shifted "hullB" set,
    // alternated at ~8fps by the renderer while the unit is moving
    const veh = (hullFn, turretFn) => {
      const t = tint(hullFn());
      const set = { hull: facingsOf(t), hullB: facingsOf(treadShift(t)) };
      if (turretFn) set.turret = facingsOf(tint(turretFn()));
      return set;
    };
    const set = {};
    for (const [key, [hullFn, turretFn]] of Object.entries(VEHICLE_PARTS)) {
      set[key] = veh(hullFn, turretFn);
    }
    for (const kind of ['rifle', 'rocket', 'engineer']) {
      set[kind] = { frames: soldierFrames(kind).map((f) => facingsOf(tint(f))) };
    }
    S.units[house] = set;
  }

  S.buildings = {};
  const bsprites = buildingSprites();
  // buildings also tint for the neutral house (supply depots start neutral)
  const bfactions = { ...factions, neutral: HOUSE.neutral };
  for (const [house, colors] of Object.entries(bfactions)) {
    S.buildings[house] = {};
    for (const [k, spr] of Object.entries(bsprites)) {
      S.buildings[house][k] = houseRecolor(spr, colors);
    }
  }
  S.guardGun = {};
  for (const [house, colors] of Object.entries(factions)) {
    S.guardGun[house] = facingsOf(houseRecolor(guardTowerGun(), colors));
  }

  // fx
  S.explosion = explosionFrames();
  S.puff = puffFrames();
  S.muzzle = muzzleFrame();
  S.shell = shellSprite();
  S.rocket = rocketSprite();
  S.flame = flameFrames();
  S.smoke = smokeFrames();
  S.flag = flagSprite();
  S.debris = debrisSprite();

  // extra render-only art: rotating radar dish, harvester spinner, unit
  // shadow, damage decals (2 variants per footprint), drifting cloud blobs
  S.radarDish = radarDishFrames();
  S.harvSpin = harvSpinFrames();
  S.unitShadow = unitShadowSprite();
  S.cracks = {};
  for (const [w, h] of [[3, 3], [2, 2], [3, 2], [1, 1]]) {
    S.cracks[`${w}x${h}`] = [
      crackOverlay(w, h, 700 + w * 31 + h * 7),
      crackOverlay(w, h, 1900 + w * 13 + h * 17),
    ];
  }
  S.clouds = [cloudShadowSprite(11), cloudShadowSprite(29), cloudShadowSprite(53)];

  // veterancy chevrons, EMP shock ring, commander-power cameo glyphs
  S.rankChevrons = rankChevrons();
  S.empRing = empRingSprite();
  S.powerIcons = { recon: powerIcon('recon'), emp: powerIcon('emp') };

  return S;
}
