// WebAudio sound: every effect is synthesized from scratch (no samples). The
// soundscape targets the 16-bit console era — see src/audio/synth.js for the
// voices, songs.js for the three original compositions and sequencer.js for
// the lookahead pattern player. A robotic tactical-advisor voice rides on the
// browser's speech synthesis.
//
// This file owns the AudioSys class: the mixer buses, the sound-effect bank
// and the advisor. The synth and sequencer method groups are mixed into the
// prototype at the bottom, so `this.fmVoice(...)` works the same everywhere.

import { SYNTH } from './synth.js';
import { SEQUENCER } from './sequencer.js';

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

  // cut any in-flight advisor line (the tab went away mid-sentence)
  stopSpeech() {
    if (!('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); } catch { /* speech not available */ }
  }
}

// Prototype mixins rather than subclasses: the groups are peer concerns, and
// AudioSys stays the single public object the game holds.
Object.assign(AudioSys.prototype, SYNTH, SEQUENCER);
