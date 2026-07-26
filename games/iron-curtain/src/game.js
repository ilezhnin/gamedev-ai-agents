// Core simulation: owns the world state (map, players, units, buildings,
// projectiles, fog) and drives one tick of it. The rules themselves live in
// src/sim/* — this class holds the data those modules act on and fixes the
// order in which they run. Rendering never lives here — main.js reads this
// state every frame.

import { ECONOMY, COMBAT, POWERS } from './rules.js';
import { makeRng } from './palette.js';
import { Player } from './sim/entities.js';
import * as orders from './sim/orders.js';
import * as production from './sim/production.js';
import * as combat from './sim/combat.js';
import { tickUnit } from './sim/unittick.js';
import { recomputeVision, isVisibleToPlayer } from './sim/fog.js';
import { serializeGame, loadGame } from './sim/persist.js';

export class Game {
  constructor(map, audio, seed = 1234, enemyHouses = ['enemy']) {
    this.map = map;
    this.audio = audio;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.players = { player: new Player('player', true) };
    for (const h of enemyHouses) if (h !== 'neutral') this.players[h] = new Player(h, false);
    // neutral house owns the map's supply depots — never an opponent
    this.players.neutral = new Player('neutral', false);
    this.players.neutral.isNeutral = true;
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.pendingShots = [];           // staggered salvo shots waiting to fire
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
    // commander powers (human, tech-center gated)
    this.reconCd = 0;                 // recon-sweep cooldown remaining
    this.empCd = 0;                   // EMP-blast cooldown remaining
    this.reconSweeps = [];            // {x,y,r,t} temporary fog reveals
    this.empZones = [];               // {x,y,r,t} active EMP fields (for fx)
  }

  emit(kind, text, voice) { this.events.push({ kind, text, voice }); }

  // ----------------------------------------------------------------- tick --

  tick(dt) {
    if (this.over) return;
    this.time += dt;

    for (const p of Object.values(this.players)) {
      production.tickProduction(this, p, dt);
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

    this.tickPowers(dt);

    for (const u of this.units) if (!u.dead && !u.boarded) tickUnit(this, u, dt);
    for (const b of this.buildings) if (!b.dead) production.tickBuilding(this, b, dt);
    combat.tickPendingShots(this, dt);
    combat.tickProjectiles(this, dt);

    // purge dead
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);

    if (this.underAttackCooldown > 0) this.underAttackCooldown -= dt;

    if (this.visionDirty) this.recomputeVision();
    this.checkEnd();
  }

  // ------------------------------------------------------ commander powers --

  // tick commander-power cooldowns, temporary recon reveals and EMP fields
  tickPowers(dt) {
    if (this.reconCd > 0) this.reconCd = Math.max(0, this.reconCd - dt);
    if (this.empCd > 0) this.empCd = Math.max(0, this.empCd - dt);
    if (this.reconSweeps.length) {
      for (const s of this.reconSweeps) s.t -= dt;
      this.reconSweeps = this.reconSweeps.filter((s) => s.t > 0);
      this.visionDirty = true;      // keep revealing while active; clears on expiry
    }
    if (this.empZones.length) {
      for (const z of this.empZones) z.t -= dt;
      this.empZones = this.empZones.filter((z) => z.t > 0);
    }
  }

  // human tech-center abilities. Returns true if fired (starts the cooldown).
  castPower(which, x, y) {
    const p = this.players.player;
    const hasTech = this.buildings.some((b) => !b.dead && b.owner === p && b.key === 'techcenter');
    if (!hasTech) return false;
    if (which === 'recon') {
      if (this.reconCd > 0) return false;
      this.reconCd = POWERS.reconCd;
      this.reconSweeps.push({ x: Math.round(x), y: Math.round(y), r: POWERS.reconRadius, t: POWERS.reconDur });
      this.visionDirty = true;
      if (p.isHuman) { this.audio.sfx('ready'); this.audio.say('Recon sweep', true); }
      return true;
    }
    if (which === 'emp') {
      if (this.empCd > 0) return false;
      this.empCd = POWERS.empCd;
      this.castEmp(x, y);
      if (p.isHuman) this.audio.say('E M P blast', true);
      return true;
    }
    return false;
  }

