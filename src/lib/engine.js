import { NOTE_NAMES, SCALES, noteMatches, ordinal, pcName, scalePcs, shapePlacements } from './theory.js';
import { posKey } from './instruments.js';

const CHROMATIC = NOTE_NAMES.map((name, pc) => ({ name, pc, octave: null }));

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Draws `count` items from `pool`, avoiding back-to-back repeats where possible. */
function drawWithoutRepeats(pool, count, same = (a, b) => a === b) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let choice = randomItem(pool);
    for (let attempt = 0; pool.length > 1 && out.length && same(choice, out[out.length - 1]) && attempt < 20; attempt++) {
      choice = randomItem(pool);
    }
    out.push(choice);
  }
  return out;
}

function specLabel(spec) {
  return spec.octave != null ? `${spec.name}${spec.octave}` : spec.name;
}

function sameSpec(a, b) {
  return a.pc === b.pc && a.octave === b.octave;
}

/** Every (string, fret) position on the neck, lowest string first. */
function allPositions(tuning, fretCount) {
  const out = [];
  tuning.forEach((open, stringIndex) => {
    for (let fret = 0; fret <= fretCount; fret++) out.push({ stringIndex, fret, midi: open + fret });
  });
  return out;
}

/**
 * Resolves an exercise's `fretboard` spec against a concrete instrument:
 * returns { frets: Set|null, strings: Set|null } with strings converted
 * from player numbering (1 = highest) to internal indices (0 = lowest).
 */
function resolveWindow(fretboard, stringCount) {
  if (!fretboard) return { frets: null, strings: null };
  const strings = fretboard.strings
    ? new Set(fretboard.strings.filter((n) => n <= stringCount).map((n) => stringCount - n))
    : null;
  return { frets: fretboard.frets, strings };
}

export function inWindow(win, stringIndex, fret) {
  return (win.frets == null || win.frets.has(fret)) && (win.strings == null || win.strings.has(stringIndex));
}

function fillPlaceholders(text, vars) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match));
}

/**
 * Turns a parsed exercise definition into one concrete, playable attempt
 * for the given instrument/neck: draws any random notes/root/shape/
 * positions, works out the exact target positions, and fills in the
 * {{placeholders}} in name/description. Called afresh on every start and
 * restart, so random exercises vary each time.
 *
 * Returned object (fields depend on `kind`):
 *   kind        'find' | 'shape' | 'sequence' | 'name'
 *   window      relevant neck area (see inWindow)
 *   rootPc      pitch class to mark as root on found dots, or null
 *   targets     find: Map<key, pos> of every position to tap
 *   placements  shape: array of Map<key, pos> (same shape in each octave)
 *   order       shape (ordered): keys per placement in required order
 *   steps       sequence: [{ spec, label }]; name: [pos]
 *   endless     sequence/name in scoring mode: steps are drawn on demand via draw()
 *   error       set instead of the above when the exercise can't be built
 */
