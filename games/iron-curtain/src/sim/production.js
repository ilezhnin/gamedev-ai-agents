// Building things and owning things: tech gating, the two production queues,
// placement rules, and the per-building tick (build-up, repair, defence).
// Power, radar and storage totals are cached on Player, so every path that
// adds, removes or transfers a structure has to keep those books straight —
// that is why spawning and capturing live here next to the queues.

import { UNITS, BUILDINGS, ECONOMY, STRUCTURE } from '../rules.js';
import { nearestFree } from '../pathfind.js';
import { Building, Unit } from './entities.js';
import { orderHarvest, orderMove } from './orders.js';
import { destroyBuilding, tickDefence } from './combat.js';
import { tickDepotIncome } from './economy.js';

// ----------------------------------------------------------- spawning ----

export function addBuilding(game, owner, key, cx, cy, opts = {}) {
  const b = new Building(owner, key, cx, cy);
  game.buildings.push(b);
  for (let y = cy; y < cy + b.def.h; y++)
    for (let x = cx; x < cx + b.def.w; x++)
      if (game.map.inBounds(x, y)) {
        game.map.blocked[game.map.idx(x, y)] = 1;
        game.map.ore[game.map.idx(x, y)] = 0;
      }
  owner.powerMade += Math.max(0, b.def.power);
  owner.powerUsed += Math.max(0, -b.def.power);
  if (b.def.givesRadar) owner.hasRadar = true;
  if (b.def.storage) owner.storage += b.def.storage;
  if (!opts.instant) b.buildRise = 0;
  game.visionDirty = true;
  // refinery arrives with a free ore truck, like the classics
  if (b.def.grantsUnit && !opts.noFreeUnit) {
    const spot = nearestFree(game.map, cx + 1, cy + b.def.h, null);
    if (spot) {
      const u = addUnit(game, owner, b.def.grantsUnit, spot[0], spot[1]);
      if (u.def.harvester) orderHarvest(game, u);
    }
  }
  return b;
}

export function addUnit(game, owner, key, x, y) {
  const u = new Unit(owner, key, x, y);
  game.units.push(u);
  game.map.occupant[game.map.idx(u.cellX, u.cellY)] = u;
  game.visionDirty = true;
  return u;
}

// spawn the map's neutral supply depots (2x2 buildings owned by 'neutral').
// Called once on a fresh match; loaded games restore them as buildings.
export function spawnDepots(game) {
  for (const d of game.map.depots || []) {
    addBuilding(game, game.players.neutral, 'depot', d.x, d.y, { instant: true });
  }
}

// ------------------------------------------------------------- queues ----

export function techSatisfied(game, owner, def) {
  if (!def.requires) return true;
  return def.requires.every((k) => game.buildings.some(
    (b) => !b.dead && b.owner === owner && b.key === k));
}

export function canProduce(game, owner, kind, key) {
  if (kind === 'building') {
    const def = BUILDINGS[key];
    if (def.unbuildable) return false;
    if (!game.buildings.some((b) => !b.dead && b.owner === owner && b.key === 'conyard')) return false;
    return techSatisfied(game, owner, def);
  }
  const def = UNITS[key];
  const fac = def.producedAt;
  if (!game.buildings.some((b) => !b.dead && b.owner === owner && b.key === fac)) return false;
  return techSatisfied(game, owner, def);
}

export function startProduction(game, owner, kind, key) {
  const slot = kind === 'building' ? 'building' : 'unit';
  if (owner.prod[slot]) return false;
  if (kind === 'building' && owner.readyBuilding) return false;
  if (!canProduce(game, owner, kind, key)) return false;
  const def = kind === 'building' ? BUILDINGS[key] : UNITS[key];
  owner.prod[slot] = { kind, key, def, spent: 0, progress: 0, hold: false };
  return true;
}

export function cancelProduction(game, owner, slot) {
  const p = owner.prod[slot];
  if (!p) return;
  owner.credits += p.spent;
  owner.prod[slot] = null;
}

export function tickProduction(game, owner, dt) {
  for (const slot of ['building', 'unit']) {
    const p = owner.prod[slot];
    if (!p || p.hold) continue;
    const speed = owner.lowPower() ? ECONOMY.lowPowerSpeed : 1;
    const need = p.def.buildTime;
    const rate = (1 / Math.max(0.5, need)) * speed;     // progress per second
    const costRate = p.def.cost * rate;
    const step = Math.min(costRate * dt, p.def.cost - p.spent);
    if (owner.credits >= step) {
      owner.credits -= step;
      p.spent += step;
      p.progress = p.def.cost > 0 ? p.spent / p.def.cost : 1;
      if (owner.isHuman && step > 0) game.audio.sfx('tick');
    } else if (owner.isHuman && Math.random() < dt * ECONOMY.lowFundsWarnPerSec) {
      game.emit('warn', 'INSUFFICIENT FUNDS');
    }
    if (p.progress >= 0.999) {
      owner.prod[slot] = null;
      if (p.kind === 'building') {
        owner.readyBuilding = p;
        if (owner.isHuman) { game.audio.sfx('ready'); game.audio.say('Construction complete'); game.emit('info', `${p.def.name} READY — CLICK TO PLACE`); }
      } else {
        deliverUnit(game, owner, p.key);
      }
    }
  }
}

