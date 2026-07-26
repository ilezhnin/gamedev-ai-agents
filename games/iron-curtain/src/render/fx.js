// Transient visuals: explosions/tracers/smoke spawned by the sim, ember debris,
// projectile quads, the building-placement ghost, rally-point flags and the
// building-death camera shake.

import * as THREE from '../../lib/three.module.min.js';
import { TILE } from '../sprites.js';
import { BUILDINGS } from '../rules.js';
import { SpriteQuad, Z, mapY } from './quad.js';

const SHAKE_TIME = 0.12;           // seconds a building-death kick lasts
const SHAKE_MAG = 2;               // peak offset in pixels

// Effect lifetimes, all in seconds. These are the whole of an effect's timing:
// nothing in the sim knows how long a puff lasts, it just spawns one and this
// module retires it. Frame times are per animation frame, not per effect.
const LIFE = {
  explosionFrame: 0.09,
  puffFrame: 0.07,
  puffTail: 0.05,          // extra hold after the last puff frame
  puffFrames: 3,
  smokeFrame: 0.22,
  smokeLife: 0.9,
  smokeRise: 0.25,         // cells/sec the plume drifts up
  tracer: 0.08,
  zap: 0.35,
  muzzle: 0.08,
  scorchHold: 20,          // full-opacity seconds before a scorch fades...
  scorchFade: 5,           // ...then this long fading out
  empRing: 0.7,
  empStartScale: 0.35,
  empGrow: 1.1,            // ring scale added over its life
};

// Ember chips flung out of a big blast: a hop on a little ballistic arc.
const DEBRIS = {
  minCount: 3, extraCount: 3,
  minSpeed: 1.4, extraSpeed: 2.6,
  drag: 0.9,               // velocity multiplier per tick
  gravity: 9,              // hop units/sec^2
  hop0: 0.2, minLift: 1.8, extraLift: 1.6,
  minLife: 0.5, extraLife: 0.4,
};

const ZAP_SEGMENTS = 7;    // polyline points in a tesla bolt (2 = a straight tracer)
const ZAP_JITTER = 0.7;    // cells of sideways wobble per interior point

export class Fx {
  constructor(scene, sprites) {
    this.scene = scene;
    this.sprites = sprites;
    this.views = [];               // live effect views (quad- or line-based)
    this.debris = [];              // { quad, x, y, vx, vy, hop, vh, t, life }
    this.liveProjectiles = new Set(); // last frame's projectiles, for disposal
    this.rallyFlags = [];
    this.ghostGroup = null;
    this.shakeT = 0;
    this.shakeMag = 0;
  }

  // ------------------------------------------------------------ effects ----