export function buildInstance(def, { tuning, fretCount }) {
  const win = resolveWindow(def.fretboard, tuning.length);
  const neck = allPositions(tuning, fretCount);
  const windowPositions = neck.filter((p) => inWindow(win, p.stringIndex, p.fret));

  const rootPc = def.root === 'random' ? Math.floor(Math.random() * 12) : def.root;
  const scaleInfo = def.scale ? SCALES[def.scale] : null;
  const vars = {
    root: rootPc != null ? pcName(rootPc) : null,
    scale: scaleInfo ? scaleInfo.label : null,
  };

  const base = {
    kind: def.type,
    def,
    window: win,
    rootPc: rootPc ?? null,
    successOn: def.successOn,
    failureOn: def.failureOn,
    timeLimit: def.timeLimit,
    ordered: def.ordered,
    error: null,
  };

  const finish = (instance) => ({
    ...instance,
    name: fillPlaceholders(def.name, vars),
    description: fillPlaceholders(def.description, vars),
  });
  const fail = (message) => finish({ ...base, error: message });

  // The note pool for find/sequence: explicit notes win, else the scale's
  // notes, else (randomNotes on its own) the full chromatic scale.
  let pool = def.notes && def.notes.length ? def.notes : null;
  if (!pool && rootPc != null && def.scale) {
    pool = scalePcs(rootPc, def.scale).map((pc) => ({ name: pcName(pc), pc, octave: null }));
  }
  if (!pool) pool = CHROMATIC;

  const positionsFor = (spec) => windowPositions.filter((p) => noteMatches(spec, p.midi));

  if (def.type === 'find') {
    const reachable = pool.filter((spec) => positionsFor(spec).length > 0);
    if (!reachable.length) return fail('None of these notes are on the selected part of the neck.');
    const chosen = def.randomNotes ? shuffle(reachable).slice(0, def.randomNotes) : reachable;
    vars.note = specLabel(chosen[0]);
    vars.notes = chosen.map(specLabel).join(', ');
    const targets = new Map();
    for (const spec of chosen) {
      for (const p of positionsFor(spec)) targets.set(posKey(p.stringIndex, p.fret), p);
    }
    return finish({ ...base, notes: chosen, targets });
  }

  if (def.type === 'shape') {
    let placements;
    if (def.positions) {
      const positions = [];
      for (const { string, fret } of def.positions) {
        if (string > tuning.length) {
          return fail(`This shape uses string ${string}, but the instrument only has ${tuning.length} strings.`);
        }
        if (fret > fretCount) return fail(`This shape needs fret ${fret} — raise the fret count in the settings.`);
        const stringIndex = tuning.length - string;
        positions.push({ stringIndex, fret, midi: tuning[stringIndex] + fret });
      }
      placements = [positions];
    } else {
      const shapeCount = scaleInfo.intervals.length;
      const shapeNum = def.shape === 'random' ? 1 + Math.floor(Math.random() * shapeCount) : def.shape;
      vars.shape = shapeNum;
      vars.shape_ordinal = ordinal(shapeNum);
      const nps = def.notesPerString || scaleInfo.nps;
      placements = shapePlacements(tuning, fretCount, rootPc, def.scale, shapeNum, nps);
      if (!placements.length) {
        return fail(`This shape doesn't fit within ${fretCount} frets — raise the fret count in the settings.`);
      }
      // Lowest pitch first: that's how a shape is practised in order.
      placements = placements.map((pl) => [...pl].sort((a, b) => a.midi - b.midi || a.stringIndex - b.stringIndex));
    }
    return finish({
      ...base,
      placements: placements.map((pl) => new Map(pl.map((p) => [posKey(p.stringIndex, p.fret), p]))),
      order: placements.map((pl) => pl.map((p) => posKey(p.stringIndex, p.fret))),
    });
  }

  if (def.type === 'sequence') {
    const reachable = pool.filter((spec) => positionsFor(spec).length > 0);
    if (!reachable.length) return fail('None of these notes are on the selected part of the neck.');
    const toStep = (spec) => ({ spec, label: specLabel(spec), positions: positionsFor(spec) });
    const endless = def.successOn != null || def.failureOn != null;
    let steps;
    if (endless) {
      steps = drawWithoutRepeats(reachable, 1, sameSpec).map(toStep);
    } else if (def.randomNotes) {
      steps = drawWithoutRepeats(reachable, def.randomNotes, sameSpec).map(toStep);
    } else {
      const missing = pool.find((spec) => positionsFor(spec).length === 0);
      if (missing) return fail(`${specLabel(missing)} isn't on the selected part of the neck.`);
      steps = pool.map(toStep);
    }
    vars.note = steps[0].label;
    vars.notes = steps.map((s) => s.label).join(', ');
    const draw = (prev) => {
      const options = prev && reachable.length > 1 ? reachable.filter((s) => !sameSpec(s, prev.spec)) : reachable;
      return toStep(randomItem(options));
    };
    return finish({ ...base, steps, endless, draw });
  }

  // name: identify the note at highlighted positions.
  let candidates = windowPositions;
  if (def.notes && def.notes.length) {
    candidates = candidates.filter((p) => def.notes.some((spec) => noteMatches(spec, p.midi)));
  } else if (rootPc != null && def.scale) {
    const pcs = new Set(scalePcs(rootPc, def.scale));
    candidates = candidates.filter((p) => pcs.has(p.midi % 12));
  }
  if (def.positions) {
    candidates = [];
    for (const { string, fret } of def.positions) {
      if (string > tuning.length || fret > fretCount) continue;
      const stringIndex = tuning.length - string;
      candidates.push({ stringIndex, fret, midi: tuning[stringIndex] + fret });
    }
  }
  if (!candidates.length) return fail('There are no matching positions on the selected part of the neck.');

  const samePos = (a, b) => a.stringIndex === b.stringIndex && a.fret === b.fret;
  const endless = def.successOn != null || def.failureOn != null;
  let steps;
  if (def.positions && !def.randomPositions && !endless) {
    steps = def.ordered ? candidates : shuffle(candidates);
  } else {
    // Cycle through a shuffled deck so every candidate comes up once before
    // any repeats, instead of independent draws that cluster.
    const count = endless ? 1 : def.randomPositions || 10;
    steps = [];
    let deck = [];
    while (steps.length < count) {
      if (!deck.length) deck = shuffle(candidates);
      const next = deck.pop();
      if (candidates.length > 1 && steps.length && samePos(next, steps[steps.length - 1])) {
        deck.unshift(next);
        continue;
      }
      steps.push(next);
    }
  }
  const draw = (prev) => {
    const options = candidates.length > 1 ? candidates.filter((p) => !prev || !samePos(p, prev)) : candidates;
    return randomItem(options);
  };
  return finish({ ...base, steps, endless, draw });
}
