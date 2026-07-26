// Per-entity views: one bundle of quads per unit/building (body, turret,
// shadow, health bar, selection box, rank chevrons, damage decal), created on
// demand and disposed when the entity leaves the field.

import { TILE, unitBodyFrame } from '../sprites.js';
import { makeCanvas } from '../palette.js';
import { facingIndex } from '../sim/angles.js';
import { SpriteQuad, Z, mapY } from './quad.js';

// Health bar geometry, in canvas pixels. BAR_STEPS also sets the cache
// granularity: a bar only redraws when it crosses a step boundary.
const BAR_W = 26, BAR_H = 4, BAR_STEPS = 24;
const BAR_GOOD = 0.6, BAR_WARN = 0.3;    // fractions where the colour changes

// health bars are bucketed and cached: one shared canvas per width step, so
// per-frame updates cost nothing unless the bucket (and thus canvas) changes
const healthBarCache = [];
function healthBarCanvas(frac) {
  const bucket = Math.max(0, Math.min(BAR_STEPS, Math.round(frac * BAR_STEPS)));
  if (healthBarCache[bucket]) return healthBarCache[bucket];
  const f = bucket / BAR_STEPS;
  const [c, ctx] = makeCanvas(BAR_W, BAR_H);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, BAR_W, BAR_H);
  const w = Math.max(1, Math.round(BAR_STEPS * f));
  ctx.fillStyle = f > BAR_GOOD ? '#3fbf4d' : f > BAR_WARN ? '#e0c53a' : '#d64f2a';
  ctx.fillRect(1, 1, w, 2);
  healthBarCache[bucket] = c;
  return c;
}

// selection reticle: four corner brackets, no full box
function selBoxCanvas(sizePx) {
  const [c, g] = makeCanvas(sizePx, sizePx);
  g.strokeStyle = '#eaeaea';
  const L = Math.max(3, sizePx / 5);
  g.lineWidth = 1;
  for (const [x0, y0, dx, dy] of [[0.5, 0.5, 1, 1], [sizePx - 0.5, 0.5, -1, 1], [0.5, sizePx - 0.5, 1, -1], [sizePx - 0.5, sizePx - 0.5, -1, -1]]) {
    g.beginPath();
    g.moveTo(x0 + dx * L, y0); g.lineTo(x0, y0); g.lineTo(x0, y0 + dy * L);
    g.stroke();
  }
  return c;
}
const SELBOX_UNIT = selBoxCanvas(28);
const SELBOX_BIG = selBoxCanvas(48);

export class Views {
  // onBuildingDeath fires once per frame in which a structure vanished — the
  // camera shake lives in fx.js, so it is handed in rather than reached for.
  constructor(scene, sprites, onBuildingDeath) {
    this.scene = scene;
    this.sprites = sprites;
    this.onBuildingDeath = onBuildingDeath;
    this.views = new Map();           // entity id -> view objects
    this.knownBuildingIds = new Set(); // for detecting building deaths (shake)
  }

  disposeView(v) {
    for (const q of Object.values(v.quads)) q.dispose(this.scene);
  }

  ensureUnitView(u) {
    let v = this.views.get(u.id);
    if (v) return v;
    const sprites = this.sprites;
    const set = sprites.units[u.colour][u.key];
    const scale = (u.def.size + 4) / TILE;
    v = { kind: 'unit', quads: {} };
    // soft ground shadow, wider than tall, sitting just above the terrain
    const shScale = set.hull ? scale * 0.85 : scale * 0.55;
    v.quads.shadow = new SpriteQuad(this.scene, sprites.unitShadow, shScale, shScale * 0.55, Z.shadow);
    v.quads.shadow.mat.opacity = 0.25;
    v.quads.body = new SpriteQuad(this.scene, unitBodyFrame(set), scale, scale, Z.unit);
    if (set.turret) v.quads.turret = new SpriteQuad(this.scene, set.turret[0], scale, scale, Z.turret);
    // harvester intake spinner (shown only while scooping ore)
    if (u.def.harvester) v.quads.spin = new SpriteQuad(this.scene, sprites.harvSpin[0], 0.42, 0.42, Z.harvSpin);
    v.quads.health = new SpriteQuad(this.scene, healthBarCanvas(1), 1.0, 0.16, Z.health);
    // veterancy chevrons ride just above the health bar (armed units only)
    if (u.def.weapon) v.quads.rank = new SpriteQuad(this.scene, sprites.rankChevrons[0], 0.5, 0.36, Z.rank);
    v.quads.sel = new SpriteQuad(this.scene, SELBOX_UNIT, scale + 0.25, scale + 0.25, Z.select);
    this.views.set(u.id, v);
    return v;
  }

