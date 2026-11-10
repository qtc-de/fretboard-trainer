import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseExerciseYaml } from '../src/lib/exercises.js';
import { buildInstance } from '../src/lib/engine.js';
import { INSTRUMENTS } from '../src/lib/instruments.js';

const neck = { tuning: INSTRUMENTS.guitar.tuning, fretCount: 17 };

function parseOne(yaml) {
  return parseExerciseYaml(`fretboardtrainer:\n  exercises:\n${yaml}`, 'test.yaml').exercises[0];
}

describe('find exercises', () => {
  it('targets every C on the neck', () => {
    const inst = buildInstance(parseOne('    - notes: [C]'), neck);
    // C on frets 0-17 of a guitar: E8, A3, A15, D10, G5, G17, B1, B13, e8
    expect([...inst.targets.keys()].sort()).toEqual(['0-8', '1-15', '1-3', '2-10', '3-17', '3-5', '4-1', '4-13', '5-8'].sort());
  });

  it('respects the fret and string window', () => {
    const def = parseOne('    - notes: [C, D]\n      fretboard: { start: 0, end: 5, strings: [5] }');
    const inst = buildInstance(def, neck);
    expect([...inst.targets.keys()].sort()).toEqual(['1-3', '1-5']);
  });

  it('fills placeholders for random notes', () => {
    const inst = buildInstance(parseOne('    - name: "Find {{note}}"\n      randomNotes: 1'), neck);
    expect(inst.name).toBe(`Find ${inst.notes[0].name}`);
  });

  it('builds scale note targets from root + scale', () => {
    const inst = buildInstance(parseOne('    - root: A\n      scale: minor-pentatonic\n      fretboard: { start: 5, end: 8 }'), neck);
    expect(inst.targets.size).toBe(12);
  });
});

describe('shape exercises', () => {
  it('fills ordinal placeholders', () => {
    const inst = buildInstance(parseOne('    - name: "{{shape_ordinal}} {{root}} {{scale}}"\n      root: A\n      scale: minor-pentatonic\n      shape: 3'), neck);
    expect(inst.name).toBe('3rd A minor pentatonic');
    expect(inst.placements[0].size).toBe(12);
  });

  it('accepts explicit positions and rejects strings beyond the instrument', () => {
    const def = parseOne('    - positions: ["5:3", "4:2", "3:0", "2:1", "1:0"]');
    expect(buildInstance(def, neck).placements[0].size).toBe(5);
    const bassNeck = { tuning: INSTRUMENTS.bass.tuning, fretCount: 15 };
    expect(buildInstance(def, bassNeck).error).toMatch(/string 5/);
  });
});

describe('validation', () => {
  it('rejects unknown scales and missing roots', () => {
    expect(() => parseOne('    - scale: lydian-dominant\n      root: C')).toThrow(/unknown scale/);
    expect(() => parseOne('    - scale: major')).toThrow(/root/);
    expect(() => parseOne('    - shape: 2\n      scale: blues\n      root: A')).toThrow(/notes_per_string/);
  });
});

describe('built-in exercise files', () => {
  const dir = path.resolve(__dirname, '../public/exercises');
  const files = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(name)) files.push(p);
    }
  })(dir);

  it.each(files.map((f) => [path.relative(dir, f), f]))('%s parses and builds on every instrument', (_, file) => {
    const set = parseExerciseYaml(readFileSync(file, 'utf8'), path.basename(file));
    for (const def of set.exercises) {
      const id = def.instrument ?? set.instrument;
      const instruments = id ? [INSTRUMENTS[id]] : Object.values(INSTRUMENTS);
      for (const instrument of instruments) {
        for (let i = 0; i < 5; i++) {
          const inst = buildInstance(def, { tuning: instrument.tuning, fretCount: 17 });
          expect(inst.error, `${def.name} on ${instrument.id}`).toBeNull();
          expect(inst.name).not.toMatch(/\{\{/);
          expect(inst.description).not.toMatch(/\{\{/);
        }
      }
    }
  });
});
