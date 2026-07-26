// Everything that shoots or dies: target acquisition, aiming, weapon firing,
// salvos, projectiles, splash, damage resolution, veterancy and the two ways a
// unit can be removed from the field (destroyed, or crushed under treads).

import { WEAPONS, WARHEADS, COMBAT } from '../rules.js';
import { RANK_DMG, RANK_HP, MAX_RANK } from './entities.js';
import { angleDiff, approachAngle } from './angles.js';
import { orderAttack } from './orders.js';

// Effect/projectile coords live in "sprite space": the renderer adds +0.5, so
// unit positions pass through and building centres shift back half a cell.
const spriteXY = (e) => e.isUnit ? [e.x, e.y] : [e.centre()[0] - 0.5, e.centre()[1] - 0.5];

// ----------------------------------------------------------- acquisition --

export function acquireTarget(game, u) {
  if (!u.def.weapon) return null;
  const w = WEAPONS[u.def.weapon];
  const range = w.range + COMBAT.acquireSlack;
  let best = null, bestD = 1e9;
  for (const e of game.units) {
    if (e.dead || e.boarded || e.owner === u.owner) continue;
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d < range && d < bestD) { best = e; bestD = d; }
  }
  for (const b of game.buildings) {
    if (b.dead || b.owner === u.owner || b.def.isDepot) continue;
    const [bx, by] = b.centre();
    const d = Math.hypot(bx - u.x, by - u.y) - Math.max(b.def.w, b.def.h) * 0.4;
    if (d < range && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

// defence structures only ever shoot at units, and only inside exact range
export function acquireTargetFor(game, b) {
  const w = WEAPONS[b.def.weapon];
  const [bx, by] = b.centre();
  let best = null, bestD = 1e9;
  for (const e of game.units) {
    if (e.dead || e.boarded || e.owner === b.owner) continue;
    const d = Math.hypot(e.x - bx, e.y - by);
    if (d <= w.range && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

// ------------------------------------------------------------- firing ----

export function aimAndFire(game, u, target, tx, ty, dt) {
  if (u.empT > 0) return;                    // EMP'd: weapons offline
  const want = Math.atan2(ty - u.y, tx - u.x) + Math.PI / 2;
  const turnRate = (u.def.turn || COMBAT.aimTurnFallback) * COMBAT.turretTurnRate;
  if (u.def.hasTurret) {
    u.turretFacing = approachAngle(u.turretFacing, want, turnRate * dt);
    if (angleDiff(u.turretFacing, want) > COMBAT.turretAimTolerance) return;
  } else {
    u.facing = approachAngle(u.facing, want, turnRate * dt);
    u.turretFacing = u.facing;
    if (angleDiff(u.facing, want) > COMBAT.hullAimTolerance) return;
  }
  if (u.cooldown > 0) return;
  const w = WEAPONS[u.def.weapon];
  u.cooldown = w.rof;
  u.fireFlash = COMBAT.fireFlashTime;
  fireWeapon(game, u, target, w);
}

// the weapon half of a defence structure's tick: acquire, traverse, fire
export function tickDefence(game, b, dt) {
  if (b.cooldown > 0) b.cooldown -= dt;
  if (b.empT > 0) { b.target = null; return; }     // EMP'd defence: offline
  if (b.def.needsPower && b.owner.lowPower()) { b.target = null; return; }
  if (!b.target || b.target.dead) b.target = acquireTargetFor(game, b);
  if (!b.target) return;
  const w = WEAPONS[b.def.weapon];
  const [bx, by] = b.centre();
  const [tx, ty] = b.target.isUnit ? [b.target.x, b.target.y] : b.target.centre();
  const d = Math.hypot(tx - bx, ty - by);
  if (d > w.range + COMBAT.defenceHoldSlack) { b.target = null; return; }
  const want = Math.atan2(ty - by, tx - bx) + Math.PI / 2;
  b.turretFacing = approachAngle(b.turretFacing, want, COMBAT.defenceTraverse * dt);
  if (b.cooldown <= 0 && angleDiff(b.turretFacing, want) < COMBAT.hullAimTolerance) {
    b.cooldown = w.rof;
    b.fireFlash = COMBAT.fireFlashTime;
    fireWeapon(game, b, b.target, w);
  }
}

// fire one weapon: single shot, or a staggered salvo of N projectiles
export function fireWeapon(game, src, target, w) {
  const salvo = w.salvo || 1;
  if (salvo <= 1) { spawnProjectile(game, src, target, w); return; }
  const aim = spriteXY(target);   // remembered impact point if the target dies
  for (let i = 0; i < salvo; i++) {
    game.pendingShots.push({ t: i * (w.stagger || COMBAT.salvoStagger), src, target, w, aim });
  }
}

export function tickPendingShots(game, dt) {
  if (game.pendingShots.length === 0) return;
  for (const s of game.pendingShots) {
    s.t -= dt;
    if (s.t <= 0) {
      if (s.src && !s.src.dead) spawnProjectile(game, s.src, s.target, s.w, s.aim);
      s.done = true;
    }
  }
  game.pendingShots = game.pendingShots.filter((s) => !s.done);
}

export function spawnProjectile(game, src, target, w, aim = null) {
  const [sx, sy] = spriteXY(src);
  // aim at the live target, or the remembered point if it's already gone
  const live = target && !target.dead ? target : null;
  let tx, ty;
  if (live) [tx, ty] = spriteXY(live);
  else if (aim) [tx, ty] = aim;
  else return;
  game.audio.sfx(w.sound);
  // muzzle flash at the barrel tip (cannons and tower guns)
  if (w.projectile === 'shell' || w.sound === 'mg') {
    const a = src.turretFacing - Math.PI / 2;
    game.effects.push({
      kind: 'muzzle', t: 0,
      x: sx + Math.cos(a) * 0.55,
      y: sy + Math.sin(a) * 0.55,
    });
  }
  if (w.projectile === 'tracer') {
    // hitscan with a brief tracer line
    game.effects.push({ kind: 'tracer', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.06 });
    game.effects.push({ kind: 'puff', x: tx + (game.rng() - 0.5) * 0.4, y: ty + (game.rng() - 0.5) * 0.4, t: 0, frame: 0 });
    if (w.splash) applySplash(game, tx, ty, w, src);
    else if (live) dealDamage(game, live, w, src);
  } else if (w.projectile === 'zap') {
    game.effects.push({ kind: 'zap', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.35 });
    if (w.splash) applySplash(game, tx, ty, w, src);
    else if (live) dealDamage(game, live, w, src);
  } else {
    game.projectiles.push({
      x: sx, y: sy, tx, ty, target: live, w, src,
      speed: w.speed || COMBAT.projectileSpeed,
      kind: w.projectile,
      angle: Math.atan2(ty - sy, tx - sx),
    });
  }
}

// area-of-effect: full damage at the impact cell, a fraction out to the
// splash radius. Same-owner entities are spared — full classic friendly fire
// made siege units (artillery, rocket trucks) shred their own melee escorts,
// which wrecked AI pushes; sparing allies keeps AoE a clean anti-blob tool.
export function applySplash(game, x, y, w, src) {
  const rad = w.splash;
  const inner = COMBAT.splashInner;
  const factor = w.splashFactor ?? COMBAT.splashFactor;
  const hit = (e, ex, ey) => {
    if (e.dead || e.boarded) return;
    if (src && e.owner === src.owner) return;   // no splash on friendlies
    const d = Math.hypot(ex - x, ey - y);
    if (d > rad) return;
    dealDamage(game, e, w, src, d <= inner ? 1 : factor);
  };
  for (const u of game.units) hit(u, u.x, u.y);
  for (const b of game.buildings) {
    const [bx, by] = b.centre();
    hit(b, bx - 0.5, by - 0.5);
  }
}

export function tickProjectiles(game, dt) {
  for (const p of game.projectiles) {
    if (p.target && !p.target.dead && p.target.isUnit) {
      p.tx = p.target.x; p.ty = p.target.y;
    }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    const step = p.speed * dt;
    p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
    if (d <= step) {
      p.done = true;
      game.effects.push({ kind: 'puff', x: p.tx, y: p.ty, t: 0, frame: 0 });
      if (p.w.splash) applySplash(game, p.tx, p.ty, p.w, p.src);
      else if (p.target && !p.target.dead) dealDamage(game, p.target, p.w, p.src);
    } else {
      p.x += Math.cos(p.angle) * step;
      p.y += Math.sin(p.angle) * step;
    }
  }
  game.projectiles = game.projectiles.filter((p) => !p.done);
}

// ------------------------------------------------------------- damage ----

export function dealDamage(game, target, w, src, factor = 1) {
  if (target.dead) return;
  const mult = WARHEADS[w.warhead][target.def.armor] ?? 1;
  // veteran shooters hit harder
  const rankMult = (src && src.isUnit && src.rank) ? RANK_DMG[src.rank] : 1;
  target.hp -= w.damage * mult * factor * rankMult;
  // human base under attack notification
  if (target.owner.isHuman && game.underAttackCooldown <= 0) {
    game.underAttackCooldown = COMBAT.underAttackCooldown;
    game.audio.sfx('alert');
    game.audio.say(target.isBuilding ? 'Base under attack' : 'Units under attack', true);
    game.emit('warn', target.isBuilding ? 'BASE UNDER ATTACK' : 'UNITS UNDER ATTACK');
  }
  // return fire immediately, even mid-march
  if (target.isUnit && target.def.weapon && src && !src.dead &&
      (target.order.type === 'idle' || target.order.type === 'move')) {
    orderAttack(game, target, src.isUnit || src.isBuilding ? src : null);
  }
  if (target.hp <= 0) {
    if (src) {
      src.owner.stats.killed++;
      // killing blow credits the shooter with the victim's worth as xp
      if (src.isUnit && src.def.weapon) awardXp(game, src, target);
    }
    if (target.isUnit) destroyUnit(game, target);
    else destroyBuilding(game, target, src);
  }
}

// grant xp equal to the destroyed thing's cost; promote at 1x / 3x own cost
export function awardXp(game, u, victim) {
  if (u.rank >= MAX_RANK) return;
  u.xp += (victim.def && victim.def.cost) || 0;
  const cost = u.def.cost || 1;
  let rank = u.rank;
  if (u.xp >= cost * 3) rank = 2;
  else if (u.xp >= cost) rank = 1;
  if (rank > u.rank) promote(game, u, rank);
}

export function promote(game, u, rank) {
  u.rank = Math.min(MAX_RANK, rank);
  // rank2 lifts max hp; heal the fresh delta so the promotion feels good
  const newMax = Math.round(u.def.hp * RANK_HP[u.rank]);
  if (newMax > u.maxHp) { u.hp += newMax - u.maxHp; u.maxHp = newMax; }
  game.effects.push({ kind: 'puff', x: u.x, y: u.y, t: 0, frame: 0 });
  if (u.owner.isHuman) game.audio.sfx('ready');
}

// -------------------------------------------------------------- deaths ----

export function destroyUnit(game, u) {
  u.dead = true;
  u.owner.stats.lost++;
  game.map.occupant[game.map.idx(u.cellX, u.cellY)] = null;
  if (u.reserved) game.map.occupant[game.map.idx(u.reserved[0], u.reserved[1])] = null;
  // an APC takes its passengers down with it
  if (u.cargoUnits && u.cargoUnits.length) {
    for (const p of u.cargoUnits) {
      if (p.dead) continue;
      p.dead = true; p.boarded = false;
      p.owner.stats.lost++;
    }
    u.cargoUnits = [];
  }
  const big = u.def.kind === 'vehicle';
  game.effects.push({ kind: 'explosion', x: u.x, y: u.y, t: 0, frame: 0, big });
  game.effects.push({ kind: 'scorch', x: u.cellX, y: u.cellY, t: 25 });
  game.audio.sfx(big ? 'boomBig' : 'boomSmall');
  game.visionDirty = true;
}

export function destroyBuilding(game, b, src, sold = false) {
  b.dead = true;
  if (!sold) b.owner.stats.lost++;
  for (let y = b.cy; y < b.cy + b.def.h; y++)
    for (let x = b.cx; x < b.cx + b.def.w; x++)
      if (game.map.inBounds(x, y)) game.map.blocked[game.map.idx(x, y)] = 0;
  b.owner.powerMade -= Math.max(0, b.def.power);
  b.owner.powerUsed -= Math.max(0, -b.def.power);
  if (b.def.storage) b.owner.storage -= b.def.storage;
  if (b.def.givesRadar) {
    b.owner.hasRadar = game.buildings.some((o) => !o.dead && o !== b && o.owner === b.owner && o.def.givesRadar);
  }
  if (!sold) {
    const [cx, cy] = b.centre();
    for (let i = 0; i < b.def.w * b.def.h; i++) {
      game.effects.push({
        kind: 'explosion', big: true, t: -i * 0.08, frame: 0,
        x: b.cx + game.rng() * b.def.w, y: b.cy + game.rng() * b.def.h,
      });
    }
    game.effects.push({ kind: 'scorch', x: Math.floor(cx), y: Math.floor(cy), t: 40 });
    game.audio.sfx('boomBig');
    if (b.owner.isHuman) game.audio.say('Structure destroyed');
  }
  game.visionDirty = true;
}

// ------------------------------------------------------------ crushing ----

// can this vehicle roll over whoever is standing on the cell?
export function canCrushInto(game, u, nx, ny) {
  if (!u.def.crusher) return false;
  const i = game.map.idx(nx, ny);
  if (!game.map.isPassableTerrain(nx, ny) || game.map.blocked[i]) return false;
  const occ = game.map.occupant[i];
  return !!(occ && occ !== u && occ.isUnit && !occ.dead &&
    occ.def.kind === 'infantry' && occ.owner !== u.owner);
}

export function crushUnit(game, victim, crusher) {
  victim.dead = true;
  victim.owner.stats.lost++;
  crusher.owner.stats.killed++;
  game.map.occupant[game.map.idx(victim.cellX, victim.cellY)] = null;
  if (victim.reserved) game.map.occupant[game.map.idx(victim.reserved[0], victim.reserved[1])] = null;
  game.effects.push({ kind: 'puff', x: victim.x, y: victim.y, t: 0, frame: 0 });
  game.effects.push({ kind: 'scorch', x: victim.cellX, y: victim.cellY, t: 15 });
  game.audio.sfx('crush');
  game.visionDirty = true;
}