  ensureBuildingView(b) {
    let v = this.views.get(b.id);
    if (v) return v;
    const sprites = this.sprites;
    const spr = sprites.buildings[b.colour][b.key];
    v = { kind: 'building', house: b.house, quads: {}, puffT: 1 + Math.random() * 2, hvySmokeT: 0 };
    v.quads.body = new SpriteQuad(this.scene, spr, b.def.w, b.def.h, Z.building);
    if (b.def.weapon && b.key === 'guard') {
      v.quads.turret = new SpriteQuad(this.scene, sprites.guardGun[b.colour][0], 1, 1, Z.guardGun);
    }
    // rotating radar dish overlay
    if (b.key === 'radar') {
      v.quads.dish = new SpriteQuad(this.scene, sprites.radarDish[0], b.def.w, b.def.h, Z.dish);
    }
    // battle-damage decal (shown < 50% hp); pick one of two footprint variants
    const ck = sprites.cracks[`${b.def.w}x${b.def.h}`];
    if (ck) {
      v.crack = ck[b.id % ck.length];
      v.quads.crack = new SpriteQuad(this.scene, v.crack, b.def.w, b.def.h, Z.crack);
    }
    v.quads.health = new SpriteQuad(this.scene, healthBarCanvas(1), Math.max(1, b.def.w * 0.8), 0.16, Z.health);
    v.quads.sel = new SpriteQuad(this.scene, SELBOX_BIG, b.def.w + 0.2, b.def.h + 0.2, Z.select);
    this.views.set(b.id, v);
    return v;
  }

