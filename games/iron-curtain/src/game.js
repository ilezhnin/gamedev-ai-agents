// Core simulation: entities, movement, combat, harvesting economy,
// production queues, power, fog of war and win/lose bookkeeping.
// Rendering never lives here — main.js reads this state every frame.

import { UNITS, BUILDINGS, WEAPONS, WARHEADS, ECONOMY } from './rules.js';
import { findPath, nearestFree } from './pathfind.js';
import { makeRng } from './palette.js';
import { FACINGS } from './sprites.js';

let NEXT_ID = 1;

export class Player {
  constructor(house, isHuman) {
    this.house = house;               // 'player' | 'enemy'
    this.isHuman = isHuman;
    this.credits = isHuman ? ECONOMY.startCredits : ECONOMY.aiStartCredits;
    this.displayCredits = this.credits; // animated counter for UI
    this.powerMade = 0;
    this.powerUsed = 0;
    this.hasRadar = false;
    this.storage = ECONOMY.baseStorage;
    // production: one active item per strip type
    this.prod = { building: null, unit: null };
    this.readyBuilding = null;        // {key} waiting for placement
    this.stats = { built: 0, lost: 0, killed: 0, harvested: 0 };
  }

  lowPower() { return this.powerUsed > this.powerMade; }
}

// ---------------------------------------------------------------------------

export class Entity {
  constructor(owner, key) {
    this.id = NEXT_ID++;
    this.owner = owner;               // Player
    this.key = key;
    this.hp = 1; this.maxHp = 1;
    this.dead = false;
    this.sprite = null;               // THREE group, managed by renderer
  }
  get house() { return this.owner.house; }
}

export class Building extends Entity {
  constructor(owner, key, cx, cy) {
    super(owner, key);
    this.def = BUILDINGS[key];
    this.cx = cx; this.cy = cy;       // top-left cell
    this.hp = this.maxHp = this.def.hp;
    this.isBuilding = true;
    this.cooldown = 0;
    this.target = null;
    this.turretFacing = 0;
    this.repairing = false;
    this.rally = null;                // [x,y] for factories
    this.buildRise = 1.0;             // build-up animation 0..1 (starts done)
  }
  centre() { return [this.cx + this.def.w / 2, this.cy + this.def.h / 2]; }
  containsCell(x, y) {
    return x >= this.cx && y >= this.cy && x < this.cx + this.def.w && y < this.cy + this.def.h;
  }
}

export class Unit extends Entity {
  constructor(owner, key, x, y) {
    super(owner, key);
    this.def = UNITS[key];
    this.x = x; this.y = y;           // cell coords (float while moving)
    this.cellX = Math.round(x); this.cellY = Math.round(y);
    this.hp = this.maxHp = this.def.hp;
    this.isUnit = true;
    this.facing = Math.random() * Math.PI * 2;
    this.turretFacing = this.facing;
    this.path = [];
    this.moveT = 0;
    this.moving = false;
    this.fromX = x; this.fromY = y;
    this.destX = null; this.destY = null;
    this.order = { type: 'idle' };    // idle | move | attack | attackmove | harvest | return | deploy
    this.target = null;
    this.cooldown = 0;
    this.cargo = 0;                   // harvester ore load
    this.harvestTicker = 0;
    this.dockT = 0;
    this.animT = Math.random() * 10;
    this.guardX = x; this.guardY = y;
    this.stuckT = 0;
    this.repathT = 0;
  }
}

// ---------------------------------------------------------------------------

