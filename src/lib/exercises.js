import { load as loadYaml } from 'js-yaml';
import { parseNote, resolveScale, SCALES } from './theory.js';
import { INSTRUMENTS } from './instruments.js';

/** Virtual folder name shown for exercise sets imported from disk. */
export const UPLOADED_FOLDER = 'Uploaded Exercises';

const UPLOADED_STORAGE_KEY = 'fretboardtrainer:uploadedExercises';

export const EXERCISE_TYPES = ['find', 'shape', 'sequence', 'name'];

function normalizeNote(raw, context) {
  const parsed = parseNote(raw);
  if (!parsed) throw new Error(`${context}: invalid note "${raw}"`);
  return parsed;
}

function parsePositiveInt(value, context, key) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${context}: "${key}" must be a positive integer`);
  }
  return value;
}

function parseBoolean(value, context, key, defaultValue) {
  if (value == null) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`${context}: "${key}" must be true or false`);
  }
  return value;
}

// Accept both camelCase (BassBuddy style, e.g. randomNotes) and snake_case
// spellings for every key, so authors don't have to remember which is which.
function pick(raw, ...keys) {
  for (const key of keys) {
    if (raw[key] != null) return raw[key];
  }
  return null;
}

function parseInstrument(value, context) {
  if (value == null) return null;
  if (!INSTRUMENTS[value]) {
    throw new Error(`${context}: unknown instrument "${value}" (use ${Object.keys(INSTRUMENTS).join(', ')})`);
  }
  return value;
}

/**
 * `fretboard` restricts the relevant part of the neck: an inclusive fret
 * range (`start`/`end`) or explicit `frets` list, optionally narrowed to
 * some `strings` (numbered like players do: 1 = highest string). Strings
 * stay as player numbers here since the instrument (and so the string
 * count) is only known when the exercise is instantiated.
 */
function normalizeFretboard(spec, context) {
  if (spec == null) return null;
  let frets = null;
  if (Array.isArray(spec.frets)) {
    frets = new Set(spec.frets.map(Number).filter((f) => Number.isInteger(f) && f >= 0));
  } else if (spec.start != null || spec.end != null) {
    const start = Number(spec.start ?? 0);
    const end = Number(spec.end ?? 99);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start < 0) {
      throw new Error(`${context}: invalid fretboard start/end`);
    }
    frets = new Set();
    for (let f = start; f <= end; f++) frets.add(f);
  }
  let strings = null;
  if (Array.isArray(spec.strings)) {
    strings = spec.strings.map(Number);
    if (strings.some((s) => !Number.isInteger(s) || s < 1)) {
      throw new Error(`${context}: fretboard "strings" must be string numbers (1 = highest string)`);
    }
  }
  return { frets, strings };
}

const POSITION_RE = /^\s*(\d+)\s*[:/-]\s*(\d+)\s*$/;

/** Positions as "string:fret" strings or { string, fret } objects (string 1 = highest). */
function normalizePositions(list, context) {
  return list.map((entry) => {
    let string;
    let fret;
    if (typeof entry === 'string') {
      const m = POSITION_RE.exec(entry);
      if (!m) throw new Error(`${context}: invalid position "${entry}" (use "string:fret", e.g. "6:5")`);
      string = Number(m[1]);
      fret = Number(m[2]);
    } else if (entry && typeof entry === 'object') {
      string = Number(entry.string);
      fret = Number(entry.fret);
    }
    if (!Number.isInteger(string) || string < 1 || !Number.isInteger(fret) || fret < 0) {
      throw new Error(`${context}: invalid position ${JSON.stringify(entry)}`);
    }
    return { string, fret };
  });
}

function parseRoot(value, context) {
  if (value == null) return null;
  if (String(value).toLowerCase() === 'random') return 'random';
  const note = normalizeNote(value, context);
  return note.pc;
}

function inferType(raw) {
  if (raw.type != null) return raw.type;
  if (raw.shape != null || raw.positions != null) return 'shape';
  if (pick(raw, 'randomPositions', 'random_positions') != null) return 'name';
  return 'find';
}

function parseExercise(raw, i, sourceName) {
  const context = `${sourceName} exercise #${i + 1}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${context}: must be a mapping`);

  const type = inferType(raw);
  if (!EXERCISE_TYPES.includes(type)) {
    throw new Error(`${context}: unknown type "${type}" (use ${EXERCISE_TYPES.join(', ')})`);
  }

  const notes = Array.isArray(raw.notes) ? raw.notes.map((n) => normalizeNote(n, context)) : null;
  const randomNotes = parsePositiveInt(pick(raw, 'randomNotes', 'random_notes'), context, 'randomNotes');
  const randomPositions = parsePositiveInt(pick(raw, 'randomPositions', 'random_positions'), context, 'randomPositions');
  const positions = Array.isArray(raw.positions) ? normalizePositions(raw.positions, context) : null;
  const root = parseRoot(raw.root, context);

  let scale = null;
  if (raw.scale != null) {
    scale = resolveScale(raw.scale);
    if (!scale) throw new Error(`${context}: unknown scale "${raw.scale}" (use ${Object.keys(SCALES).join(', ')})`);
    if (root == null) throw new Error(`${context}: "scale" needs a "root" note (or root: random)`);
  }

  let shape = null;
  if (raw.shape != null) {
    if (String(raw.shape).toLowerCase() === 'random') shape = 'random';
    else shape = parsePositiveInt(raw.shape, context, 'shape');
  }

  const notesPerString = parsePositiveInt(pick(raw, 'notes_per_string', 'notesPerString'), context, 'notes_per_string');

  if (type === 'shape') {
    if (!positions) {
      if (!scale || shape == null) {
        throw new Error(`${context}: a shape needs either "positions" or "root" + "scale" + "shape"`);
      }
      if (!notesPerString && !SCALES[scale].nps) {
        throw new Error(`${context}: scale "${scale}" has no standard shapes — set "notes_per_string"`);
      }
      if (shape !== 'random' && shape > SCALES[scale].intervals.length) {
        throw new Error(`${context}: "${scale}" only has ${SCALES[scale].intervals.length} shapes`);
      }
    }
  } else if (type === 'find' || type === 'sequence') {
    const hasPool = (notes && notes.length) || scale;
    if (!hasPool && !randomNotes) {
      throw new Error(`${context}: needs "notes", "randomNotes" or "root" + "scale"`);
    }
  }

  return {
    type,
    name: raw.name || `Exercise ${i + 1}`,
    description: raw.description || '',
    notes,
    randomNotes,
    root,
    scale,
    shape,
    notesPerString,
    positions,
    randomPositions,
    ordered: parseBoolean(raw.ordered, context, 'ordered', type === 'sequence'),
    successOn: parsePositiveInt(pick(raw, 'success_on', 'successOn'), context, 'success_on'),
    failureOn: parsePositiveInt(pick(raw, 'failure_on', 'failureOn'), context, 'failure_on'),
    timeLimit: parsePositiveInt(pick(raw, 'time_limit', 'timeLimit'), context, 'time_limit'),
    repeat: parsePositiveInt(raw.repeat, context, 'repeat') ?? 1,
    instrument: parseInstrument(raw.instrument, context),
    fretboard: normalizeFretboard(raw.fretboard, context),
  };
}

