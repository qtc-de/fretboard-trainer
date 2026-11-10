export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };
const SHARP_TO_ENHARMONIC = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };

// A trailing (optionally negative) integer pins the note to one specific
// octave (e.g. "E2" = low E on a guitar); without it the note is a pitch
// class and matches every octave.
const NOTE_RE = /^([A-Ga-g])([#b♯♭]?)(-?\d+)?$/;

/**
 * Parses a note spec like "C#", "Db", "E2" into { name, pc, octave } where
 * `name` is always the sharp spelling, `pc` the pitch class (0-11) and
 * `octave` null unless the spec pinned one. Returns null when invalid.
 */
export function parseNote(raw) {
  const m = NOTE_RE.exec(String(raw).trim());
  if (!m) return null;
  const [, letter, accidental, octave] = m;
  const acc = accidental === '♯' ? '#' : accidental === '♭' ? 'b' : accidental;
  const spelled = letter.toUpperCase() + acc;
  const name = FLAT_TO_SHARP[spelled] || spelled;
  const pc = NOTE_NAMES.indexOf(name);
  if (pc === -1) return null;
  return { name, pc, octave: octave != null ? Number(octave) : null };
}

export function pcName(pc) {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

/** "C#/Db" style label for keypads, plain "C" for naturals. */
export function enharmonicLabel(pc) {
  const name = pcName(pc);
  return SHARP_TO_ENHARMONIC[name] ? `${name}/${SHARP_TO_ENHARMONIC[name]}` : name;
}

export function midiToNote(midi) {
  return { name: pcName(midi), pc: ((midi % 12) + 12) % 12, octave: Math.floor(midi / 12) - 1 };
}

/** Whether a MIDI note satisfies a parsed note spec (octave only checked if pinned). */
export function noteMatches(spec, midi) {
  const { pc, octave } = midiToNote(midi);
  return spec.pc === pc && (spec.octave == null || spec.octave === octave);
}

/**
 * Scale / arpeggio formulas as semitone intervals from the root.
 * `nps` = default notes per string used to build playable shapes; only
 * set where there is an established convention (2 for pentatonics, 3 for
 * seven-note scales). Others can still be used in `find` exercises, or as
 * shapes when the exercise sets `notes_per_string` itself.
 */
export const SCALES = {
  'major': { label: 'major', intervals: [0, 2, 4, 5, 7, 9, 11], nps: 3 },
  'minor': { label: 'natural minor', intervals: [0, 2, 3, 5, 7, 8, 10], nps: 3 },
  'major-pentatonic': { label: 'major pentatonic', intervals: [0, 2, 4, 7, 9], nps: 2 },
  'minor-pentatonic': { label: 'minor pentatonic', intervals: [0, 3, 5, 7, 10], nps: 2 },
  'blues': { label: 'blues', intervals: [0, 3, 5, 6, 7, 10], nps: null },
  'harmonic-minor': { label: 'harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], nps: 3 },
  'melodic-minor': { label: 'melodic minor', intervals: [0, 2, 3, 5, 7, 9, 11], nps: 3 },
  'dorian': { label: 'dorian', intervals: [0, 2, 3, 5, 7, 9, 10], nps: 3 },
  'phrygian': { label: 'phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], nps: 3 },
  'lydian': { label: 'lydian', intervals: [0, 2, 4, 6, 7, 9, 11], nps: 3 },
  'mixolydian': { label: 'mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], nps: 3 },
  'locrian': { label: 'locrian', intervals: [0, 1, 3, 5, 6, 8, 10], nps: 3 },
  'major-triad': { label: 'major triad', intervals: [0, 4, 7], nps: null },
  'minor-triad': { label: 'minor triad', intervals: [0, 3, 7], nps: null },
  'diminished-triad': { label: 'diminished triad', intervals: [0, 3, 6], nps: null },
  'augmented-triad': { label: 'augmented triad', intervals: [0, 4, 8], nps: null },
  'major-7': { label: 'major 7', intervals: [0, 4, 7, 11], nps: null },
  'minor-7': { label: 'minor 7', intervals: [0, 3, 7, 10], nps: null },
  'dominant-7': { label: 'dominant 7', intervals: [0, 4, 7, 10], nps: null },
  'minor-7b5': { label: 'half-diminished', intervals: [0, 3, 6, 10], nps: null },
};

const SCALE_ALIASES = {
  ionian: 'major',
  aeolian: 'minor',
  'natural-minor': 'minor',
  pentatonic: 'minor-pentatonic',
  'major-arpeggio': 'major-triad',
  'minor-arpeggio': 'minor-triad',
  'dominant-7-arpeggio': 'dominant-7',
};

/** Resolves a scale id (case/space insensitive, with aliases) to its key in SCALES, or null. */
export function resolveScale(raw) {
  const key = String(raw).trim().toLowerCase().replace(/[\s_]+/g, '-');
  const resolved = SCALE_ALIASES[key] || key;
  return SCALES[resolved] ? resolved : null;
}

/** Pitch classes of `scaleId` built on `rootPc`, in scale-degree order. */
export function scalePcs(rootPc, scaleId) {
  return SCALES[scaleId].intervals.map((i) => (rootPc + i) % 12);
}

/**
 * Every placement of shape number `shapeNum` (1-based) of a scale on the
 * neck. Shape N starts on the scale's N-th degree on the lowest string and
 * walks the scale upward, `nps` notes per string — the standard way the
 * five pentatonic boxes (2 notes per string) and the seven 3-notes-per-
 * string diatonic shapes are taught. Because the walk follows pitch rather
 * than a fixed fret window, irregular tunings like the guitar's major
 * third between G and B come out right automatically.
 *
 * The same shape repeats 12 frets higher, so every octave transposition
 * that fits inside 0..fretCount is returned (as arrays of
 * { stringIndex, fret, midi }). An empty array means it doesn't fit.
 */
export function shapePlacements(tuning, fretCount, rootPc, scaleId, shapeNum, nps) {
  const pcs = scalePcs(rootPc, scaleId);
  const pcSet = new Set(pcs);
  const startPc = pcs[(shapeNum - 1) % pcs.length];
  const lowest = tuning[0];
  let midi = lowest + ((startPc - lowest + 120) % 12);

  const needed = tuning.length * nps;
  const pitches = [];
  while (pitches.length < needed) {
    if (pcSet.has(midi % 12)) pitches.push(midi);
    midi++;
  }

  let base = pitches.map((m, i) => {
    const stringIndex = Math.floor(i / nps);
    return { stringIndex, fret: m - tuning[stringIndex], midi: m };
  });
  // Upper strings can land below the nut (e.g. an open-position shape
  // whose top notes would need negative frets) — lift the whole shape an
  // octave so the base placement is always playable.
  while (Math.min(...base.map((p) => p.fret)) < 0) {
    base = base.map((p) => ({ ...p, fret: p.fret + 12, midi: p.midi + 12 }));
  }

  const placements = [];
  for (let shift = 0; ; shift += 12) {
    const shifted = base.map((p) => ({ ...p, fret: p.fret + shift, midi: p.midi + shift }));
    if (Math.max(...shifted.map((p) => p.fret)) > fretCount) break;
    placements.push(shifted);
  }
  return placements;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
