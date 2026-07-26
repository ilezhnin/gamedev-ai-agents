// Synthesis primitives, mixed into AudioSys.prototype. Everything is generated
// from scratch (no samples): 2-operator FM voices for the metallic bass/lead/
// brass timbres and PSG-style square/noise blips for chip percussion.
//
// These are prototype methods rather than free functions because they all read
// the live graph off `this` (ctx, sfxGain) — keeping them bound to the class
// avoids threading the audio context through every call site.

// note helper: name ('E2', 'Fs3', 'As4') or raw Hz -> frequency
const NOTE_SEMI = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
export function noteFreq(n) {
  if (n === 0 || n == null) return 0;
  if (typeof n === 'number') return n;
  const m = /^([A-G]s?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_SEMI[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const SYNTH = {

  env(gain, t0, a, peak, d, sustain = 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + a + d);
  },

  osc(type, freq, t0, dur, peak = 0.2, out = null, endFreq = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    this.env(g, t0, 0.005, peak, dur);
    o.connect(g); g.connect(out || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

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
  },

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
  },

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
  },
};
