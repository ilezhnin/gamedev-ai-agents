// Sidebar, radar minimap, cameo strips, banners and end screens.
// The sidebar is plain DOM; the radar is a 2d canvas redrawn a few times
// per second from game state.

import { BUILDINGS, UNITS, BUILD_ORDER_STRIP, UNIT_STRIP } from './rules.js';
import { makeCameo } from './sprites.js';
import { HOUSE_UI } from './palette.js';
import { T } from './map.js';
import { RECON_CD, EMP_CD } from './game.js';

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
      tip: document.getElementById('cameo-tip'),
      powers: document.getElementById('powers'),
      selPanel: document.getElementById('sel-panel'),
      selSingle: document.getElementById('sel-single'),
      selMulti: document.getElementById('sel-multi'),
      selIcon: document.getElementById('sel-icon'),
      selName: document.getElementById('sel-name'),
      selExtra: document.getElementById('sel-extra'),
      selHpFill: document.getElementById('sel-hp-fill'),
    };
    this.cameos = {};              // key -> {root, clockCanvas, tag, badge, shade}
    this.radarG = this.el.radar.getContext('2d');
    this.selIconG = this.el.selIcon.getContext('2d');
    this.selIconG.imageSmoothingEnabled = false;
    this.radarT = 0;
    this.selT = 0;
    this.bannerT = 0;
    this.buildStrips();
    this.buildPowers();
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
    this.el.selPanel.style.display = 'none';
    this.hideTip();
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
    if (this.pw) {
      this.pw.recon.root.classList.toggle('on', m === 'power-recon');
      this.pw.emp.root.classList.toggle('on', m === 'power-emp');
    }
    document.getElementById('viewport').style.cursor =
      m === 'sell' ? 'not-allowed' : m === 'repair' ? 'help' : 'crosshair';
  }

  // -------------------------------------------------------- commander powers --

  // two square ability buttons above the strips (RECON SWEEP / EMP BLAST),
  // shown only while the player owns a tech center, with a radial cooldown.
  buildPowers() {
    this.pw = {};
    const mk = (id, key, iconCanvas, label) => {
      const root = document.createElement('div');
      root.className = 'power-btn cooling';
      root.id = id;
      this.el.powers.appendChild(root);
      const icon = document.createElement('canvas');
      icon.width = 48; icon.height = 36; icon.className = 'pw-icon';
      icon.getContext('2d').drawImage(iconCanvas, 0, 0);
      root.appendChild(icon);
      const clock = document.createElement('canvas');
      clock.width = 48; clock.height = 36; clock.className = 'pw-clock';
      root.appendChild(clock);
      const tag = document.createElement('div'); tag.className = 'pw-tag';
      tag.textContent = label;
      root.appendChild(tag);
      root.addEventListener('click', () => this.onPowerClick(key));
      this.pw[key] = { root, clock, clockG: clock.getContext('2d'), tag, label };
    };
    mk('pw-recon', 'recon', this.sprites.powerIcons.recon, 'RECON');
    mk('pw-emp', 'emp', this.sprites.powerIcons.emp, 'EMP');
  }

  onPowerClick(key) {
    const g = this.game;
    const cd = key === 'recon' ? g.reconCd : g.empCd;
    if (cd > 0) { this.audio.sfx('nofunds'); return; }
    const mode = key === 'recon' ? 'power-recon' : 'power-emp';
    this.setMode(this.mode === mode ? 'normal' : mode);
    this.audio.sfx('select');
  }

  updatePower(key, cd, max) {
    const c = this.pw[key];
    const cooling = cd > 0.05;
    c.root.classList.toggle('cooling', cooling);
    const gg = c.clockG;
    gg.clearRect(0, 0, 48, 36);
    if (cooling) {
      const frac = 1 - cd / max;
      gg.fillStyle = 'rgba(0,0,0,0.62)';
      gg.beginPath();
      gg.moveTo(24, 18);
      const a0 = -Math.PI / 2 + frac * Math.PI * 2;
      gg.arc(24, 18, 40, a0, Math.PI * 1.5);
      gg.closePath();
      gg.fill();
      c.tag.textContent = `${Math.ceil(cd)}s`;
    } else {
      c.tag.textContent = c.label;
    }
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
      root.addEventListener('click', () => this.onCameoClick(kind, key));
      root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onCameoRightClick(kind, key); });
      root.addEventListener('mouseenter', () => this.showTip(key));
      root.addEventListener('mouseleave', () => this.hideTip());
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

  // ------------------------------------------------------------ tooltip --

  // Styled hover tooltip for a cameo: name, cost, power delta and the tech
  // requirements (missing structures greyed-red). Kept inside the viewport.
  showTip(key) {
    const c = this.cameos[key];
    if (!c) return;
    const def = c.def, g = this.game, p = g.players.player;
    let html = `<div class="tip-name">${def.name}</div>`;
    html += `<div class="tip-cost">$${def.cost}</div>`;
    if (c.kind === 'building' && def.power) {
      const cls = def.power > 0 ? 'tip-pwr-plus' : 'tip-pwr-minus';
      const sign = def.power > 0 ? '+' : '';
      html += `<div class="${cls}">${sign}${def.power} POWER</div>`;
    }
    const reqs = def.requires || [];
    if (reqs.length) {
      const parts = reqs.map((k) => {
        const have = g.buildings.some((b) => !b.dead && b.owner === p && b.key === k);
        return `<span class="${have ? 'tip-have' : 'tip-miss'}">${BUILDINGS[k].name}</span>`;
      });
      html += `<div class="tip-req">NEEDS ${parts.join(', ')}</div>`;
    }
    const tip = this.el.tip;
    tip.innerHTML = html;
    tip.style.display = 'block';
    // position to the left of the cameo, clamped to the viewport
    const r = c.root.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left - tr.width - 8;
    if (left < 4) left = r.right + 8;
    if (left + tr.width > window.innerWidth - 4) left = window.innerWidth - tr.width - 4;
    let top = r.top;
    if (top + tr.height > window.innerHeight - 4) top = window.innerHeight - tr.height - 4;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }

  hideTip() { this.el.tip.style.display = 'none'; }

  // ------------------------------------------------------ selection panel --

  // Small bottom-left readout of the current selection: single shows a cameo
  // icon + name + hp bar; multiple shows a per-type tally. Throttled to ~5fps.
  updateSelPanel(selection) {
    const sel = (selection || []).filter((e) => !e.dead && !e.boarded);
    if (!sel.length) { this.el.selPanel.style.display = 'none'; return; }
    this.el.selPanel.style.display = 'block';
    if (sel.length === 1) {
      const e = sel[0];
      this.el.selSingle.style.display = 'flex';
      this.el.selMulti.style.display = 'none';
      this.drawSelIcon(e);
      this.el.selName.textContent = e.def.name;
      // extra line: veterancy rank and/or APC cargo count
      let extra = '';
      if (e.isUnit && e.rank > 0) extra += e.rank >= 2 ? 'ELITE ★★' : 'VETERAN ★';
      if (e.isUnit && e.def.capacity) {
        const n = e.cargoUnits ? e.cargoUnits.length : 0;
        extra += (extra ? '  ' : '') + `CARGO ${n}/${e.def.capacity}`;
      }
      this.el.selExtra.textContent = extra;
      this.el.selExtra.style.display = extra ? 'block' : 'none';
      const frac = Math.max(0, e.hp / e.maxHp);
      this.el.selHpFill.style.width = `${frac * 100}%`;
      this.el.selHpFill.style.background =
        frac > 0.6 ? 'var(--ui-green)' : frac > 0.3 ? 'var(--ui-gold)' : 'var(--ui-red)';
    } else {
      this.el.selSingle.style.display = 'none';
      this.el.selMulti.style.display = 'flex';
      const counts = new Map();
      for (const e of sel) counts.set(e.def.name, (counts.get(e.def.name) || 0) + 1);
      let html = `<div class="sel-head">${sel.length} SELECTED</div>`;
      for (const [name, n] of counts) {
        html += `<div class="sel-row"><span>${name}</span><span class="sel-n">×${n}</span></div>`;
      }
      this.el.selMulti.innerHTML = html;
    }
  }

  drawSelIcon(e) {
    const g = this.selIconG, W = this.el.selIcon.width, H = this.el.selIcon.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#181c22'; g.fillRect(0, 0, W, H);
    let spr = null;
    if (e.isBuilding) spr = this.sprites.buildings[e.house]?.[e.key];
    else {
      const set = this.sprites.units[e.house]?.[e.key];
      if (set) spr = set.hull ? set.hull[0] : set.frames[0][0];
    }
    if (spr) {
      const fit = Math.min((W - 6) / spr.width, (H - 6) / spr.height, 2.4);
      const w = Math.max(6, Math.round(spr.width * fit)), h = Math.max(6, Math.round(spr.height * fit));
      g.drawImage(spr, (W - w) / 2, (H - h) / 2, w, h);
    }
  }

  // -------------------------------------------------------------- update --

  update(dt, selection) {
    const g = this.game, p = g.players.player;

    // selection panel (~5fps)
    this.selT -= dt;
    if (this.selT <= 0) { this.selT = 0.2; this.updateSelPanel(selection); }

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

    // commander powers: only while a tech center stands
    const hasTech = g.buildings.some((b) => !b.dead && b.owner === p && b.key === 'techcenter');
    this.el.powers.classList.toggle('hidden', !hasTech);
    if (hasTech) {
      this.updatePower('recon', g.reconCd, RECON_CD);
      this.updatePower('emp', g.empCd, EMP_CD);
    } else if (this.mode === 'power-recon' || this.mode === 'power-emp') {
      this.setMode('normal');   // tech center lost mid-target
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
        else if (t === T.RUIN) { r = 78; gg = 72; b = 66; }
        else if (t === T.DIRT) { r = 110; gg = 88; b = 52; }
        if (m.ore[i] > 0) {
          if (m.gem[i]) { r = 90; gg = 200; b = 220; }
          else { r = 190; gg = 150; b = 40; }
        }
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
      // neutral supply depots blip white; owned ones take the owner's colour
      ctx.fillStyle = (b.def.isDepot && b.house === 'neutral')
        ? '#dfe6ea' : (HOUSE_UI[b.house] || HOUSE_UI.enemy).building;
      ctx.fillRect(b.cx * scale, b.cy * scale, Math.max(2, b.def.w * scale), Math.max(2, b.def.h * scale));
    }
    for (const u of g.units) {
      if (u.dead) continue;
      if (u.house !== 'player' && !g.isVisibleToPlayer(u)) continue;
      ctx.fillStyle = (HOUSE_UI[u.house] || HOUSE_UI.enemy).unit;
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
