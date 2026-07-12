// WebAudio sound: every effect is synthesized (no samples), plus a small
// original chiptune march loop in square/triangle/noise channels and a
// robotic tactical-advisor voice via the browser's speech synthesis.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicOn = true;
    this.voiceOn = true;
    this.masterVol = 0.5;
    this.musicVol = 0.32;
    this.musicTimer = null;
    this.lastVoice = 0;
    this.lastSfx = {};
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
    o.connect(g); g.connect(out || this.master);
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
    src.connect(f); f.connect(g); g.connect(out || this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
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
        this.osc('square', 220, now, 0.05, 0.05);
        break;
      case 'cannon':
        this.noise(now, 0.22, 0.3, 900, null, 120);
        this.osc('sine', 120, now, 0.25, 0.3, null, 40);
        break;
      case 'rocket':
        this.noise(now, 0.4, 0.16, 1400, null, 2400);
        break;
      case 'tesla': {
        const g = this.ctx.createGain();
        g.gain.value = 0.001; g.connect(this.master);
        this.env(g, now, 0.01, 0.32, 0.42);
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, now);
        o.frequency.linearRampToValueAtTime(45, now + 0.42);
        const lfo = this.ctx.createOscillator();
        lfo.type = 'square'; lfo.frequency.value = 60;
        const lg = this.ctx.createGain(); lg.gain.value = 700;
        lfo.connect(lg); lg.connect(o.frequency);
        o.connect(g);
        o.start(now); o.stop(now + 0.48);
        lfo.start(now); lfo.stop(now + 0.48);
        this.noise(now, 0.35, 0.12, 5000);
        break;
      }
      case 'boomSmall':
        this.noise(now, 0.28, 0.28, 1000, null, 90);
        this.osc('triangle', 160, now, 0.2, 0.2, null, 50);
        break;
      case 'boomBig':
        this.noise(now, 0.7, 0.4, 700, null, 60);
        this.osc('sine', 90, now, 0.5, 0.4, null, 30);
        this.noise(now + 0.1, 0.5, 0.2, 300, null, 50);
        break;
      case 'select':
        this.osc('square', 660, now, 0.05, 0.08);
        this.osc('square', 880, now + 0.05, 0.06, 0.08);
        break;
      case 'ack':
        this.osc('square', 520, now, 0.05, 0.08);
        this.osc('square', 700, now + 0.04, 0.05, 0.07);
        this.osc('square', 940, now + 0.09, 0.07, 0.07);
        break;
      case 'place':
        this.noise(now, 0.12, 0.2, 500, null, 150);
        this.osc('triangle', 200, now, 0.14, 0.2, null, 90);
        break;
      case 'sell':
        for (let i = 0; i < 5; i++) this.osc('square', 900 - i * 120, now + i * 0.045, 0.04, 0.09);
        break;
      case 'tick':
        this.osc('square', 1150, now, 0.018, 0.045);
        break;
      case 'ready':
        this.osc('square', 780, now, 0.08, 0.1);
        this.osc('square', 1040, now + 0.09, 0.1, 0.1);
        break;
      case 'nofunds':
        this.osc('square', 300, now, 0.09, 0.1);
        this.osc('square', 220, now + 0.1, 0.12, 0.1);
        break;
      case 'alert':
        for (let i = 0; i < 2; i++) {
          this.osc('square', 640, now + i * 0.24, 0.1, 0.12);
          this.osc('square', 460, now + i * 0.24 + 0.1, 0.1, 0.12);
        }
        break;
      case 'zapdown':
        this.osc('sawtooth', 400, now, 0.3, 0.1, null, 60);
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
  // Original martial chiptune loop: driving square bass, minor-key lead,
  // noise snare. Written for this project.

  startMusic() {
    if (!this.ensure()) return;
    this.stopMusic();
    this.musicOn = true;
    const bpm = 132;
    const step = 60 / bpm / 2; // 8th notes
    // E minor march, two 16-step bars of bass + lead phrase
    const E2 = 82.41, G2 = 98, A2 = 110, B2 = 123.47, C3 = 130.81, D3 = 146.83;
    const E3 = 164.81, G3 = 196, A3 = 220, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63, FS4 = 369.99, G4 = 392;
    const bass = [
      E2, E2, E2, G2, E2, E2, B2, A2, E2, E2, E2, G2, C3, C3, B2, A2,
      E2, E2, E2, G2, E2, E2, B2, A2, D3, D3, C3, C3, B2, B2, A2, G2,
    ];
    const lead = [
      E4, 0, E4, 0, G4, 0, FS4, E4, 0, B3, 0, E4, 0, 0, D4, E4,
      0, 0, G4, 0, FS4, 0, E4, 0, D4, 0, C4, B3, A3, 0, B3, 0,
    ];
    const snare = [
      0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1,
    ];
    let i = 0;
    const scheduleBeat = () => {
      if (!this.musicOn || !this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      const k = i % 32;
      if (bass[k]) {
        this.osc('square', bass[k], t, step * 0.85, 0.10, this.musicGain);
        this.osc('triangle', bass[k] / 2, t, step * 0.9, 0.12, this.musicGain);
      }
      if (lead[k]) this.osc('square', lead[k], t, step * 0.8, 0.055, this.musicGain);
      if (snare[k]) this.noise(t, 0.07, 0.09, 3500, this.musicGain, 900);
      if (k % 8 === 0) this.noise(t, 0.05, 0.12, 220, this.musicGain, 80); // kick-ish thud
      i++;
      this.musicTimer = setTimeout(scheduleBeat, step * 1000);
    };
    scheduleBeat();
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  }

  toggleMusic() {
    if (this.musicOn) { this.stopMusic(); return false; }
    this.startMusic(); return true;
  }
}