export class Game {
  constructor(map, audio, seed = 1234) {
    this.map = map;
    this.audio = audio;
    this.rng = makeRng(seed);
    this.players = { player: new Player('player', true), enemy: new Player('enemy', false) };
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];                // {kind,x,y,t,...} consumed by renderer
    this.time = 0;
    this.oreTimer = 0;
    this.over = false;
    this.won = false;
    this.events = [];                 // UI notifications {kind, text, voice}
    // fog of war (human player's view)
    const n = map.size * map.size;
    this.explored = new Uint8Array(n);
    this.visible = new Uint8Array(n);
    this.visionDirty = true;
    this.underAttackCooldown = 0;
  }

  emit(kind, text, voice) { this.events.push({ kind, text, voice }); }

  // ------------------------------------------------------------- spawning --

  addBuilding(owner, key, cx, cy, opts = {}) {
    const b = new Building(owner, key, cx, cy);
    this.buildings.push(b);
    for (let y = cy; y < cy + b.def.h; y++)
      for (let x = cx; x < cx + b.def.w; x++)
        if (this.map.inBounds(x, y)) {
          this.map.blocked[this.map.idx(x, y)] = 1;
          this.map.ore[this.map.idx(x, y)] = 0;
        }
    owner.powerMade += Math.max(0, b.def.power);
    owner.powerUsed += Math.max(0, -b.def.power);
    if (b.def.givesRadar) owner.hasRadar = true;
    if (b.def.storage) owner.storage += b.def.storage;
    if (!opts.instant) b.buildRise = 0;
    this.visionDirty = true;
    // refinery arrives with a free ore truck, like the classics
    if (b.def.grantsUnit && !opts.noFreeUnit) {
      const spot = nearestFree(this.map, cx + 1, cy + b.def.h, null);
      if (spot) {
        const u = this.addUnit(owner, b.def.grantsUnit, spot[0], spot[1]);
        if (u.def.harvester) this.orderHarvest(u);
      }
    }
    return b;
  }

  addUnit(owner, key, x, y) {
    const u = new Unit(owner, key, x, y);
    this.units.push(u);
    this.map.occupant[this.map.idx(u.cellX, u.cellY)] = u;
    this.visionDirty = true;
    return u;
  }

  // ------------------------------------------------------------ production --

  techSatisfied(owner, def) {
    if (!def.requires) return true;
    return def.requires.every((k) => this.buildings.some(
      (b) => !b.dead && b.owner === owner && b.key === k));
  }

  canProduce(owner, kind, key) {
    if (kind === 'building') {
      const def = BUILDINGS[key];
      if (def.unbuildable) return false;
      if (!this.buildings.some((b) => !b.dead && b.owner === owner && b.key === 'conyard')) return false;
      return this.techSatisfied(owner, def);
    }
    const def = UNITS[key];
    const fac = def.producedAt;
    if (!this.buildings.some((b) => !b.dead && b.owner === owner && b.key === fac)) return false;
    return this.techSatisfied(owner, def);
  }

  startProduction(owner, kind, key) {
    const slot = kind === 'building' ? 'building' : 'unit';
    if (owner.prod[slot]) return false;
    if (kind === 'building' && owner.readyBuilding) return false;
    if (!this.canProduce(owner, kind, key)) return false;
    const def = kind === 'building' ? BUILDINGS[key] : UNITS[key];
    owner.prod[slot] = { kind, key, def, spent: 0, progress: 0, hold: false };
    return true;
  }

  cancelProduction(owner, slot) {
    const p = owner.prod[slot];
    if (!p) return;
    owner.credits += p.spent;
    owner.prod[slot] = null;
  }

  tickProduction(owner, dt) {
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
        if (owner.isHuman && step > 0) this.audio.sfx('tick');
      } else if (owner.isHuman && Math.random() < dt * 0.4) {
        this.emit('warn', 'INSUFFICIENT FUNDS');
      }
      if (p.progress >= 0.999) {
        owner.prod[slot] = null;
        if (p.kind === 'building') {
          owner.readyBuilding = p;
          if (owner.isHuman) { this.audio.sfx('ready'); this.audio.say('Construction complete'); this.emit('info', `${p.def.name} READY — CLICK TO PLACE`); }
        } else {
          this.deliverUnit(owner, p.key);
        }
      }
    }
  }

  deliverUnit(owner, key) {
    const def = UNITS[key];
    const facKey = def.producedAt;
    const fac = this.buildings.find((b) => !b.dead && b.owner === owner && b.key === facKey);
    if (!fac) { owner.credits += def.cost; return; }
    const exit = nearestFree(this.map, fac.cx + Math.floor(fac.def.w / 2), fac.cy + fac.def.h, null);
    if (!exit) { owner.credits += def.cost; return; }
    const u = this.addUnit(owner, key, exit[0], exit[1]);
    owner.stats.built++;
    if (owner.isHuman) { this.audio.sfx('ready'); this.audio.say('Unit ready'); }
    if (def.harvester) this.orderHarvest(u);
    else if (fac.rally) this.orderMove(u, fac.rally[0], fac.rally[1]);
    return u;
  }

  // building placement -------------------------------------------------------

  placementValid(owner, key, cx, cy) {
    const def = BUILDINGS[key];
    let nearBase = false;
    for (let y = cy; y < cy + def.h; y++) {
      for (let x = cx; x < cx + def.w; x++) {
        if (!this.map.isBuildable(x, y)) return false;
      }
    }
    // adjacency: within 3 cells of an existing friendly building footprint
    for (const b of this.buildings) {
      if (b.dead || b.owner !== owner) continue;
      if (cx < b.cx + b.def.w + 3 && cx + def.w > b.cx - 3 &&
          cy < b.cy + b.def.h + 3 && cy + def.h > b.cy - 3) { nearBase = true; break; }
    }
    return nearBase;
  }

  placeBuilding(owner, cx, cy) {
    const p = owner.readyBuilding;
    if (!p || !this.placementValid(owner, p.key, cx, cy)) return false;
    owner.readyBuilding = null;
    this.addBuilding(owner, p.key, cx, cy);
    if (owner.isHuman) this.audio.sfx('place');
    return true;
  }

  sellBuilding(b) {
    if (b.dead) return;
    b.owner.credits += Math.floor(b.def.cost * ECONOMY.sellRefund);
    if (b.owner.isHuman) { this.audio.sfx('sell'); this.audio.say('Structure sold'); }
    this.destroyBuilding(b, null, true);
  }

  // ---------------------------------------------------------------- orders --

  orderMove(u, tx, ty, queue = false) {
    u.order = { type: 'move' };
    u.target = null;
    u.destX = tx; u.destY = ty;
    u.guardX = tx; u.guardY = ty;
    this.setPath(u, tx, ty);
  }

  orderAttackMove(u, tx, ty) {
    u.order = { type: 'attackmove' };
    u.target = null;
    u.destX = tx; u.destY = ty;
    this.setPath(u, tx, ty);
  }

  orderAttack(u, target) {
    if (!u.def.weapon) { this.orderMove(u, target.isUnit ? target.cellX : target.cx, target.isUnit ? target.cellY : target.cy); return; }
    u.order = { type: 'attack' };
    u.target = target;
  }

  orderHarvest(u, cell = null) {
    if (!u.def.harvester) return;
    u.order = { type: 'harvest' };
    u.target = null;
    if (cell) u.oreGoal = cell;
    else u.oreGoal = null;
  }

  orderDeploy(u) {
    if (!u.def.deploysTo) return;
    u.order = { type: 'deploy' };
    const def = BUILDINGS[u.def.deploysTo];
    // try to deploy centred on the MCV
    u.deployCell = [u.cellX - Math.floor(def.w / 2), u.cellY - Math.floor(def.h / 2)];
  }

  setPath(u, tx, ty) {
    const path = findPath(this.map, u.cellX, u.cellY, Math.round(tx), Math.round(ty), u);
    u.path = path || [];
    u.repathT = 0;
  }

  // ----------------------------------------------------------------- tick --

  tick(dt) {
    if (this.over) return;
    this.time += dt;

    for (const p of Object.values(this.players)) {
      this.tickProduction(p, dt);
      // animated credits counter
      const diff = p.credits - p.displayCredits;
      if (Math.abs(diff) > 0.5) {
        p.displayCredits += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(8, Math.abs(diff) * 3) * dt * 60 / 60);
      } else p.displayCredits = p.credits;
    }

    // ore growth
    this.oreTimer += dt;
    if (this.oreTimer > ECONOMY.oreGrowthEvery) {
      this.oreTimer = 0;
      this.map.growOre(this.rng);
      this.oreDirty = true;
    }

    for (const u of this.units) if (!u.dead) this.tickUnit(u, dt);
    for (const b of this.buildings) if (!b.dead) this.tickBuilding(b, dt);
    this.tickProjectiles(dt);

    // purge dead
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);

    if (this.underAttackCooldown > 0) this.underAttackCooldown -= dt;

    if (this.visionDirty) this.recomputeVision();
    this.checkEnd();
  }

  // ------------------------------------------------------------ unit tick --

  tickUnit(u, dt) {
    u.animT += dt;
    if (u.cooldown > 0) u.cooldown -= dt;

    switch (u.order.type) {
      case 'harvest': this.tickHarvest(u, dt); break;
      case 'return': this.tickReturn(u, dt); break;
      case 'attack': {
        const t = u.target;
        if (!t || t.dead) { u.order = { type: 'idle' }; u.target = null; break; }
        const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
        const dist = Math.hypot(tx - u.x, ty - u.y);
        const w = WEAPONS[u.def.weapon];
        if (dist <= w.range) {
          u.path = [];
          this.aimAndFire(u, t, tx, ty, dt);
        } else {
          u.repathT -= dt;
          if (u.path.length === 0 || u.repathT <= 0) {
            this.setPath(u, Math.round(tx), Math.round(ty));
            u.repathT = 1.2;
          }
        }
        break;
      }
      case 'attackmove': {
        if (!u.target || u.target.dead) {
          u.target = this.acquireTarget(u);
        }
        if (u.target) {
          const t = u.target;
          const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
          const w = WEAPONS[u.def.weapon];
          if (Math.hypot(tx - u.x, ty - u.y) <= w.range) {
            u.path = [];
            this.aimAndFire(u, t, tx, ty, dt);
            break;
          }
        }
        if (u.path.length === 0 && u.destX != null) {
          if (Math.hypot(u.destX - u.x, u.destY - u.y) > 1.5) this.setPath(u, u.destX, u.destY);
          else u.order = { type: 'idle' };
        }
        break;
      }
      case 'deploy': {
        // MCV: walk to the spot then morph into a construction yard
        const [dx, dy] = u.deployCell;
        const def = BUILDINGS[u.def.deploysTo];
        const cx = u.cellX - Math.floor(def.w / 2), cy = u.cellY - Math.floor(def.h / 2);
        let ok = true;
        for (let y = cy; y < cy + def.h && ok; y++)
          for (let x = cx; x < cx + def.w && ok; x++)
            if (!this.map.inBounds(x, y) || !this.map.isPassableTerrain(x, y) ||
                this.map.blocked[this.map.idx(x, y)] ||
                (this.map.occupant[this.map.idx(x, y)] && this.map.occupant[this.map.idx(x, y)] !== u)) ok = false;
        if (ok && !u.moving) {
          this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
          u.dead = true;
          const b = this.addBuilding(u.owner, u.def.deploysTo, cx, cy);
          b.buildRise = 0;
          if (u.owner.isHuman) { this.audio.sfx('place'); this.audio.say('Construction yard deployed'); }
          this.visionDirty = true;
          return;
        }
        if (!u.moving && u.path.length === 0) {
          // can't deploy here: nudge one cell and retry once
          const alt = nearestFree(this.map, u.cellX + 2, u.cellY + 2, u);
          if (alt) this.setPath(u, alt[0], alt[1]);
          else u.order = { type: 'idle' };
        }
        break;
      }
      case 'move':
        if (u.path.length === 0 && !u.moving) u.order = { type: 'idle' };
        break;
      case 'idle': {
        if (u.def.weapon && u.cooldown <= 0) {
          const t = this.acquireTarget(u);
          if (t) { u.order = { type: 'attackmove' }; u.destX = u.x; u.destY = u.y; u.target = t; }
        }
        if (u.def.harvester && !u.moving) {
          // idle harvesters go back to work after a beat
          u.idleT = (u.idleT || 0) + dt;
          if (u.idleT > 2) { u.idleT = 0; this.orderHarvest(u); }
        }
        break;
      }
    }

    this.tickMovement(u, dt);
  }

  acquireTarget(u) {
    if (!u.def.weapon) return null;
    const w = WEAPONS[u.def.weapon];
    const range = w.range + 1.5;
    let best = null, bestD = 1e9;
    for (const e of this.units) {
      if (e.dead || e.owner === u.owner) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < range && d < bestD) { best = e; bestD = d; }
    }
    for (const b of this.buildings) {
      if (b.dead || b.owner === u.owner) continue;
      const [bx, by] = b.centre();
      const d = Math.hypot(bx - u.x, by - u.y) - Math.max(b.def.w, b.def.h) * 0.4;
      if (d < range && d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  aimAndFire(u, target, tx, ty, dt) {
    const want = Math.atan2(ty - u.y, tx - u.x) + Math.PI / 2;
    const turnRate = (u.def.turn || 8) * 1.6;
    if (u.def.hasTurret) {
      u.turretFacing = approachAngle(u.turretFacing, want, turnRate * dt);
      if (angleDiff(u.turretFacing, want) > 0.25) return;
    } else {
      u.facing = approachAngle(u.facing, want, turnRate * dt);
      u.turretFacing = u.facing;
      if (angleDiff(u.facing, want) > 0.3) return;
    }
    if (u.cooldown > 0) return;
    const w = WEAPONS[u.def.weapon];
    u.cooldown = w.rof;
    u.fireFlash = 0.09;
    this.spawnProjectile(u, target, w);
  }

  spawnProjectile(src, target, w) {
    const [sx, sy] = src.isUnit ? [src.x, src.y] : src.centre();
    const [tx, ty] = target.isUnit ? [target.x, target.y] : target.centre();
    this.audio.sfx(w.sound);
    if (w.projectile === 'tracer') {
      // hitscan with a brief tracer line
      this.effects.push({ kind: 'tracer', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.06 });
      this.effects.push({ kind: 'puff', x: tx + (this.rng() - 0.5) * 0.4, y: ty + (this.rng() - 0.5) * 0.4, t: 0, frame: 0 });
      this.dealDamage(target, w, src);
    } else if (w.projectile === 'zap') {
      this.effects.push({ kind: 'zap', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.35 });
      this.dealDamage(target, w, src);
    } else {
      this.projectiles.push({
        x: sx, y: sy, tx, ty, target, w, src,
        speed: w.speed || 8,
        kind: w.projectile,
        angle: Math.atan2(ty - sy, tx - sx),
      });
    }
  }

  tickProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.target && !p.target.dead && p.target.isUnit) {
        p.tx = p.target.x; p.ty = p.target.y;
      }
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      const step = p.speed * dt;
      p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
      if (d <= step) {
        p.done = true;
        this.effects.push({ kind: 'puff', x: p.tx, y: p.ty, t: 0, frame: 0 });
        if (p.target && !p.target.dead) this.dealDamage(p.target, p.w, p.src);
      } else {
        p.x += Math.cos(p.angle) * step;
        p.y += Math.sin(p.angle) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  dealDamage(target, w, src) {
    if (target.dead) return;
    const mult = WARHEADS[w.warhead][target.def.armor] ?? 1;
    target.hp -= w.damage * mult;
    // human base under attack notification
    if (target.owner.isHuman && this.underAttackCooldown <= 0) {
      this.underAttackCooldown = 12;
      this.audio.sfx('alert');
      this.audio.say(target.isBuilding ? 'Base under attack' : 'Units under attack', true);
      this.emit('warn', target.isBuilding ? 'BASE UNDER ATTACK' : 'UNITS UNDER ATTACK');
    }
    // units fight back / flee handled by idle acquire
    if (target.isUnit && target.order.type === 'idle' && target.def.weapon && src) {
      this.orderAttack(target, src.isUnit || src.isBuilding ? src : null);
    }
    if (target.hp <= 0) {
      if (src) src.owner.stats.killed++;
      if (target.isUnit) this.destroyUnit(target);
      else this.destroyBuilding(target, src);
    }
  }

  destroyUnit(u) {
    u.dead = true;
    u.owner.stats.lost++;
    this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
    if (u.reserved) this.map.occupant[this.map.idx(u.reserved[0], u.reserved[1])] = null;
    const big = u.def.kind === 'vehicle';
    this.effects.push({ kind: 'explosion', x: u.x, y: u.y, t: 0, frame: 0, big });
    this.effects.push({ kind: 'scorch', x: u.cellX, y: u.cellY, t: 25 });
    this.audio.sfx(big ? 'boomBig' : 'boomSmall');
    this.visionDirty = true;
  }

  destroyBuilding(b, src, sold = false) {
    b.dead = true;
    if (!sold) b.owner.stats.lost++;
    for (let y = b.cy; y < b.cy + b.def.h; y++)
      for (let x = b.cx; x < b.cx + b.def.w; x++)
        if (this.map.inBounds(x, y)) this.map.blocked[this.map.idx(x, y)] = 0;
    b.owner.powerMade -= Math.max(0, b.def.power);
    b.owner.powerUsed -= Math.max(0, -b.def.power);
    if (b.def.storage) b.owner.storage -= b.def.storage;
    if (b.def.givesRadar) {
      b.owner.hasRadar = this.buildings.some((o) => !o.dead && o !== b && o.owner === b.owner && o.def.givesRadar);
    }
    if (!sold) {
      const [cx, cy] = b.centre();
      for (let i = 0; i < b.def.w * b.def.h; i++) {
        this.effects.push({
          kind: 'explosion', big: true, t: -i * 0.08, frame: 0,
          x: b.cx + this.rng() * b.def.w, y: b.cy + this.rng() * b.def.h,
        });
      }
      this.effects.push({ kind: 'scorch', x: Math.floor(cx), y: Math.floor(cy), t: 40 });
      this.audio.sfx('boomBig');
      if (b.owner.isHuman) this.audio.say('Structure destroyed');
    }
    this.visionDirty = true;
  }

  // ------------------------------------------------------------- movement --

  tickMovement(u, dt) {
    if (!u.moving) {
      if (u.path.length === 0) return;
      const [nx, ny] = u.path[0];
      if (!this.map.isFree(nx, ny, u)) {
        u.stuckT += dt;
        if (u.stuckT > 0.5) {
          u.stuckT = 0;
          // re-path around the blockage toward the final goal
          const goal = u.path[u.path.length - 1];
          this.setPath(u, goal[0], goal[1]);
        }
        return;
      }
      u.path.shift();
      u.stuckT = 0;
      u.moving = true;
      u.moveT = 0;
      u.fromX = u.x; u.fromY = u.y;
      u.reserved = [nx, ny];
      this.map.occupant[this.map.idx(nx, ny)] = u;   // reserve destination
    }
    if (u.moving) {
      const [nx, ny] = u.reserved;
      const want = Math.atan2(ny - u.fromY, nx - u.fromX) + Math.PI / 2;
      const turnRate = (u.def.turn || 10) * 2.2;
      u.facing = approachAngle(u.facing, want, turnRate * dt);
      if (!u.def.hasTurret) u.turretFacing = u.facing;
      // vehicles wait to face direction before rolling; infantry just walk
      if (u.def.kind === 'vehicle' && angleDiff(u.facing, want) > 0.6) return;

      const stepLen = Math.hypot(nx - u.fromX, ny - u.fromY) || 1;
      u.moveT += (u.def.speed * dt) / stepLen;
      if (u.moveT >= 1) {
        // arrive
        this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
        u.cellX = nx; u.cellY = ny;
        u.x = nx; u.y = ny;
        u.moving = false;
        u.reserved = null;
        this.map.occupant[this.map.idx(nx, ny)] = u;
        if (u.owner.isHuman) this.visionDirty = true;
      } else {
        u.x = u.fromX + (nx - u.fromX) * u.moveT;
        u.y = u.fromY + (ny - u.fromY) * u.moveT;
      }
    }
  }

  // ------------------------------------------------------------ harvesting --

  findOreCell(u) {
    // nearest ore cell (crude ring scan around preferred spot)
    const sx = u.oreGoal ? u.oreGoal[0] : u.cellX;
    const sy = u.oreGoal ? u.oreGoal[1] : u.cellY;
    let best = null, bestD = 1e9;
    const m = this.map;
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (m.ore[m.idx(x, y)] > 0 && !m.blocked[m.idx(x, y)]) {
          const d = Math.hypot(x - sx, y - sy) + Math.hypot(x - u.cellX, y - u.cellY) * 0.3;
          if (d < bestD) { best = [x, y]; bestD = d; }
        }
      }
    }
    return best;
  }

  findRefinery(u) {
    let best = null, bestD = 1e9;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== u.owner || b.key !== 'refinery') continue;
      const [cx, cy] = b.centre();
      const d = Math.hypot(cx - u.x, cy - u.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  tickHarvest(u, dt) {
    if (u.cargo >= ECONOMY.harvesterCapacity) { u.order = { type: 'return' }; return; }
    const i = this.map.idx(u.cellX, u.cellY);
    if (!u.moving && this.map.ore[i] > 0) {
      // chew ore where we stand
      u.harvestTicker += dt;
      if (u.harvestTicker >= ECONOMY.harvestTick) {
        u.harvestTicker = 0;
        const take = Math.min(ECONOMY.harvestPerTrip, this.map.ore[i], ECONOMY.harvesterCapacity - u.cargo);
        this.map.ore[i] -= take;
        u.cargo += take;
        this.oreDirty = true;
        if (this.map.ore[i] <= 0) this.visionDirty = true;
      }
      return;
    }
    if (!u.moving && u.path.length === 0) {
      const cell = this.findOreCell(u);
      if (!cell) {
        if (u.cargo > 50) { u.order = { type: 'return' }; }
        else u.order = { type: 'idle' };
        return;
      }
      u.oreGoal = cell;
      this.setPath(u, cell[0], cell[1]);
    }
  }

  tickReturn(u, dt) {
    const ref = this.findRefinery(u);
    if (!ref) { u.order = { type: 'idle' }; return; }
    // dock cell: centre-bottom tile of the refinery
    const dockX = ref.cx + 1, dockY = ref.cy + ref.def.h;
    if (!u.moving && u.cellX === dockX && u.cellY === dockY) {
      u.dockT += dt;
      const rate = ECONOMY.harvesterCapacity / ECONOMY.unloadTime;
      const amount = Math.min(u.cargo, rate * dt);
      const room = u.owner.storage * 4; // storage is soft in this build
      u.cargo -= amount;
      const gain = amount;
      u.owner.credits = Math.min(u.owner.credits + gain, room + 100000);
      u.owner.stats.harvested += gain;
      if (u.cargo <= 0.5) {
        u.cargo = 0; u.dockT = 0;
        this.orderHarvest(u);
      }
      return;
    }
    if (!u.moving && u.path.length === 0) {
      this.setPath(u, dockX, dockY);
      // dock might be occupied: nearestFree fallback handled by pathing softness
    }
  }

  // ------------------------------------------------------------ buildings --

  tickBuilding(b, dt) {
    if (b.buildRise < 1) b.buildRise = Math.min(1, b.buildRise + dt * 1.6);

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

    // defensive structures
    if (b.def.weapon) {
      if (b.cooldown > 0) b.cooldown -= dt;
      if (b.def.needsPower && b.owner.lowPower()) { b.target = null; return; }
      if (!b.target || b.target.dead) b.target = this.acquireTargetFor(b);
      if (b.target) {
        const w = WEAPONS[b.def.weapon];
        const [bx, by] = b.centre();
        const [tx, ty] = b.target.isUnit ? [b.target.x, b.target.y] : b.target.centre();
        const d = Math.hypot(tx - bx, ty - by);
        if (d > w.range + 0.5) { b.target = null; return; }
        const want = Math.atan2(ty - by, tx - bx) + Math.PI / 2;
        b.turretFacing = approachAngle(b.turretFacing, want, 6 * dt);
        if (b.cooldown <= 0 && angleDiff(b.turretFacing, want) < 0.3) {
          b.cooldown = w.rof;
          b.fireFlash = 0.09;
          this.spawnProjectile(b, b.target, w);
        }
      }
    }
  }

  acquireTargetFor(b) {
    const w = WEAPONS[b.def.weapon];
    const [bx, by] = b.centre();
    let best = null, bestD = 1e9;
    for (const e of this.units) {
      if (e.dead || e.owner === b.owner) continue;
      const d = Math.hypot(e.x - bx, e.y - by);
      if (d <= w.range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ fog --

  recomputeVision() {
    this.visionDirty = false;
    const m = this.map;
    this.visible.fill(0);
    const reveal = (cx, cy, r) => {
      const r2 = r * r;
      for (let y = Math.max(0, cy - r); y <= Math.min(m.size - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(m.size - 1, cx + r); x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r2) {
            const i = m.idx(x, y);
            this.visible[i] = 1;
            this.explored[i] = 1;
          }
        }
      }
    };
    for (const u of this.units) {
      if (u.dead || !u.owner.isHuman) continue;
      reveal(u.cellX, u.cellY, u.def.sight);
    }
    for (const b of this.buildings) {
      if (b.dead || !b.owner.isHuman) continue;
      const [cx, cy] = b.centre();
      reveal(Math.floor(cx), Math.floor(cy), b.def.sight);
    }
  }

  isVisibleToPlayer(e) {
    if (e.isBuilding) {
      for (let y = e.cy; y < e.cy + e.def.h; y++)
        for (let x = e.cx; x < e.cx + e.def.w; x++)
          if (this.map.inBounds(x, y) && this.visible[this.map.idx(x, y)]) return true;
      return false;
    }
    const i = this.map.idx(e.cellX, e.cellY);
    return !!this.visible[i];
  }

  // ------------------------------------------------------------------ end --

  checkEnd() {
    if (this.over || this.time < 5) return;
    const alive = (house) =>
      this.buildings.some((b) => !b.dead && b.house === house) ||
      this.units.some((u) => !u.dead && u.house === house);
    const playerAlive = alive('player');
    const enemyAlive = alive('enemy');
    if (!enemyAlive) { this.over = true; this.won = true; this.audio.say('Mission accomplished', true); }
    else if (!playerAlive) { this.over = true; this.won = false; this.audio.say('Mission failed', true); }
  }
}

// angle helpers ------------------------------------------------------------

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