  // disable enemy vehicles + defence buildings inside the blast for POWERS.empDur
  castEmp(x, y) {
    const p = this.players.player;
    const r = POWERS.empRadius;
    this.empZones.push({ x, y, r, t: POWERS.empDur });
    for (const u of this.units) {
      if (u.dead || u.boarded || u.owner === p || u.def.kind !== 'vehicle') continue;
      if (Math.hypot(u.x - x, u.y - y) <= r) u.empT = POWERS.empDur;
    }
    for (const b of this.buildings) {
      if (b.dead || b.owner === p || !b.def.weapon) continue;   // defence buildings only
      const [bx, by] = b.centre();
      // building centres sit half a cell off the sprite grid, hence the +0.5
      if (Math.hypot(bx - 0.5 - x, by - 0.5 - y) <= r + 0.5) b.empT = POWERS.empDur;
    }
    this.effects.push({ kind: 'emp', x, y, r, t: 0 });
    this.audio.sfx('tesla');
  }

  // ------------------------------------------------------------------ end --

  checkEnd() {
    if (this.over || this.time < COMBAT.endCheckGrace) return;
    // walls and neutral depots don't count as a surviving base — a house with
    // only those is out
    const alive = (house) =>
      this.buildings.some((b) => !b.dead && !b.def.isWall && !b.def.isDepot && b.house === house) ||
      this.units.some((u) => !u.dead && u.house === house);
    const playerAlive = alive('player');
    const anyFoeAlive = Object.values(this.players)
      .some((p) => !p.isHuman && !p.isNeutral && alive(p.house));
    if (!anyFoeAlive) { this.over = true; this.won = true; this.audio.say('Mission accomplished', true); }
    else if (!playerAlive) { this.over = true; this.won = false; this.audio.say('Mission failed', true); }
  }

  // -------------------------------------------------------------- façade ---
  // Thin delegates onto the sim modules. The UI, the input layer, the AI and
  // the test hooks all speak to the Game object, so the method names here are
  // the sim's public surface even though the rules live next door.

  addBuilding(owner, key, cx, cy, opts) { return production.addBuilding(this, owner, key, cx, cy, opts); }
  addUnit(owner, key, x, y) { return production.addUnit(this, owner, key, x, y); }
  spawnDepots() { return production.spawnDepots(this); }

  canProduce(owner, kind, key) { return production.canProduce(this, owner, kind, key); }
  startProduction(owner, kind, key) { return production.startProduction(this, owner, kind, key); }
  cancelProduction(owner, slot) { return production.cancelProduction(this, owner, slot); }
  placementValid(owner, key, cx, cy) { return production.placementValid(this, owner, key, cx, cy); }
  placeBuilding(owner, cx, cy) { return production.placeBuilding(this, owner, cx, cy); }
  sellBuilding(b) { return production.sellBuilding(this, b); }

  orderMove(u, tx, ty) { return orders.orderMove(this, u, tx, ty); }
  orderAttackMove(u, tx, ty) { return orders.orderAttackMove(this, u, tx, ty); }
  orderAttack(u, target) { return orders.orderAttack(this, u, target); }
  orderHarvest(u, cell) { return orders.orderHarvest(this, u, cell); }
  orderDeploy(u) { return orders.orderDeploy(this, u); }
  orderCapture(u, target) { return orders.orderCapture(this, u, target); }
  orderBoard(u, apc) { return orders.orderBoard(this, u, apc); }
  orderUnload(apc) { return orders.orderUnload(this, apc); }

  destroyUnit(u) { return combat.destroyUnit(this, u); }
  destroyBuilding(b, src, sold) { return combat.destroyBuilding(this, b, src, sold); }

  recomputeVision() { return recomputeVision(this); }
  isVisibleToPlayer(e) { return isVisibleToPlayer(this, e); }

  serialize() { return serializeGame(this); }
  static load(data, audio) { return loadGame(Game, data, audio); }
}