/**
 * Parses and validates a Fretboard Trainer exercise YAML document. A file
 * is a single practice *set*; see docs/exercises.md for the format.
 *
 * Returns { sourceName, name, ordered, instrument, folder: null, exercises }.
 * Throws with a descriptive message on malformed input.
 */
export function parseExerciseYaml(text, sourceName = 'exercise') {
  let doc;
  try {
    doc = loadYaml(text);
  } catch (err) {
    throw new Error(`${sourceName}: could not parse YAML (${err.message})`);
  }

  const root = doc && doc.fretboardtrainer;
  if (!root || !Array.isArray(root.exercises) || root.exercises.length === 0) {
    throw new Error(`${sourceName}: missing "fretboardtrainer.exercises" list`);
  }

  const exercises = root.exercises.map((raw, i) => parseExercise(raw, i, sourceName));

  return {
    sourceName,
    name: root.name || sourceName,
    description: root.description || '',
    ordered: root.ordered !== false,
    instrument: parseInstrument(root.instrument, sourceName),
    folder: null,
    exercises,
  };
}

/**
 * Fetches manifest.json + every listed file from /exercises (which may
 * live in subfolders) and parses them. Each set's `folder` is its path
 * relative to public/exercises. Files that fail to parse are skipped with
 * a console warning rather than breaking the whole list.
 */
export async function loadBuiltInExerciseSets() {
  // BASE_URL rather than a bare leading slash: GitHub Pages project sites
  // serve the app from a subpath (e.g. /FretboardTrainer/).
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}exercises/manifest.json`);
  if (!res.ok) return [];
  const { files } = await res.json();

  const results = await Promise.all(
    files.map(async (relPath) => {
      try {
        const text = await (await fetch(`${base}exercises/${relPath}`)).text();
        const slash = relPath.lastIndexOf('/');
        const baseName = slash === -1 ? relPath : relPath.slice(slash + 1);
        const folder = slash === -1 ? null : relPath.slice(0, slash);
        return { ...parseExerciseYaml(text, baseName), folder, id: `builtin:${relPath}` };
      } catch (err) {
        console.warn(`Skipping exercise file "${relPath}": ${err.message}`);
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

function readUploadedEntries() {
  try {
    const raw = localStorage.getItem(UPLOADED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeUploadedEntries(entries) {
  try {
    localStorage.setItem(UPLOADED_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — the upload just
    // won't persist across reloads, but still works for this session.
  }
}

/**
 * Persists an uploaded exercise file's raw text to localStorage (upserted
 * by file name). Raw YAML rather than the parsed result since parsed sets
 * contain Sets that don't round-trip through JSON.
 */
export function saveUploadedExercise(fileName, text) {
  const entries = readUploadedEntries().filter((e) => e.fileName !== fileName);
  entries.push({ fileName, text });
  writeUploadedEntries(entries);
}

export function removeUploadedExercise(fileName) {
  writeUploadedEntries(readUploadedEntries().filter((e) => e.fileName !== fileName));
}

/** Loads every exercise set previously saved via saveUploadedExercise. */
export function loadUploadedExerciseSets() {
  const sets = [];
  for (const { fileName, text } of readUploadedEntries()) {
    try {
      sets.push({ ...parseExerciseYaml(text, fileName), folder: UPLOADED_FOLDER, id: `upload:${fileName}` });
    } catch (err) {
      console.warn(`Skipping stored exercise "${fileName}": ${err.message}`);
    }
  }
  return sets;
}
