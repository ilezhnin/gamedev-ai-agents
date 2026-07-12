// Mouse + keyboard: selection marquee, orders, building placement,
// control groups, edge scrolling and radar clicks.

import { BUILDINGS } from './rules.js';

export class Input {
  constructor(game, camera, ui, audio, viewEl) {
    this.game = game;
    this.cam = camera;              // {x, y, zoom, viewW, viewH} managed by main
    this.ui = ui;
    this.audio = audio;
    this.view = viewEl;
    this.selection = [];
    this.groups = {};               // digit -> array of unit ids
    this.settings = null;           // shared settings object, set by main
    this.blocked = false;           // true while the pause menu is open
    this.mouse = { x: -1, y: -1, seen: false, down: false, downX: 0, downY: 0, dragging: false };
    this.keys = {};
    this.placeCursor = null;        // [cx, cy] while in place mode
    this.marqueeEl = document.getElementById('marquee');
    this.attackMoveArmed = false;
    this.bind();
  }

  reset(game) {
    this.game = game;
    this.selection = [];
    this.groups = {};
    this.placeCursor = null;
    this.attackMoveArmed = false;
    this.mouse.down = false;
    this.marqueeEl.style.display = 'none';
  }

  bind() {
    const v = this.view;
    v.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      this.cam.zoom = Math.max(1.2, Math.min(3.2, this.cam.zoom - dir * 0.25));
    }, { passive: false });
    // radar click to jump
    const radar = document.getElementById('radar');
    const radarNav = (e) => {
      const p = this.game.players.player;
      if (!p.hasRadar || p.lowPower()) return;
      const r = radar.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      this.cam.x = fx * this.game.map.size;
      this.cam.y = fy * this.game.map.size;
    };
    radar.addEventListener('mousedown', (e) => {
      radarNav(e);
      const move = (ev) => radarNav(ev);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  // screen px -> world cell coords (fractional)
  toWorld(e) {
    const r = this.view.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return this.screenToWorld(sx, sy, r);
  }

  screenToWorld(sx, sy, r = this.view.getBoundingClientRect()) {
    const { x, y, zoom } = this.cam;
    const TILEPX = 24 * zoom;
    const wx = x + (sx - r.width / 2) / TILEPX;
    const wy = y + (sy - r.height / 2) / TILEPX;
    return [wx, wy];
  }

  onDown(e) {
    if (this.game.over || this.blocked) return;
    this.audio.ensure(); this.audio.resume();
    const [wx, wy] = this.toWorld(e);
    const cx = Math.floor(wx), cy = Math.floor(wy);
    const p = this.game.players.player;

    if (e.button === 0) {
      // placement mode
      if (this.ui.mode === 'place' || p.readyBuilding) {
        if (p.readyBuilding) {
          const def = BUILDINGS[p.readyBuilding.key];
          const px = Math.round(wx - def.w / 2), py = Math.round(wy - def.h / 2);
          if (this.game.placeBuilding(p, px, py)) {
            this.ui.setMode('normal');
          } else this.audio.sfx('nofunds');
          return;
        }
        this.ui.setMode('normal');
      }
      if (this.ui.mode === 'sell' || this.ui.mode === 'repair') {
        const b = this.buildingAt(cx, cy, p);
        if (b) {
          if (this.ui.mode === 'sell') this.game.sellBuilding(b);
          else { b.repairing = !b.repairing; this.audio.sfx('select'); }
        } else this.ui.setMode('normal');
        return;
      }
      if (this.attackMoveArmed) {
        this.issueAttackMove(wx, wy);
        this.attackMoveArmed = false;
        return;
      }
      this.mouse.down = true;
      this.mouse.downX = e.clientX; this.mouse.downY = e.clientY;
      this.mouse.dragging = false;
    } else if (e.button === 2) {
      if (this.ui.mode !== 'normal') { this.ui.setMode('normal'); return; }
      if (p.readyBuilding) return;
      this.issueOrder(wx, wy, cx, cy);
    }
  }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.seen = true;
    if (this.mouse.down) {
      const dx = e.clientX - this.mouse.downX, dy = e.clientY - this.mouse.downY;
      if (!this.mouse.dragging && Math.hypot(dx, dy) > 6) this.mouse.dragging = true;
      if (this.mouse.dragging) {
        const r = this.view.getBoundingClientRect();
        const x0 = Math.min(this.mouse.downX, e.clientX) - r.left;
        const y0 = Math.min(this.mouse.downY, e.clientY) - r.top;
        const m = this.marqueeEl;
        m.style.display = 'block';
        m.style.left = `${x0}px`; m.style.top = `${y0}px`;
        m.style.width = `${Math.abs(dx)}px`; m.style.height = `${Math.abs(dy)}px`;
      }
    }
    // track placement ghost cell
    const p = this.game.players.player;
    if (p.readyBuilding) {
      const r = this.view.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const [wx, wy] = this.screenToWorld(e.clientX - r.left, e.clientY - r.top, r);
        const def = BUILDINGS[p.readyBuilding.key];
        this.placeCursor = [Math.round(wx - def.w / 2), Math.round(wy - def.h / 2)];
      }
    } else this.placeCursor = null;
  }

  onUp(e) {
    if (e.button !== 0 || !this.mouse.down) return;
    this.mouse.down = false;
    this.marqueeEl.style.display = 'none';
    const r = this.view.getBoundingClientRect();
    if (this.mouse.dragging) {
      const [ax, ay] = this.screenToWorld(Math.min(this.mouse.downX, e.clientX) - r.left, Math.min(this.mouse.downY, e.clientY) - r.top, r);
      const [bx, by] = this.screenToWorld(Math.max(this.mouse.downX, e.clientX) - r.left, Math.max(this.mouse.downY, e.clientY) - r.top, r);
      this.selectBox(ax, ay, bx, by, e.shiftKey);
    } else {
      if (e.clientX > r.right) return; // sidebar click
      const [wx, wy] = this.toWorld(e);
      this.selectPoint(wx, wy, e.shiftKey);
    }
  }

  // ------------------------------------------------------------ selection --

  selectPoint(wx, wy, additive) {
    const g = this.game;
    let picked = null;
    // units first (small radius)
    let bestD = 0.8;
    for (const u of g.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.x + 0.0 - wx + 0.0, u.y - wy);
      if (d < bestD) { picked = u; bestD = d; }
    }
    if (!picked) {
      picked = this.buildingAt(Math.floor(wx), Math.floor(wy), null);
    }
    if (!additive) this.selection = [];
    if (picked) {
      if (picked.house === 'player') {
        if (!this.selection.includes(picked)) this.selection.push(picked);
        this.audio.sfx('select');
        if (picked.isUnit) this.audio.say(picked.def.name.toLowerCase());
      } else {
        this.selection = [picked]; // enemy: info-select only
      }
    }
  }

  selectBox(ax, ay, bx, by, additive) {
    const g = this.game;
    if (!additive) this.selection = [];
    let any = false;
    for (const u of g.units) {
      if (u.dead || u.house !== 'player') continue;
      if (u.x >= ax - 0.4 && u.x <= bx + 0.4 && u.y >= ay - 0.4 && u.y <= by + 0.4) {
        if (!this.selection.includes(u)) this.selection.push(u);
        any = true;
      }
    }
    if (any) this.audio.sfx('select');
  }

  buildingAt(cx, cy, owner) {
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      if (owner && b.owner !== owner) continue;
      if (b.containsCell(cx, cy)) return b;
    }
    return null;
  }

  selectedUnits() { return this.selection.filter((s) => s.isUnit && !s.dead && s.house === 'player'); }

  // --------------------------------------------------------------- orders --

  issueOrder(wx, wy, cx, cy) {
    const g = this.game;
    const units = this.selectedUnits();
    // factory rally point if a factory is selected
    const fac = this.selection.find((s) => s.isBuilding && !s.dead && s.def.factoryFor && s.house === 'player');
    if (units.length === 0 && fac) {
      fac.rally = [cx, cy];
      this.audio.sfx('ack');
      return;
    }
    if (units.length === 0) return;

    // clicked on enemy?
    let target = null;
    for (const u of g.units) {
      if (u.dead || u.house === 'player') continue;
      if (Math.hypot(u.x - wx, u.y - wy) < 0.8 && g.isVisibleToPlayer(u)) { target = u; break; }
    }
    if (!target) {
      const b = this.buildingAt(cx, cy, null);
      if (b && b.house !== 'player' && (b.seen || g.isVisibleToPlayer(b))) target = b;
    }

    if (target) {
      for (const u of units) g.orderAttack(u, target);
      this.audio.sfx('ack');
      this.audio.say('Attacking');
      return;
    }

    // ore cell → send harvesters to harvest
    const oreHere = g.map.inBounds(cx, cy) && g.map.ore[g.map.idx(cx, cy)] > 0;
    let moved = false;
    const spread = spreadOffsets(units.length);
    let k = 0;
    for (const u of units) {
      if (u.def.harvester && oreHere) { g.orderHarvest(u, [cx, cy]); moved = true; continue; }
      const [ox, oy] = spread[k++ % spread.length];
      g.orderMove(u, cx + ox, cy + oy);
      moved = true;
    }
    if (moved) { this.audio.sfx('ack'); this.audio.say('Moving out'); }
  }

  issueAttackMove(wx, wy) {
    const units = this.selectedUnits();
    if (units.length === 0) return;
    const spread = spreadOffsets(units.length);
    let k = 0;
    for (const u of units) {
      const [ox, oy] = spread[k++ % spread.length];
      this.game.orderAttackMove(u, Math.round(wx + ox), Math.round(wy + oy));
    }
    this.audio.sfx('ack');
    this.audio.say('Engaging');
  }

  // ------------------------------------------------------------ keyboard --

  // Escape backs out of one thing at a time; returns false when there was
  // nothing to cancel (main.js then opens the pause menu instead)
  consumeEscape() {
    if (this.ui.mode !== 'normal' || this.attackMoveArmed) {
      // a queued ready building stays queued, we only leave the mode
      this.ui.setMode('normal');
      this.attackMoveArmed = false;
      return true;
    }
    if (this.selection.length > 0) {
      this.selection = [];
      return true;
    }
    return false;
  }

  onKey(e, down) {
    this.keys[e.code] = down;
    if (!down || this.blocked) return;
    if (e.code === 'KeyF') this.attackMoveArmed = this.selectedUnits().length > 0;
    if (e.code === 'KeyX') {
      for (const u of this.selectedUnits()) {
        u.order = { type: 'idle' }; u.path = []; u.target = null;
      }
    }
    if (e.code === 'KeyB') {
      for (const u of this.selectedUnits()) {
        if (u.def.deploysTo) this.game.orderDeploy(u);
      }
    }
    if (e.code === 'KeyH') {
      const h = document.getElementById('help');
      h.style.display = h.style.display === 'block' ? 'none' : 'block';
    }
    // control groups
    if (/^Digit[1-9]$/.test(e.code)) {
      const n = e.code.slice(5);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = this.selectedUnits().map((u) => u.id);
        this.audio.sfx('select');
      } else {
        const ids = this.groups[n];
        if (ids && ids.length) {
          this.selection = this.game.units.filter((u) => !u.dead && ids.includes(u.id));
          if (this.selection.length) this.audio.sfx('select');
        }
      }
    }
  }

  // camera scrolling (WASD / arrows, optional screen-edge), from main loop
  tickScroll(dt) {
    if (this.blocked) return;
    const speed = (this.settings ? this.settings.camSpeed : 22) * dt;
    let dx = 0, dy = 0;
    if (this.keys.ArrowLeft || this.keys.KeyA) dx -= 1;
    if (this.keys.ArrowRight || this.keys.KeyD) dx += 1;
    if (this.keys.ArrowUp || this.keys.KeyW) dy -= 1;
    if (this.keys.ArrowDown || this.keys.KeyS) dy += 1;
    if (this.settings && this.settings.edgeScroll && this.mouse.seen) {
      const r = this.view.getBoundingClientRect();
      const mx = this.mouse.x, my = this.mouse.y, edge = 24;
      if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
        if (mx - r.left < edge) dx -= 1;
        if (r.right - mx < edge) dx += 1;
        if (my - r.top < edge) dy -= 1;
        if (r.bottom - my < edge) dy += 1;
      }
    }
    this.cam.x += dx * speed;
    this.cam.y += dy * speed;
    const s = this.game.map.size;
    this.cam.x = Math.max(4, Math.min(s - 4, this.cam.x));
    this.cam.y = Math.max(4, Math.min(s - 4, this.cam.y));
  }
}

function spreadOffsets(n) {
  const out = [[0, 0]];
  let ring = 1;
  while (out.length < n) {
    for (let dy = -ring; dy <= ring && out.length < n; dy++)
      for (let dx = -ring; dx <= ring && out.length < n; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) out.push([dx, dy]);
    ring++;
  }
  return out;
}
