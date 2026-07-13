// WebAudio sound: every effect is synthesized from scratch (no samples).
// The soundscape targets the 16-bit console era — 2-operator FM voices for
// metallic bass/lead/brass timbres and PSG-style square/noise blips for chip
// percussion. Three original compositions (menu / battle / victory+defeat
// jingles) run on a lookahead pattern sequencer. A robotic tactical-advisor
// voice rides on the browser's speech synthesis. All music is original — the
// melodies and progressions below were written for this project.

// --- note helper: name ('E2', 'Fs3', 'As4') or raw Hz -> frequency ---------
const NOTE_SEMI = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
function noteFreq(n) {
  if (n === 0 || n == null) return 0;
  if (typeof n === 'number') return n;
  const m = /^([A-G]s?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_SEMI[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// --- SONGS -----------------------------------------------------------------
// Each song is a small pattern: per-track step arrays plus the voice config
// used to render them. 0 = rest. Drums use single-letter tokens
// (k kick, s snare, h hat, o tom/toll). len steps loop (or play once).
const SONGS = {
  // 'menu' — slow ominous minor march in A minor (~90bpm), 4 bars of eighths.
  // Plodding FM bass, a mournful brass-ish lead, a harmonic-minor bell arp
  // (the Gs gives the ceremonial, cold-war dread), soft martial drums.
  menu: {
    bpm: 90, stepsPerBeat: 2, loop: true, len: 32,
    bass: {
      ratio: 1, mod: 1.3, peak: 0.13, a: 0.01, d: 0.5, s: 0.5, r: 0.12,
      notes: ['A1', 0, 0, 0, 'A1', 0, 'A1', 0, 'F1', 0, 0, 0, 'G1', 0, 'G1', 0,
        'A1', 0, 0, 0, 'A1', 0, 'C2', 0, 'D2', 0, 0, 0, 'E2', 0, 'E1', 0],
    },
    lead: {
      ratio: 2, mod: 1.6, peak: 0.085, a: 0.03, d: 0.4, s: 0.55, r: 0.2, modDecay: 0.25,
      notes: [0, 0, 0, 0, 'A3', 0, 0, 0, 0, 0, 'C4', 0, 'B3', 0, 0, 0,
        'A3', 0, 0, 0, 'E4', 0, 'D4', 0, 'C4', 0, 'B3', 0, 'A3', 0, 0, 0],
    },
    arp: {
      kind: 'psg', type: 'triangle', peak: 0.05, gate: 0.5,
      notes: ['A3', 0, 'C4', 0, 'E4', 0, 'C4', 0, 'F3', 0, 'A3', 0, 'C4', 0, 'A3', 0,
        'A3', 0, 'C4', 0, 'E4', 0, 'C4', 0, 'E3', 0, 'Gs3', 0, 'B3', 0, 'E4', 0],
    },
    drums: ['k', 0, 0, 0, 's', 0, 0, 0, 'k', 0, 0, 'k', 's', 0, 's', 0,
      'k', 0, 0, 0, 's', 0, 0, 0, 'k', 0, 'k', 0, 's', 0, 's', 's'],
    drumMix: 0.85,
  },

  // 'battle' — driving E-minor track at 138bpm on a sixteenth grid (2 bars).
  // Syncopated FM bass riff, a punchy metallic lead answered by a fast arp,
  // busy four-on-the-floor drums with off-beat snares.
  battle: {
    bpm: 138, stepsPerBeat: 4, loop: true, len: 32,
    bass: {
      ratio: 1, mod: 2.2, peak: 0.13, a: 0.006, d: 0.14, s: 0.35, r: 0.05, modDecay: 0.08,
      notes: ['E2', 0, 'E2', 'E2', 0, 'E2', 0, 'G2', 'E2', 0, 'E2', 0, 'B2', 0, 'A2', 0,
        'E2', 0, 'E2', 'E2', 0, 'E2', 0, 'G2', 'C3', 0, 'B2', 0, 'A2', 0, 'G2', 0],
    },
    lead: {
      ratio: 3, mod: 2.4, peak: 0.07, a: 0.006, d: 0.1, s: 0.25, r: 0.05, modDecay: 0.06,
      notes: [0, 0, 'E4', 0, 'G4', 0, 'E4', 'B4', 0, 'A4', 0, 'G4', 'Fs4', 0, 'E4', 0,
        0, 'D4', 0, 'E4', 'G4', 0, 0, 'B4', 'A4', 0, 'B4', 0, 'E5', 0, 0, 0],
    },
    arp: {
      kind: 'psg', type: 'square', peak: 0.035, gate: 0.55,
      notes: ['E4', 'B4', 'E5', 'B4', 'G4', 'B4', 'E5', 'B4', 'A4', 'E5', 'A4', 'E5', 'Fs4', 'B4', 'Fs4', 'B4',
        'E4', 'B4', 'E5', 'B4', 'G4', 'B4', 'E5', 'B4', 'C5', 'G4', 'C5', 'A4', 'B4', 'G4', 'E4', 'B4'],
    },
    drums: ['k', 'h', 'h', 'h', 's', 'h', 'h', 'k', 'k', 'h', 'h', 'h', 's', 'h', 'k', 'h',
      'k', 'h', 'h', 'h', 's', 'h', 'h', 'k', 'k', 'h', 'h', 'h', 's', 'h', 's', 'h'],
    drumMix: 1,
  },

  // 'victory' — bright E-major fanfare stinger (~4s at 120bpm, plays once).
  victory: {
    bpm: 120, stepsPerBeat: 4, loop: false, len: 32,
    lead: {
      ratio: 2, mod: 2, peak: 0.11, a: 0.006, d: 0.2, s: 0.5, r: 0.25,
      notes: ['E4', 0, 0, 'G4', 0, 'B4', 0, 0, 'E5', 0, 0, 0, 'B4', 0, 'E5', 0,
        'Gs4', 0, 'B4', 0, 'E5', 0, 0, 0, 'B4', 0, 'Gs5', 0, 'E5', 0, 0, 0],
    },
    bass: {
      ratio: 1, mod: 1.5, peak: 0.14, a: 0.006, d: 0.25, s: 0.4, r: 0.2,
      notes: ['E2', 0, 0, 0, 'E2', 0, 0, 0, 'E2', 0, 0, 0, 'B2', 0, 0, 0,
        'E2', 0, 0, 0, 'E2', 0, 0, 0, 'B2', 0, 'E2', 0, 'E2', 0, 0, 0],
    },
    drums: ['k', 0, 0, 0, 's', 0, 0, 0, 'k', 0, 0, 0, 's', 0, 0, 0,
      'k', 0, 0, 0, 's', 0, 0, 0, 's', 's', 's', 's', 'k', 0, 0, 0],
    drumMix: 1,
  },

  // 'defeat' — somber descending E-minor stinger (~6s at 80bpm, plays once).
  defeat: {
    bpm: 80, stepsPerBeat: 2, loop: false, len: 16,
    lead: {
      ratio: 3, mod: 1, peak: 0.1, a: 0.02, d: 0.5, s: 0.5, r: 0.4,
      notes: ['B3', 0, 0, 0, 'G3', 0, 0, 0, 'E3', 0, 'D3', 0, 'E3', 0, 0, 0],
    },
    bass: {
      ratio: 1, mod: 1.1, peak: 0.14, a: 0.02, d: 0.6, s: 0.45, r: 0.4,
      notes: ['E2', 0, 0, 0, 'C2', 0, 0, 0, 'B1', 0, 0, 0, 'E2', 0, 0, 0],
    },
    drums: ['o', 0, 0, 0, 0, 0, 0, 0, 'o', 0, 0, 0, 0, 0, 'k', 0],
    drumMix: 0.9,
  },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;   // music bus
    this.sfxGain = null;     // effects bus
    this.musicOn = true;     // music enabled by the player
    this.voiceOn = true;
    this.masterVol = 0.5;
    this.musicVol = 0.32;
    this.sfxVol = 0.8;
    this.lastVoice = 0;
    this.lastSfx = {};
    // sequencer state
    this.playing = false;
    this.musicTimer = null;
    this.song = null;
    this.songName = null;
    this.currentSong = 'menu';
    this.currentLoop = true;
    this.stepIndex = 0;
    this.nextNoteTime = 0;
    this.songDone = false;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVol;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      return true;
    } catch { return false; }
  }

  setMaster(v) {
    this.masterVol = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusicVol(v) {
    this.musicVol = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  setSfxVol(v) {
    this.sfxVol = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ------------------------------------------------------------- helpers --

  env(gain, t0, a, peak, d, sustain = 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + a + d);
  }

  osc(type, freq, t0, dur, peak = 0.2, out = null, endFreq = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    this.env(g, t0, 0.005, peak, dur);
    o.connect(g); g.connect(out || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(t0, dur, peak = 0.25, filterFreq = 1200, out = null, slideTo = null) {
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    if (slideTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(out || this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // Classic 2-operator FM voice: a sine modulator's output drives the
  // carrier's frequency. modIndex is the modulation index (deviation /
  // modFreq); higher = more metallic/brassy. adsr carries { t0, a, d, s, r,
  // dur, modDecay }. Returns nothing — fire and forget.
  fmVoice(freq, ratio, modIndex, adsr, out = null, peak = 0.12) {
    const t0 = adsr.t0;
    const a = adsr.a ?? 0.006;
    const d = adsr.d ?? 0.12;
    const s = adsr.s ?? 0;
    const r = adsr.r ?? 0.04;
    const dur = adsr.dur ?? (a + d);
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const amp = this.ctx.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.setValueAtTime(freq, t0);
    mod.frequency.setValueAtTime(freq * ratio, t0);
    const dev = freq * ratio * modIndex;
    modGain.gain.setValueAtTime(dev, t0);
    if (adsr.modDecay) modGain.gain.exponentialRampToValueAtTime(Math.max(1, dev * 0.15), t0 + adsr.modDecay);
    mod.connect(modGain); modGain.connect(car.frequency);
    // amplitude ADSR
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + a);
    let stop;
    if (s > 0) {
      amp.gain.linearRampToValueAtTime(Math.max(0.0001, peak * s), t0 + a + d);
      amp.gain.setValueAtTime(Math.max(0.0001, peak * s), t0 + Math.max(a + d, dur));
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + d, dur) + r);
      stop = t0 + Math.max(a + d, dur) + r + 0.02;
    } else {
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
      stop = t0 + a + d + 0.02;
    }
    car.connect(amp); amp.connect(out || this.sfxGain);
    car.start(t0); car.stop(stop);
    mod.start(t0); mod.stop(stop);
  }

  // PSG-style blip: a bright square/tri/saw tone or a filtered noise burst,
  // used for chip percussion and arpeggios.
  psg(kind, freq, t0, dur, peak = 0.08, out = null) {
    if (kind === 'noise') { this.noise(t0, dur, peak, freq || 4000, out); return; }
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = kind === 'square' ? 'square' : (kind || 'square');
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // --------------------------------------------------------------- sfx ----

  sfx(name) {
    if (!this.ensure()) return;
    this.resume();
    const now = this.ctx.currentTime;
    // rate limit identical sfx to avoid mud
    const last = this.lastSfx[name] || 0;
    const minGap = name === 'tick' ? 0.02 : 0.05;
    if (now - last < minGap) return;
    this.lastSfx[name] = now;

    switch (name) {
      case 'rifle':
        this.noise(now, 0.09, 0.18, 2600, null, 500);
        break;
      case 'mg':
        this.noise(now, 0.07, 0.2, 3200, null, 700);
        this.psg('square', 220, now, 0.05, 0.05);
        break;
      case 'cannon':
        // FM thump (metallic low body) + a sharp noise crack on top
        this.fmVoice(120, 1.7, 3.5, { t0: now, a: 0.004, d: 0.22, dur: 0.22, modDecay: 0.08 }, null, 0.32);
        this.noise(now, 0.06, 0.3, 3200, null, 400);
        this.noise(now + 0.01, 0.2, 0.16, 800, null, 90);
        break;
      case 'rocket':
        this.noise(now, 0.4, 0.16, 1400, null, 2400);
        break;
      case 'tesla': {
        // modulated FM zap: gnarly carrier with heavy detune + crackle
        this.fmVoice(70, 6.0, 8, { t0: now, a: 0.006, d: 0.42, s: 0.4, r: 0.08, dur: 0.4, modDecay: 0.3 }, null, 0.3);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, now);
        o.frequency.linearRampToValueAtTime(50, now + 0.42);
        const lfo = this.ctx.createOscillator();
        lfo.type = 'square'; lfo.frequency.value = 55;
        const lg = this.ctx.createGain(); lg.gain.value = 600;
        lfo.connect(lg); lg.connect(o.frequency);
        this.env(g, now, 0.01, 0.14, 0.44);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.48);
        lfo.start(now); lfo.stop(now + 0.48);
        this.noise(now, 0.35, 0.1, 6000);
        break;
      }
      case 'boomSmall':
        // layered noise crack + short FM boom
        this.noise(now, 0.26, 0.28, 1000, null, 90);
        this.fmVoice(150, 1.4, 2, { t0: now, a: 0.004, d: 0.2, dur: 0.2, modDecay: 0.09 }, null, 0.22);
        break;
      case 'boomBig':
        // two noise layers + deep FM boom + a sub sine tail
        this.noise(now, 0.7, 0.4, 700, null, 60);
        this.noise(now + 0.09, 0.5, 0.22, 320, null, 50);
        this.fmVoice(90, 1.3, 2.5, { t0: now, a: 0.005, d: 0.5, dur: 0.5, modDecay: 0.18 }, null, 0.36);
        this.osc('sine', 55, now + 0.02, 0.5, 0.25, null, 30);
        break;
      case 'select':
        // neutral UI blip — short rising square pair
        this.psg('square', 660, now, 0.05, 0.08);
        this.psg('square', 880, now + 0.05, 0.06, 0.08);
        break;
      case 'selInf':
        // infantry select: crisp two-tone PSG chirp
        this.psg('square', 720, now, 0.04, 0.07);
        this.psg('square', 960, now + 0.045, 0.05, 0.07);
        break;
      case 'selVeh':
        // vehicle select: lower, rounder FM click
        this.fmVoice(300, 1, 1.5, { t0: now, a: 0.004, d: 0.08, dur: 0.08 }, null, 0.14);
        this.psg('square', 440, now + 0.05, 0.05, 0.06);
        break;
      case 'ack':
        // generic acknowledge arp
        this.psg('square', 520, now, 0.05, 0.08);
        this.psg('square', 700, now + 0.04, 0.05, 0.07);
        this.psg('square', 940, now + 0.09, 0.07, 0.07);
        break;
      case 'ackInf':
        // infantry acknowledge: bright ascending PSG arp
        this.psg('square', 620, now, 0.045, 0.08);
        this.psg('square', 830, now + 0.045, 0.045, 0.07);
        this.psg('square', 1100, now + 0.09, 0.07, 0.07);
        break;
      case 'ackVeh':
        // vehicle acknowledge: gruff FM two-note motor blip
        this.fmVoice(260, 1, 2, { t0: now, a: 0.005, d: 0.09, dur: 0.09, modDecay: 0.05 }, null, 0.16);
        this.fmVoice(390, 1, 2, { t0: now + 0.08, a: 0.005, d: 0.1, dur: 0.1, modDecay: 0.05 }, null, 0.15);
        break;
      case 'place':
        this.noise(now, 0.12, 0.2, 500, null, 150);
        this.fmVoice(200, 1.5, 1.5, { t0: now, a: 0.005, d: 0.14, dur: 0.14, modDecay: 0.06 }, null, 0.2);
        break;
      case 'sell':
        for (let i = 0; i < 5; i++) this.psg('square', 900 - i * 120, now + i * 0.045, 0.04, 0.09);
        break;
      case 'tick':
        this.psg('square', 1150, now, 0.018, 0.045);
        break;
      case 'ready':
        // build-complete fanfare blip: bright FM triad flourish
        this.fmVoice(660, 2, 1.6, { t0: now, a: 0.005, d: 0.09, dur: 0.09 }, null, 0.11);
        this.fmVoice(880, 2, 1.6, { t0: now + 0.08, a: 0.005, d: 0.09, dur: 0.09 }, null, 0.11);
        this.fmVoice(1170, 2, 1.8, { t0: now + 0.16, a: 0.005, d: 0.14, dur: 0.14, modDecay: 0.08 }, null, 0.11);
        break;
      case 'nofunds':
        this.psg('square', 300, now, 0.09, 0.1);
        this.psg('square', 220, now + 0.1, 0.12, 0.1);
        break;
      case 'alert':
        // EVA-ish alert stinger: urgent FM two-tone brass, doubled
        for (let i = 0; i < 2; i++) {
          const t = now + i * 0.26;
          this.fmVoice(660, 2, 2.4, { t0: t, a: 0.006, d: 0.11, dur: 0.11, modDecay: 0.06 }, null, 0.14);
          this.fmVoice(494, 2, 2.4, { t0: t + 0.11, a: 0.006, d: 0.12, dur: 0.12, modDecay: 0.06 }, null, 0.14);
        }
        break;
      case 'zapdown':
        this.osc('sawtooth', 400, now, 0.3, 0.1, null, 60);
        break;
      case 'crush':
        this.noise(now, 0.16, 0.26, 350, null, 90);
        this.fmVoice(110, 1.3, 1.8, { t0: now, a: 0.004, d: 0.12, dur: 0.12, modDecay: 0.05 }, null, 0.18);
        break;
      case 'flame':
        // breathy whoosh: filtered noise sliding down, low body rumble
        this.noise(now, 0.32, 0.22, 1800, null, 600);
        this.osc('sawtooth', 130, now, 0.22, 0.08, null, 70);
        break;
    }
  }

  // -------------------------------------------------------------- voice ---

  say(text, priority = false) {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!priority && now - this.lastVoice < 2500) return;
    this.lastVoice = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 0.45; u.volume = 0.8;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }

  // -------------------------------------------------------------- music ---
  // Pattern sequencer with lookahead scheduling: a 50ms timer schedules every
  // step that falls inside a short horizon against the AudioContext clock, so
  // timing is sample-accurate and jitter-free regardless of timer drift.

  playSong(name, loop = true) {
    if (!this.ensure()) return;
    this.resume();
    const song = SONGS[name];
    if (!song) return;
    if (this.playing && this.songName === name) return; // already running
    this._stopScheduler();
    this.song = song;
    this.songName = name;
    this.currentSong = name;
    this.currentLoop = loop;
    this.stepIndex = 0;
    this.songDone = false;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.playing = true;
    this._scheduler();
  }

  playMenu() { this.playSong('menu', true); }
  playBattle() { this.playSong('battle', true); }
  playJingle(win) { this.playSong(win ? 'victory' : 'defeat', false); }
  // back-compat: default in-match music is the battle theme
  startMusic() { if (!this.ensure()) return; this.musicOn = true; this.playBattle(); }

  _scheduler() {
    if (!this.playing || !this.ctx) return;
    const song = this.song;
    const stepDur = 60 / song.bpm / song.stepsPerBeat;
    const horizon = this.ctx.currentTime + 0.12;
    while (!this.songDone && this.nextNoteTime < horizon) {
      this._scheduleStep(this.stepIndex, this.nextNoteTime, song, stepDur);
      this.nextNoteTime += stepDur;
      this.stepIndex++;
      if (this.stepIndex >= song.len) {
        if (song.loop) this.stepIndex = 0;
        else this.songDone = true;
      }
    }
    if (this.songDone) {
      // let the last scheduled notes ring out, then fall silent
      const wait = Math.max(80, (this.nextNoteTime + 0.6 - this.ctx.currentTime) * 1000);
      this.musicTimer = setTimeout(() => this._stopScheduler(), wait);
      return;
    }
    this.musicTimer = setTimeout(() => this._scheduler(), 50);
  }

  _scheduleStep(i, t, song, stepDur) {
    const g = this.musicGain;
    if (song.lead) this._trackNote(song.lead, i, t, stepDur, g);
    if (song.bass) this._trackNote(song.bass, i, t, stepDur, g);
    if (song.arp) this._trackNote(song.arp, i, t, stepDur, g);
    if (song.drums) this._drum(song.drums[i % song.drums.length], t, g, song.drumMix || 1);
  }

  _trackNote(cfg, i, t, stepDur, out) {
    const n = cfg.notes[i % cfg.notes.length];
    const f = noteFreq(n);
    if (!f) return;
    const dur = stepDur * (cfg.gate || 0.92);
    if (cfg.kind === 'psg') {
      this.psg(cfg.type || 'square', f, t, dur, cfg.peak ?? 0.05, out);
    } else {
      this.fmVoice(f, cfg.ratio ?? 1, cfg.mod ?? 1,
        { t0: t, a: cfg.a ?? 0.006, d: cfg.d ?? dur, s: cfg.s ?? 0, r: cfg.r ?? 0.05, dur, modDecay: cfg.modDecay },
        out, cfg.peak ?? 0.09);
    }
  }

  _drum(kind, t, out, mix) {
    if (!kind) return;
    switch (kind) {
      case 'k': // kick: sine pitch-drop + click
        this.osc('sine', 150, t, 0.14, 0.32 * mix, out, 45);
        this.noise(t, 0.03, 0.1 * mix, 300, out, 80);
        break;
      case 's': // snare: bright noise burst + body tone
        this.noise(t, 0.12, 0.22 * mix, 3200, out, 1200);
        this.osc('triangle', 330, t, 0.08, 0.1 * mix, out, 180);
        break;
      case 'h': // hat: very short bright noise tick
        this.noise(t, 0.03, 0.07 * mix, 9000, out, 6000);
        break;
      case 'o': // tom / toll: low sine drop
        this.osc('sine', 120, t, 0.3, 0.3 * mix, out, 55);
        break;
    }
  }

  _stopScheduler() {
    this.playing = false;
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  }

  stopMusic() { this._stopScheduler(); }

  // Toggle the music-enabled flag. When re-enabling, resume the current song
  // (looping themes; jingles just re-arm without replaying).
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) {
      if (this.currentLoop) this.playSong(this.currentSong || 'menu', true);
    } else {
      this._stopScheduler();
    }
    return this.musicOn;
  }
}
