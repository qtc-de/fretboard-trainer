/**
 * Supported instruments in standard tuning. `tuning` lists the open-string
 * MIDI notes from the lowest (thickest) string to the highest — internally
 * string index 0 is always the lowest string. Exercise files use the usual
 * player's numbering instead (string 1 = highest), see exercises.js.
 */
export const INSTRUMENTS = {
  guitar: { id: 'guitar', label: 'Guitar (6-string)', tuning: [40, 45, 50, 55, 59, 64], names: ['E', 'A', 'D', 'G', 'B', 'e'] },
  bass: { id: 'bass', label: 'Bass (4-string)', tuning: [28, 33, 38, 43], names: ['E', 'A', 'D', 'G'] },
  bass5: { id: 'bass5', label: 'Bass (5-string)', tuning: [23, 28, 33, 38, 43], names: ['B', 'E', 'A', 'D', 'G'] },
  guitar7: { id: 'guitar7', label: 'Guitar (7-string)', tuning: [35, 40, 45, 50, 55, 59, 64], names: ['B', 'E', 'A', 'D', 'G', 'B', 'e'] },
};

export const DEFAULT_INSTRUMENT = 'guitar';

export const FRET_COUNTS = [12, 15, 17, 19, 21, 24];
export const DEFAULT_FRET_COUNT = 17;

/** Frets that carry an inlay dot; 12 and 24 get a double dot. */
export const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DOUBLE_INLAY_FRETS = [12, 24];

export function resolveInstrument(id) {
  return INSTRUMENTS[id] || INSTRUMENTS[DEFAULT_INSTRUMENT];
}

export function posKey(stringIndex, fret) {
  return `${stringIndex}-${fret}`;
}
