// Sidebar, radar minimap, cameo strips, banners and end screens.
// The sidebar is plain DOM; the radar is a 2d canvas redrawn a few times
// per second from game state.

import { BUILDINGS, UNITS, BUILD_ORDER_STRIP, UNIT_STRIP } from './rules.js';
import { makeCameo } from './sprites.js';
import { T } from './map.js';

export class UI {
  constructor(game, sprites, audio) {
    this.game = game;
    this.sprites = sprites;
    this.audio = audio;
    this.mode = 'normal';           // normal | place | sell | repair
    this.el = {
      credits: document.getElementById('credits'),
      radar: document.getElementById('radar'),
      radarOff: document.getElementById('radar-off'),
      powerFill: document.getElementById('power-fill'),
      powerPin: document.getElementById('power-pin'),
      stripB: document.getElementById('strip-buildings'),
      stripU: document.getElementById('strip-units'),
      banner: document.getElementById('banner'),
      eva: document.getElementById('eva-line'),
      btnRepair: document.getElementById('btn-repair'),
      btnSell: document.getElementById('btn-sell'),
      help: document.getElementById('help'),
    };
    this.cameos = {};              // key -> {root, clockCanvas, tag, badge, shade}
    this.radarG = this.el.radar.getContext('2d');
    this.radarT = 0;
    this.bannerT = 0;
    this.buildStrips();
    this.wireButtons();
    this.el.help.innerHTML =
      'LMB select / drag box &nbsp; RMB move / attack<br>' +
      'F+click attack-move &nbsp; B deploy MCV &nbsp; X stop<br>' +
      'WASD / arrows scroll &nbsp; wheel zoom<br>' +
      'CTRL+1..9 group &nbsp; 1..9 recall &nbsp; H help &nbsp; P pause<br>' +
      'ESC menu &amp; settings &nbsp; Click cameo to build, again to place';
  }

  reset(game) {
    this.game = game;
    this.bannerT = 0;
    this.el.banner.style.display = 'none';
    this.setMode('normal');
  }

  wireButtons() {
    this.el.btnSell.addEventListener('click', () => {
      this.setMode(this.mode === 'sell' ? 'normal' : 'sell');
      this.audio.sfx('select');
    });
    this.el.btnRepair.addEventListener('click', () => {
      this.setMode(this.mode === 'repair' ? 'normal' : 'repair');
      this.audio.sfx('select');
    });
  }

  setMode(m) {
    this.mode = m;
    this.el.btnSell.classList.toggle('on', m === 'sell');
    this.el.btnRepair.classList.toggle('on', m === 'repair');
    document.getElementById('viewport').style.cursor =
      m === 'sell' ? 'not-allowed' : m === 'repair' ? 'help' : 'crosshair';
  }

  // ------------------------------------------------------------- cameos ---