export function deliverUnit(game, owner, key) {
  const def = UNITS[key];
  const facKey = def.producedAt;
  const fac = game.buildings.find((b) => !b.dead && b.owner === owner && b.key === facKey);
  if (!fac) { owner.credits += def.cost; return; }
  const exit = nearestFree(game.map, fac.cx + Math.floor(fac.def.w / 2), fac.cy + fac.def.h, null);
  if (!exit) { owner.credits += def.cost; return; }
  const u = addUnit(game, owner, key, exit[0], exit[1]);
  owner.stats.built++;
  if (def.weapon && !def.harvester) owner.stats.armyBuilt++;   // army-production tally
  if (owner.isHuman) { game.audio.sfx('ready'); game.audio.say('Unit ready'); }
  if (def.harvester) orderHarvest(game, u);
  else if (fac.rally) orderMove(game, u, fac.rally[0], fac.rally[1]);
  return u;
}

// ---------------------------------------------------------- placement ----

export function placementValid(game, owner, key, cx, cy) {
  const def = BUILDINGS[key];
  let nearBase = false;
  for (let y = cy; y < cy + def.h; y++) {
    for (let x = cx; x < cx + def.w; x++) {
      if (!game.map.isBuildable(x, y)) return false;
    }
  }
  // adjacency: within STRUCTURE.baseAdjacency cells of an existing friendly
  // footprint. Walls are fire-and-forget blockers and never extend the base
  // envelope, or a wall run would let you creep a base across the map.
  const R = STRUCTURE.baseAdjacency;
  for (const b of game.buildings) {
    if (b.dead || b.owner !== owner || b.def.isWall) continue;
    if (cx < b.cx + b.def.w + R && cx + def.w > b.cx - R &&
        cy < b.cy + b.def.h + R && cy + def.h > b.cy - R) { nearBase = true; break; }
  }
  return nearBase;
}

export function placeBuilding(game, owner, cx, cy) {
  const p = owner.readyBuilding;
  if (!p || !placementValid(game, owner, p.key, cx, cy)) return false;
  owner.readyBuilding = null;
  addBuilding(game, owner, p.key, cx, cy);
  if (owner.isHuman) game.audio.sfx('place');
  return true;
}

export function sellBuilding(game, b) {
  if (b.dead) return;
  b.owner.credits += Math.floor(b.def.cost * ECONOMY.sellRefund);
  if (b.owner.isHuman) { game.audio.sfx('sell'); game.audio.say('Structure sold'); }
  destroyBuilding(game, b, null, true);
}

// transfer a structure to a new owner, keeping power/radar/storage books
// straight (no destroy+recreate — hp and position are preserved)
export function captureBuilding(game, b, newOwner) {
  const old = b.owner;
  if (old === newOwner) return;
  old.powerMade -= Math.max(0, b.def.power);
  old.powerUsed -= Math.max(0, -b.def.power);
  newOwner.powerMade += Math.max(0, b.def.power);
  newOwner.powerUsed += Math.max(0, -b.def.power);
  if (b.def.storage) { old.storage -= b.def.storage; newOwner.storage += b.def.storage; }
  if (b.def.givesRadar) {
    newOwner.hasRadar = true;
    old.hasRadar = game.buildings.some((o) => !o.dead && o !== b && o.owner === old && o.def.givesRadar);
  }
  b.owner = newOwner;
  b.target = null;
  b.repairing = false;
  b.seen = false;
  if (newOwner.isHuman) game.emit('info', `${b.def.name} CAPTURED`);
  game.visionDirty = true;
}

// -------------------------------------------------------- building tick --

export function tickBuilding(game, b, dt) {
  if (b.buildRise < 1) b.buildRise = Math.min(1, b.buildRise + dt * STRUCTURE.riseRate);
  if (b.empT > 0) b.empT -= dt;

  tickDepotIncome(game, b, dt);

  // battle damage smoke
  if (b.hp < b.maxHp * STRUCTURE.smokeBelow) {
    b.smokeT -= dt;
    if (b.smokeT <= 0) {
      b.smokeT = STRUCTURE.smokeMin + game.rng() * STRUCTURE.smokeVar;
      game.effects.push({
        kind: 'smoke', t: 0,
        x: b.cx + 0.4 + game.rng() * (b.def.w - 0.8),
        y: b.cy + 0.3 + game.rng() * (b.def.h - 0.8),
      });
    }
  }

  // repair
  if (b.repairing && b.hp < b.maxHp) {
    const costPerHp = (b.def.cost * ECONOMY.repairCostFactor) / b.def.hp;
    const hp = Math.min(ECONOMY.repairHpPerSec * dt, b.maxHp - b.hp);
    const cost = hp * costPerHp;
    if (b.owner.credits >= cost) {
      b.owner.credits -= cost;
      b.hp += hp;
      if (b.hp >= b.maxHp) b.repairing = false;
    }
  }

  if (b.def.weapon) tickDefence(game, b, dt);
}