  sync(dt, ctx) {
    const { game, map, input, halted } = ctx;
    const sprites = this.sprites;
    const seen = new Set();

    for (const b of game.buildings) {
      if (b.dead) continue;
      seen.add(b.id);
      // a captured building changed colour — rebuild its view with new tint
      let ev = this.views.get(b.id);
      if (ev && ev.kind === 'building' && ev.house !== b.house) {
        this.disposeView(ev); this.views.delete(b.id);
      }
      const v = this.ensureBuildingView(b);
      const [cx, cy] = b.centre();
      // enemy buildings stay on the map once scouted (classic "last seen" rule)
      if (b.house !== 'player' && game.isVisibleToPlayer(b)) b.seen = true;
      const vis = b.house === 'player' || b.seen;
      for (const q of Object.values(v.quads)) q.mesh.visible = false;
      if (!vis) continue;
      v.quads.body.mesh.visible = true;
      const rise = b.buildRise;
      v.quads.body.set(cx, mapY(cy), Z.building);
      const bs = rise < 1 ? 0.6 + rise * 0.4 : 1;
      v.quads.body.mesh.scale.set(bs, bs, 1);
      v.quads.body.mat.opacity = rise < 1 ? 0.55 + rise * 0.45 : 1;
      if (v.quads.turret) {
        v.quads.turret.mesh.visible = true;
        const set = sprites.guardGun[b.colour];
        v.quads.turret.setCanvas(set[facingIndex(b.turretFacing)]);
        v.quads.turret.set(cx, mapY(cy), Z.guardGun);
      }
      // rotating radar dish (only once the structure has risen)
      if (v.quads.dish && rise >= 1) {
        v.quads.dish.mesh.visible = true;
        v.quads.dish.setCanvas(sprites.radarDish[Math.floor(game.time * 4) % 4]);
        v.quads.dish.set(cx, mapY(cy), Z.dish);
      }
      // battle-damage decal below half health
      const hpFrac = b.hp / b.maxHp;
      if (v.quads.crack && rise >= 1 && hpFrac < 0.5) {
        v.quads.crack.mesh.visible = true;
        v.quads.crack.set(cx, mapY(cy), Z.crack);
        v.quads.crack.mat.opacity = Math.min(1, (0.5 - hpFrac) * 3);
      }
      // idle power-plant exhaust + heavier smoke when badly hurt
      if (!halted && rise >= 1) {
        if (b.key === 'power') {
          v.puffT -= dt;
          if (v.puffT <= 0) {
            v.puffT = 1.6 + Math.random() * 1.8;
            game.effects.push({ kind: 'smoke', t: 0, x: b.cx + 0.5, y: b.cy + 0.35 });
            game.effects.push({ kind: 'smoke', t: 0, x: b.cx + b.def.w - 0.6, y: b.cy + 0.35 });
          }
        }
        if (hpFrac < 0.25) {
          v.hvySmokeT -= dt;
          if (v.hvySmokeT <= 0) {
            v.hvySmokeT = 0.35 + Math.random() * 0.4;
            game.effects.push({
              kind: 'smoke', t: 0,
              x: b.cx + 0.4 + Math.random() * (b.def.w - 0.8),
              y: b.cy + 0.3 + Math.random() * (b.def.h - 0.8),
            });
          }
        }
      }
      const selected = input.selection.includes(b);
      const hurt = b.hp < b.maxHp;
      if (selected || hurt || b.repairing) {
        v.quads.health.mesh.visible = true;
        v.quads.health.setCanvas(healthBarCanvas(Math.max(0, b.hp / b.maxHp)));
        v.quads.health.set(cx, mapY(cy - b.def.h / 2 - 0.25), Z.health);
      }
      if (selected) {
        v.quads.sel.mesh.visible = true;
        v.quads.sel.set(cx, mapY(cy), Z.select);
      }
    }

    for (const u of game.units) {
      if (u.dead || u.boarded) continue;   // boarded units ride inside an APC
      seen.add(u.id);
      const v = this.ensureUnitView(u);
      const vis = u.house === 'player' || game.isVisibleToPlayer(u);
      for (const q of Object.values(v.quads)) q.mesh.visible = false;
      if (!vis) continue;

      // ground shadow, offset a touch down-right for a low sun
      if (v.quads.shadow) {
        v.quads.shadow.mesh.visible = true;
        v.quads.shadow.set(u.x + 0.58, mapY(u.y + 0.62), Z.shadow);
      }

      const set = sprites.units[u.colour][u.key];
      const f = facingIndex(u.facing);
      let bodyCanvas;
      if (set.hull) {
        // vehicles: alternate base / tread-shifted hull at ~8fps while rolling
        bodyCanvas = (set.hullB && u.moving && Math.floor(u.animT * 8) % 2)
          ? set.hullB[f] : set.hull[f];
      } else {
        // infantry: walk cycle / fire pose
        let pose = 0;
        if (u.fireFlash && u.fireFlash > 0) pose = 2;
        else if (u.moving) pose = Math.floor(u.animT * 6) % 2;
        bodyCanvas = set.frames[pose][f];
      }
      v.quads.body.mesh.visible = true;
      v.quads.body.setCanvas(bodyCanvas);
      v.quads.body.set(u.x + 0.5, mapY(u.y + 0.5), Z.unit);
      // EMP disable: pulse the hull electric blue while frozen, else normal
      if (u.empT > 0) {
        const p = 0.55 + 0.35 * Math.sin(game.time * 12);
        v.quads.body.mat.color.setRGB(p * 0.7, p * 0.85, 1);
      } else v.quads.body.mat.color.setRGB(1, 1, 1);
      if (v.quads.turret) {
        v.quads.turret.mesh.visible = true;
        if (u.empT > 0) v.quads.turret.mat.color.copy(v.quads.body.mat.color);
        else v.quads.turret.mat.color.setRGB(1, 1, 1);
        v.quads.turret.setCanvas(set.turret[facingIndex(u.turretFacing)]);
        // muzzle recoil: shove the turret back 1px along the barrel on fire
        let rx = 0, ry = 0;
        if (u.fireFlash > 0) {
          const a = u.turretFacing;
          rx = -Math.cos(a) * 0.06; ry = -Math.sin(a) * 0.06;
        }
        v.quads.turret.set(u.x + 0.5 + rx, mapY(u.y + 0.5) - ry, Z.turret);
      }
      // harvester intake spinner while actively scooping
      if (v.quads.spin) {
        const scooping = u.order && u.order.type === 'harvest' && !u.moving
          && map.ore[map.idx(u.cellX, u.cellY)] > 0;
        if (scooping) {
          v.quads.spin.mesh.visible = true;
          v.quads.spin.setCanvas(sprites.harvSpin[Math.floor(game.time * 10) % 2]);
          v.quads.spin.set(u.x + 0.5, mapY(u.y + 0.5), Z.harvSpin);
        }
      }
      // the muzzle-flash pose is a view timer: nothing in the sim decays it
      if (u.fireFlash > 0) u.fireFlash -= dt;

      const selected = input.selection.includes(u);
      if (selected || u.hp < u.maxHp) {
        v.quads.health.mesh.visible = true;
        v.quads.health.setCanvas(healthBarCanvas(Math.max(0, u.hp / u.maxHp)));
        v.quads.health.set(u.x + 0.5, mapY(u.y + 0.5 - 0.75), Z.health);
      }
      if (selected) {
        v.quads.sel.mesh.visible = true;
        v.quads.sel.set(u.x + 0.5, mapY(u.y + 0.5), Z.select);
      }
      // veterancy chevrons above the health bar
      if (v.quads.rank && u.rank > 0) {
        v.quads.rank.mesh.visible = true;
        v.quads.rank.setCanvas(sprites.rankChevrons[Math.min(1, u.rank - 1)]);
        v.quads.rank.set(u.x + 0.5, mapY(u.y + 0.5 - 0.95), Z.rank);
      }
    }

    // remove views for gone entities
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.disposeView(v);
        this.views.delete(id);
      }
    }

    // a structure that vanished since last frame just died — kick the camera
    const curB = new Set();
    for (const b of game.buildings) if (!b.dead) curB.add(b.id);
    if (!halted) {
      for (const id of this.knownBuildingIds) {
        if (!curB.has(id)) { this.onBuildingDeath(); break; }
      }
    }
    this.knownBuildingIds = curB;
  }

  dispose() {
    for (const [, v] of this.views) this.disposeView(v);
    this.views.clear();
    this.knownBuildingIds = new Set();
  }
}