  buildStrips() {
    const mk = (key, def, sprite, strip, kind) => {
      const root = document.createElement('div');
      root.className = 'cameo';
      const img = makeCameo(sprite, def.name);
      root.appendChild(img);
      const clock = document.createElement('canvas');
      clock.className = 'clock'; clock.width = 64; clock.height = 48;
      root.appendChild(clock);
      const shade = document.createElement('div'); shade.className = 'shade';
      root.appendChild(shade);
      const tag = document.createElement('div'); tag.className = 'tag';
      tag.textContent = def.name;
      root.appendChild(tag);
      const badge = document.createElement('div'); badge.className = 'badge';
      root.appendChild(badge);
      root.title = `${def.name} — $${def.cost}`;
      root.addEventListener('click', () => this.onCameoClick(kind, key));
      root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onCameoRightClick(kind, key); });
      strip.appendChild(root);
      this.cameos[key] = { root, clock, clockG: clock.getContext('2d'), tag, badge, shade, def, kind };
    };
    for (const key of BUILD_ORDER_STRIP) {
      const spr = this.sprites.buildings.player[key];
      mk(key, BUILDINGS[key], spr, this.el.stripB, 'building');
    }
    for (const key of UNIT_STRIP) {
      const set = this.sprites.units.player[key];
      const spr = set.hull ? set.hull[0] : set.frames[0][0];
      mk(key, UNITS[key], spr, this.el.stripU, 'unit');
    }
  }

  onCameoClick(kind, key) {
    const g = this.game, p = g.players.player;
    if (g.over) return;
    if (kind === 'building') {
      if (p.readyBuilding && p.readyBuilding.key === key) {
        this.setMode('place');            // re-enter placement
        this.audio.sfx('select');
        return;
      }
      const prod = p.prod.building;
      if (prod && prod.key === key) {     // toggle hold
        prod.hold = !prod.hold;
        this.audio.sfx(prod.hold ? 'nofunds' : 'select');
        return;
      }
      if (g.startProduction(p, 'building', key)) {
        this.audio.sfx('ack');
        this.audio.say('Building');
      } else this.audio.sfx('nofunds');
    } else {
      if (g.startProduction(p, 'unit', key)) {
        this.audio.sfx('ack');
        this.audio.say('Training');
      } else this.audio.sfx('nofunds');
    }
  }

  onCameoRightClick(kind, key) {
    const g = this.game, p = g.players.player;
    const slot = kind === 'building' ? 'building' : 'unit';
    const prod = p.prod[slot];
    if (prod && prod.key === key) {
      g.cancelProduction(p, slot);
      this.audio.sfx('sell');
    } else if (kind === 'building' && p.readyBuilding && p.readyBuilding.key === key) {
      p.credits += p.readyBuilding.spent;
      p.readyBuilding = null;
      this.setMode('normal');
      this.audio.sfx('sell');
    }
  }

  // -------------------------------------------------------------- update --

  update(dt) {
    const g = this.game, p = g.players.player;

    // credits (animated)
    this.el.credits.textContent = Math.round(p.displayCredits).toLocaleString('en-US');

    // power bar: fill = made vs used, green/yellow/red
    const made = p.powerMade, used = p.powerUsed;
    const cap = Math.max(made, used, 100);
    const fillH = Math.min(100, (made / cap) * 100);
    this.el.powerFill.style.height = `${fillH}%`;
    this.el.powerFill.style.background = p.lowPower() ? 'var(--ui-red)'
      : used > made * 0.8 ? 'var(--ui-gold)' : 'var(--ui-green)';
    this.el.powerPin.style.bottom = `${Math.min(100, (used / cap) * 100)}%`;

    // cameo states
    for (const [key, c] of Object.entries(this.cameos)) {
      const can = g.canProduce(p, c.kind, key);
      c.root.classList.toggle('disabled', !can);
      const slot = c.kind === 'building' ? 'building' : 'unit';
      const prod = p.prod[slot];
      const active = prod && prod.key === key;
      const ready = c.kind === 'building' && p.readyBuilding && p.readyBuilding.key === key;
      c.root.classList.toggle('ready', !!ready);
      c.root.classList.toggle('hold', !!(active && prod.hold));
      c.tag.textContent = ready ? 'READY' : active && prod.hold ? 'ON HOLD' : c.def.name;
      // radial progress clock
      if (active) {
        c.clock.style.display = 'block';
        const gg = c.clockG;
        gg.clearRect(0, 0, 64, 48);
        gg.fillStyle = 'rgba(0,0,0,0.55)';
        gg.beginPath();
        gg.moveTo(32, 24);
        const a0 = -Math.PI / 2 + prod.progress * Math.PI * 2;
        gg.arc(32, 24, 46, a0, Math.PI * 1.5);
        gg.closePath();
        gg.fill();
      } else c.clock.style.display = 'none';
      c.shade.style.display = 'none';
    }

    // radar
    this.radarT -= dt;
    const radarOn = p.hasRadar && !p.lowPower();
    this.el.radarOff.style.display = radarOn ? 'none' : 'flex';
    if (radarOn && this.radarT <= 0) {
      this.radarT = 0.25;
      this.drawRadar();
    }

    // event banners
    const ev = g.events.shift();
    if (ev) this.banner(ev.text);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.style.display = 'none';
    }

    // low power hint on the eva line
    this.el.eva.textContent = g.over ? '' :
      p.lowPower() ? '⚠ LOW POWER — PRODUCTION SLOWED' :
      p.readyBuilding ? `${p.readyBuilding.def.name} READY` : '';
  }

  banner(text) {
    this.el.banner.textContent = text;
    this.el.banner.style.display = 'block';
    this.bannerT = 3.2;
  }

  drawRadar() {
    const g = this.game, m = g.map, ctx = this.radarG;
    const s = m.size, scale = this.el.radar.width / s;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.el.radar.width, this.el.radar.height);
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = m.idx(x, y), o = i * 4;
        if (!g.explored[i]) { d[o + 3] = 255; continue; }
        const t = m.terrain[i];
        let r = 60, gg = 92, b = 44;                    // grass
        if (t === T.WATER) { r = 26; gg = 60; b = 110; }
        else if (t === T.ROCK) { r = 90; gg = 86; b = 80; }
        else if (t === T.TREE) { r = 30; gg = 62; b = 26; }
        else if (t === T.DIRT) { r = 110; gg = 88; b = 52; }
        if (m.ore[i] > 0) { r = 190; gg = 150; b = 40; }
        if (!g.visible[i]) { r *= 0.55; gg *= 0.55; b *= 0.55; }
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    // blit scaled
    const off = document.createElement('canvas');
    off.width = s; off.height = s;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, this.el.radar.width, this.el.radar.height);
    // entities
    for (const b of g.buildings) {
      if (b.dead) continue;
      if (b.house !== 'player' && !b.seen && !g.isVisibleToPlayer(b)) continue;
      ctx.fillStyle = b.house === 'player' ? '#4f86e8' : '#e04a3a';
      ctx.fillRect(b.cx * scale, b.cy * scale, Math.max(2, b.def.w * scale), Math.max(2, b.def.h * scale));
    }
    for (const u of g.units) {
      if (u.dead) continue;
      if (u.house !== 'player' && !g.isVisibleToPlayer(u)) continue;
      ctx.fillStyle = u.house === 'player' ? '#8fc2ff' : '#ff7a66';
      ctx.fillRect(u.x * scale - 1, u.y * scale - 1, 2.4, 2.4);
    }
  }

  // camera viewport rectangle on the radar (called by main with cam info)
  drawRadarViewRect(x0, y0, x1, y1) {
    const p = this.game.players.player;
    if (!p.hasRadar || p.lowPower()) return;
    const ctx = this.radarG;
    const s = this.game.map.size, scale = this.el.radar.width / s;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 * scale, y0 * scale, (x1 - x0) * scale, (y1 - y0) * scale);
  }

  showEnd(won, stats) {
    const s = document.getElementById('screen-end');
    const t = document.getElementById('end-title');
    t.textContent = won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
    t.className = won ? 'win' : 'lose';
    document.getElementById('end-stats').innerHTML =
      `UNITS BUILT&nbsp;&nbsp;${stats.built}<br>` +
      `ENEMIES DESTROYED&nbsp;&nbsp;${stats.killed}<br>` +
      `FORCES LOST&nbsp;&nbsp;${stats.lost}<br>` +
      `ORE HARVESTED&nbsp;&nbsp;$${Math.round(stats.harvested)}`;
    s.classList.remove('hidden');
  }
}
