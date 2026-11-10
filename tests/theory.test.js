import { describe, expect, it } from 'vitest';
import { parseNote, shapePlacements, SCALES } from '../src/lib/theory.js';
import { INSTRUMENTS } from '../src/lib/instruments.js';

const guitar = INSTRUMENTS.guitar.tuning;
const bass = INSTRUMENTS.bass.tuning;

// Frets per string, lowest string first, of the first placement.
function fretsByString(placement, strings) {
  return Array.from({ length: strings }, (_, s) => placement.filter((p) => p.stringIndex === s).map((p) => p.fret));
}

describe('parseNote', () => {
  it('normalizes flats to sharps and keeps octaves', () => {
    expect(parseNote('Db')).toMatchObject({ name: 'C#', pc: 1, octave: null });
    expect(parseNote('e2')).toMatchObject({ name: 'E', pc: 4, octave: 2 });
    expect(parseNote('B♭')).toMatchObject({ name: 'A#', pc: 10 });
    expect(parseNote('H')).toBeNull();
  });
});

describe('shapePlacements', () => {
  it('builds the five A minor pentatonic boxes on guitar', () => {
    const shape = (n) => fretsByString(shapePlacements(guitar, 17, 9, 'minor-pentatonic', n, 2)[0], 6);
    expect(shape(1)).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
    expect(shape(2)).toEqual([[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
    expect(shape(3)).toEqual([[10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12]]);
    expect(shape(4)).toEqual([[0, 3], [0, 3], [0, 2], [0, 2], [1, 3], [0, 3]]);
    expect(shape(5)).toEqual([[3, 5], [3, 5], [2, 5], [2, 5], [3, 5], [3, 5]]);
  });

  it('returns every octave placement that fits', () => {
    const placements = shapePlacements(guitar, 17, 9, 'minor-pentatonic', 4, 2);
    expect(placements).toHaveLength(2);
    expect(Math.min(...placements[1].map((p) => p.fret))).toBe(12);
  });

  it('builds 3-notes-per-string major shapes', () => {
    const [shape1] = shapePlacements(guitar, 17, 7, 'major', 1, 3);
    expect(fretsByString(shape1, 6)).toEqual([[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
  });

  it('works on bass', () => {
    const [shape1] = shapePlacements(bass, 15, 9, 'minor-pentatonic', 1, 2);
    expect(fretsByString(shape1, 4)).toEqual([[5, 8], [5, 7], [5, 7], [5, 7]]);
  });

  it('fits every pentatonic and 3NPS shape in every key on a 17-fret guitar', () => {
    for (const scale of ['minor-pentatonic', 'major-pentatonic', 'major', 'minor', 'dorian']) {
      const { intervals, nps } = SCALES[scale];
      for (let root = 0; root < 12; root++) {
        for (let shape = 1; shape <= intervals.length; shape++) {
          const placements = shapePlacements(guitar, 17, root, scale, shape, nps);
          expect(placements.length, `${scale} root ${root} shape ${shape}`).toBeGreaterThan(0);
          for (const p of placements[0]) expect(p.fret).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
