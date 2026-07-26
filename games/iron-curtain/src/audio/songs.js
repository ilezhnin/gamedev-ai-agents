// Song data: each entry is a small pattern — per-track step arrays plus the
// voice config used to render them. 0 = rest. Drums use single-letter tokens
// (k kick, s snare, h hat, o tom/toll). len steps loop (or play once).
// All music is original — the melodies and progressions were written for this
// project. Pure data: no WebAudio here, the sequencer renders it.

export const SONGS = {
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
