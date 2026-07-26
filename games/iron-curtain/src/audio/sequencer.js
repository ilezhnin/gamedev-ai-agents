// The music sequencer, mixed into AudioSys.prototype.
//
// Lookahead pattern scheduling: a 50ms timer schedules every step that falls
// inside a short horizon against the AudioContext clock, so timing is
// sample-accurate and jitter-free regardless of timer drift. The step -> voice
// translation lives here; the voices themselves come from synth.js and the
// patterns from songs.js.

import { noteFreq } from './synth.js';
import { SONGS } from './songs.js';

export const SEQUENCER = {

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
  },

  playMenu() { this.playSong('menu', true); },
  playBattle() { this.playSong('battle', true); },
  playJingle(win) { this.playSong(win ? 'victory' : 'defeat', false); },
  // back-compat: default in-match music is the battle theme
  startMusic() { if (!this.ensure()) return; this.musicOn = true; this.playBattle(); },

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
  },

  _scheduleStep(i, t, song, stepDur) {
    const g = this.musicGain;
    if (song.lead) this._trackNote(song.lead, i, t, stepDur, g);
    if (song.bass) this._trackNote(song.bass, i, t, stepDur, g);
    if (song.arp) this._trackNote(song.arp, i, t, stepDur, g);
    if (song.drums) this._drum(song.drums[i % song.drums.length], t, g, song.drumMix || 1);
  },

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
  },

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
  },

  _stopScheduler() {
    this.playing = false;
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  },

  stopMusic() { this._stopScheduler(); },

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
  },
};