  sync(dt, ctx) {
    const { game } = ctx;
    const scene = this.scene, sprites = this.sprites;

    // consume newly spawned effects from the sim
    for (const e of game.effects.splice(0)) {
      if (e.kind === 'explosion') {
        this.views.push({ e, quad: new SpriteQuad(scene, sprites.explosion[0], e.big ? 1.6 : 1.1, e.big ? 1.6 : 1.1, Z.explosion) });
        if (e.big) this.spawnDebris(e.x + 0.5, e.y + 0.5);
      } else if (e.kind === 'puff') {
        this.views.push({ e, quad: new SpriteQuad(scene, sprites.puff[0], 0.6, 0.6, Z.puff) });
      } else if (e.kind === 'tracer' || e.kind === 'zap') {
        const pts = [];
        const n = e.kind === 'zap' ? ZAP_SEGMENTS : 2;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          let x = e.x0 + (e.x1 - e.x0) * t + 0.5;
          let y = e.y0 + (e.y1 - e.y0) * t + 0.5;
          if (e.kind === 'zap' && i > 0 && i < n) {
            x += (Math.random() - 0.5) * ZAP_JITTER;
            y += (Math.random() - 0.5) * ZAP_JITTER;
          }
          pts.push(new THREE.Vector3(x, -y, Z.tracer));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: e.kind === 'zap' ? 0xbfe8ff : 0xfff2b0, transparent: true });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        this.views.push({ e, line, mat, geo });
      } else if (e.kind === 'scorch') {
        const q = new SpriteQuad(scene, sprites.scorch, 1, 1, Z.scorch);
        q.set(e.x + 0.5, mapY(e.y + 0.5), Z.scorch);
        this.views.push({ e, quad: q });
      } else if (e.kind === 'smoke') {
        this.views.push({ e, quad: new SpriteQuad(scene, sprites.smoke[0], 0.7, 0.7, Z.smoke) });
      } else if (e.kind === 'muzzle') {
        const q = new SpriteQuad(scene, sprites.muzzle, 0.42, 0.42, Z.muzzle);
        q.set(e.x + 0.5, mapY(e.y + 0.5), Z.muzzle);
        this.views.push({ e, quad: q });
      } else if (e.kind === 'emp') {
        // EMP shock ring — coords are already in world (cell) space
        const q = new SpriteQuad(scene, sprites.empRing, e.r * 2, e.r * 2, Z.empRing);
        q.set(e.x, mapY(e.y), Z.empRing);
        this.views.push({ e, quad: q });
      }
    }

    for (const v of this.views) {
      const e = v.e;
      e.t += dt;
      if (e.kind === 'explosion') {
        if (e.t < 0) { v.quad.mesh.visible = false; continue; }
        const frame = Math.min(sprites.explosion.length - 1, Math.floor(e.t / LIFE.explosionFrame));
        v.quad.mesh.visible = true;
        v.quad.setCanvas(sprites.explosion[frame]);
        v.quad.set(e.x + 0.5, mapY(e.y + 0.5), Z.explosion);
        if (e.t > LIFE.explosionFrame * sprites.explosion.length) e.done = true;
      } else if (e.kind === 'puff') {
        const frame = Math.min(sprites.puff.length - 1, Math.floor(e.t / LIFE.puffFrame));
        v.quad.setCanvas(sprites.puff[frame]);
        v.quad.set(e.x + 0.5, mapY(e.y + 0.5), Z.puff);
        if (e.t > LIFE.puffFrame * LIFE.puffFrames + LIFE.puffTail) e.done = true;
      } else if (e.kind === 'tracer' || e.kind === 'zap') {
        v.mat.opacity = Math.max(0, 1 - e.t / (e.kind === 'zap' ? LIFE.zap : LIFE.tracer));
        if (v.mat.opacity <= 0) e.done = true;
      } else if (e.kind === 'scorch') {
        if (e.t > LIFE.scorchHold) {
          v.quad.mat.opacity = Math.max(0, 1 - (e.t - LIFE.scorchHold) / LIFE.scorchFade);
        }
        if (e.t > LIFE.scorchHold + LIFE.scorchFade) e.done = true;
      } else if (e.kind === 'smoke') {
        const frame = Math.min(sprites.smoke.length - 1, Math.floor(e.t / LIFE.smokeFrame));
        v.quad.setCanvas(sprites.smoke[frame]);
        v.quad.set(e.x + 0.5, mapY(e.y + 0.5 - e.t * LIFE.smokeRise), Z.smoke);
        v.quad.mat.opacity = Math.max(0, 1 - e.t / LIFE.smokeLife);
        if (e.t > LIFE.smokeLife) e.done = true;
      } else if (e.kind === 'muzzle') {
        if (e.t > LIFE.muzzle) e.done = true;
      } else if (e.kind === 'emp') {
        const life = LIFE.empRing;
        const s = LIFE.empStartScale + (e.t / life) * LIFE.empGrow;
        v.quad.mesh.scale.set(s, s, 1);
        v.quad.mat.opacity = Math.max(0, 1 - e.t / life);
        if (e.t > life) e.done = true;
      }
    }
    // cleanup
    for (let i = this.views.length - 1; i >= 0; i--) {
      const v = this.views[i];
      if (v.e.done) {
        this.disposeFxView(v);
        this.views.splice(i, 1);
      }
    }

    this.stepDebris(dt);
    this.syncProjectiles(game);
  }

  disposeFxView(v) {
    if (v.quad) v.quad.dispose(this.scene);
    if (v.line) { this.scene.remove(v.line); v.geo.dispose(); v.mat.dispose(); }
  }

  // --------------------------------------------------------- projectiles ---

  // quads pooled on the projectile object itself; a projectile that vanished
  // since last frame has its view disposed here
  syncProjectiles(game) {
    const sprites = this.sprites;
    for (const p of game.projectiles) {
      if (!p.view) {
        const c = p.kind === 'rocket' ? sprites.rocket : p.kind === 'flame' ? sprites.flame[0] : sprites.shell;
        const sz = p.kind === 'flame' ? 0.6 : 0.35;
        p.view = new SpriteQuad(this.scene, c, sz, sz, Z.projectile);
      }
      if (p.kind === 'flame') p.view.setCanvas(sprites.flame[Math.floor(game.time * 15) % 3]);
      p.view.set(p.x + 0.5, mapY(p.y + 0.5), Z.projectile);
      p.view.mesh.rotation.z = p.kind === 'flame' ? 0 : -(p.angle + Math.PI / 2);
      p.viewAlive = true;
    }
    const liveNow = new Set(game.projectiles);
    for (const old of this.liveProjectiles) {
      if (!liveNow.has(old) && old.view) old.view.dispose(this.scene);
    }
    this.liveProjectiles = liveNow;
  }

  // ------------------------------------------------------------- debris ----

  // Eject a handful of ember chips from a big blast. Each hops on a little arc
  // (a rising then falling height offset) and vanishes when it lands.
  spawnDebris(x, y) {
    const n = DEBRIS.minCount + (Math.random() * DEBRIS.extraCount | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = DEBRIS.minSpeed + Math.random() * DEBRIS.extraSpeed;
      const quad = new SpriteQuad(this.scene, this.sprites.debris, 0.16, 0.16, Z.debris);
      this.debris.push({
        quad, x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        hop: DEBRIS.hop0, vh: DEBRIS.minLift + Math.random() * DEBRIS.extraLift,
        t: 0, life: DEBRIS.minLife + Math.random() * DEBRIS.extraLife,
      });
    }
  }

  stepDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vx *= DEBRIS.drag; d.vy *= DEBRIS.drag;
      d.vh -= DEBRIS.gravity * dt; d.hop += d.vh * dt;
      if (d.hop < 0) d.hop = 0;
      d.quad.set(d.x, mapY(d.y) + d.hop, Z.debris);
      d.quad.mat.opacity = Math.max(0, 1 - d.t / d.life);
      if (d.t >= d.life) { d.quad.dispose(this.scene); this.debris.splice(i, 1); }
    }
  }

  // ---------------------------------------------------- placement ghost ----

  syncPlacementGhost(ctx) {
    const { game, map, input } = ctx;
    if (this.ghostGroup) {
      this.disposeGhost();
    }
    const p = game.players.player;
    if (!p.readyBuilding || !input.placeCursor) return;
    const def = BUILDINGS[p.readyBuilding.key];
    const [cx, cy] = input.placeCursor;
    const group = new THREE.Group();
    for (let y = 0; y < def.h; y++) {
      for (let x = 0; x < def.w; x++) {
        const ok = map.isBuildable(cx + x, cy + y);
        const mat = new THREE.MeshBasicMaterial({
          color: ok ? 0x3fdf4d : 0xdf3f2a, transparent: true, opacity: 0.4, depthWrite: false,
        });
        const cell = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), mat);
        cell.position.set(cx + x + 0.5, -(cy + y + 0.5), Z.ghost);
        group.add(cell);
      }
    }
    const valid = game.placementValid(p, p.readyBuilding.key, cx, cy);
    if (!valid) {
      // tint all cells red-ish if adjacency fails
      group.children.forEach((m) => m.material.color.setHex(0xdf3f2a));
    }
    this.scene.add(group);
    this.ghostGroup = group;
  }

  disposeGhost() {
    if (!this.ghostGroup) return;
    this.scene.remove(this.ghostGroup);
    this.ghostGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.ghostGroup = null;
  }

  // ------------------------------------------------------- rally flags -----

  // A pooled little flag marker at each selected factory/barracks rally point.
  syncRallyFlags(ctx) {
    const input = ctx.input;
    const wanted = input
      ? input.selection.filter((s) => s.isBuilding && !s.dead && s.house === 'player'
          && s.def.factoryFor && s.rally)
      : [];
    while (this.rallyFlags.length < wanted.length) {
      this.rallyFlags.push(new SpriteQuad(this.scene, this.sprites.flag, 0.55, 0.72, Z.rally));
    }
    for (let i = 0; i < this.rallyFlags.length; i++) {
      const q = this.rallyFlags[i];
      if (i < wanted.length) {
        const [rx, ry] = wanted[i].rally;
        q.mesh.visible = true;
        q.set(rx + 0.5, mapY(ry + 0.5) + 0.3, Z.rally);
      } else q.mesh.visible = false;
    }
  }

  // -------------------------------------------------------------- shake ----

  kickShake() { this.shakeT = SHAKE_TIME; this.shakeMag = SHAKE_MAG; }

  stepShake(dt) { if (this.shakeT > 0) this.shakeT -= dt; }

  // random offset in cells, decaying over the kick — render camera only
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const px = (this.shakeMag / TILE) * (this.shakeT / SHAKE_TIME);
    return [(Math.random() - 0.5) * 2 * px, (Math.random() - 0.5) * 2 * px];
  }

  // ---------------------------------------------------------- lifecycle ----

  dispose(game) {
    for (const v of this.views.splice(0)) this.disposeFxView(v);
    for (const p of game ? game.projectiles : []) if (p.view) p.view.dispose(this.scene);
    this.liveProjectiles.clear();
    for (const q of this.rallyFlags.splice(0)) q.dispose(this.scene);
    for (const d of this.debris.splice(0)) d.quad.dispose(this.scene);
    this.disposeGhost();
    this.shakeT = 0; this.shakeMag = 0;
  }
}
