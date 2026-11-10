import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  loadBuiltInExerciseSets,
  loadUploadedExerciseSets,
  parseExerciseYaml,
  removeUploadedExercise,
  saveUploadedExercise,
  UPLOADED_FOLDER,
} from '../lib/exercises.js';
import { buildInstance, inWindow } from '../lib/engine.js';
import { posKey, resolveInstrument } from '../lib/instruments.js';
import { noteMatches, pcName } from '../lib/theory.js';

const WRONG_MARKER_TTL_MS = 700;
const HIT_MARKER_TTL_MS = 700;
const AUTO_ADVANCE_DELAY_MS = 1200; // time to see "solved" before moving on
const COMPLETED_STORAGE_KEY = 'fretboardtrainer:completedSets';

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function readCompleted() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COMPLETED_STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeCompleted(ids) {
  try {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — completion checkmarks just won't persist.
  }
}

/**
 * Exercise selection, import, and the tap-scoring state machine. Each
 * exercise runs as an *instance* (see engine.js buildInstance) built for
 * the current instrument/fret count; taps on the virtual fretboard (or
 * note-name answers, for "name" exercises) are scored against it.
 */
export function useExercises(settings) {
  const sets = shallowRef([]);
  const selectedSetIndex = ref(null); // null = free play
  const queue = ref([]); // exercise defs in play order (repeats expanded)
  const queuePos = ref(0);
  const setComplete = ref(false);
  const uploadError = ref(null);
  const completedSetIds = ref(readCompleted());

  const instance = shallowRef(null);
  const status = ref('active'); // 'active' | 'success' | 'failure'
  const found = ref(new Set()); // keys of correctly tapped positions (find/shape)
  const placementIndex = ref(null); // shape: which octave placement the player committed to
  const stepIndex = ref(0); // sequence/name: current step
  const steps = shallowRef([]); // sequence/name: steps so far (grows in endless mode)
  const correctCount = ref(0);
  const mistakeCount = ref(0);
  const revealed = ref(new Map()); // key -> pos, shown after failing / giving up
  const markers = ref([]); // transient { id, key, type: 'wrong'|'hit', label }
  const wrongAnswer = ref(null); // { id, pc } — keypad button to flash red
  const elapsed = ref(0); // seconds into the current exercise
  const stats = ref({ solved: 0, failed: 0, mistakes: 0, startedAt: 0, finishedAt: 0 });

  // Free play: tapped positions toggle a marker, as a scratchpad.
  const freeMarks = ref(new Set());
  const lastTapped = ref(null); // { stringIndex, fret, midi }

  let markerId = 0;
  let advanceTimeoutId = null;
  let timerId = null;
  let startedAt = 0;

  const currentSet = computed(() => (selectedSetIndex.value != null ? sets.value[selectedSetIndex.value] : null));
  const currentDef = computed(() => (setComplete.value ? null : queue.value[queuePos.value] ?? null));
  const inExercise = computed(() => currentDef.value != null);

  const instrument = computed(() =>
    resolveInstrument(currentDef.value?.instrument ?? currentSet.value?.instrument ?? settings.instrument)
  );
  const neck = computed(() => ({ tuning: instrument.value.tuning, fretCount: settings.fretCount }));

  // Sets grouped by folder for the picker: root-level first, subfolders
  // alphabetically, "Uploaded Exercises" always last.
  const groupedSets = computed(() => {
    const groups = new Map();
    sets.value.forEach((set, index) => {
      const key = set.folder ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ index, set });
    });
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === b) return 0;
      if (a === null) return -1;
      if (b === null) return 1;
      if (a === UPLOADED_FOLDER) return 1;
      if (b === UPLOADED_FOLDER) return -1;
      return a.localeCompare(b);
    });
    return keys.map((folder) => ({ folder, items: groups.get(folder) }));
  });

  function clearTimers() {
    clearTimeout(advanceTimeoutId);
    advanceTimeoutId = null;
    clearInterval(timerId);
    timerId = null;
  }

  function tick() {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000);
    const limit = instance.value?.timeLimit;
    if (limit != null && status.value === 'active' && elapsed.value >= limit) {
      // Pure "as many as you can" drills (no success target) end well when
      // time runs out; anything with a goal to reach fails instead.
      if (instance.value.endless && instance.value.successOn == null) succeed();
      else fail();
    }
  }

  function startInstance() {
    clearTimers();
    const def = currentDef.value;
    instance.value = def ? buildInstance(def, neck.value) : null;
    status.value = 'active';
    found.value = new Set();
    placementIndex.value = null;
    stepIndex.value = 0;
    steps.value = instance.value?.steps ?? [];
    correctCount.value = 0;
    mistakeCount.value = 0;
    revealed.value = new Map();
    markers.value = [];
    wrongAnswer.value = null;
    elapsed.value = 0;
    if (instance.value && !instance.value.error) {
      startedAt = Date.now();
      timerId = setInterval(tick, 250);
    }
  }

  // Switching instrument or fret count mid-exercise invalidates the
  // computed targets — rebuild the attempt for the new neck.
  watch(neck, (value, old) => {
    if (inExercise.value && (value.fretCount !== old.fretCount || value.tuning !== old.tuning)) startInstance();
    freeMarks.value = new Set();
    lastTapped.value = null;
  });

  function addMarker(key, type, label = '') {
    const id = ++markerId;
    markers.value = [...markers.value, { id, key, type, label }];
    setTimeout(
      () => {
        markers.value = markers.value.filter((m) => m.id !== id);
      },
      type === 'wrong' ? WRONG_MARKER_TTL_MS : HIT_MARKER_TTL_MS
    );
  }

  function vibrate(pattern) {
    if (settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers throw when vibration isn't allowed yet — harmless.
      }
    }
  }

  function succeed() {
    if (status.value !== 'active') return;
    status.value = 'success';
    clearInterval(timerId);
    stats.value = { ...stats.value, solved: stats.value.solved + 1 };
    advanceTimeoutId = setTimeout(nextExercise, AUTO_ADVANCE_DELAY_MS);
  }

  /** Every position the player still had to find — shown after a failure. */
  function missingPositions() {
    const inst = instance.value;
    const out = new Map();
    if (!inst || inst.error) return out;
    if (inst.kind === 'find') {
      for (const [key, p] of inst.targets) if (!found.value.has(key)) out.set(key, p);
    } else if (inst.kind === 'shape') {
      const placement = inst.placements[placementIndex.value ?? 0];
      for (const [key, p] of placement) if (!found.value.has(key)) out.set(key, p);
    } else if (inst.kind === 'sequence') {
      const step = steps.value[stepIndex.value];
      if (step) for (const p of step.positions) out.set(posKey(p.stringIndex, p.fret), p);
    } else if (inst.kind === 'name') {
      const p = steps.value[stepIndex.value];
      if (p) out.set(posKey(p.stringIndex, p.fret), p);
    }
    return out;
  }

  function fail() {
    if (status.value !== 'active') return;
    status.value = 'failure';
    clearInterval(timerId);
    revealed.value = missingPositions();
    stats.value = { ...stats.value, failed: stats.value.failed + 1 };
  }

  function registerMistake() {
    mistakeCount.value++;
    stats.value = { ...stats.value, mistakes: stats.value.mistakes + 1 };
    vibrate(60);
    const limit = instance.value?.failureOn;
    if (limit != null && mistakeCount.value >= limit) fail();
  }

  function advanceStep() {
    const inst = instance.value;
    correctCount.value++;
    if (inst.endless) {
      if (inst.successOn != null && correctCount.value >= inst.successOn) {
        succeed();
        return;
      }
      steps.value = [...steps.value, inst.draw(steps.value[stepIndex.value])];
      stepIndex.value++;
      return;
    }
    stepIndex.value++;
    if (stepIndex.value >= steps.value.length) succeed();
  }

  function handleTap(stringIndex, fret) {
    const midi = neck.value.tuning[stringIndex] + fret;
    const key = posKey(stringIndex, fret);
    lastTapped.value = { stringIndex, fret, midi };

    const inst = instance.value;
    if (!inExercise.value || !inst) {
      const next = new Set(freeMarks.value);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      freeMarks.value = next;
      return;
    }
    if (inst.error || status.value !== 'active' || inst.kind === 'name') return;
    if (!inWindow(inst.window, stringIndex, fret)) return;
    if (found.value.has(key) && inst.kind !== 'sequence') return; // already found — no penalty

    if (inst.kind === 'find') {
      if (inst.targets.has(key)) {
        found.value.add(key);
        correctCount.value++;
        vibrate(15);
        if (found.value.size === inst.targets.size) succeed();
      } else {
        addMarker(key, 'wrong', pcName(midi));
        registerMistake();
      }
      return;
    }

    if (inst.kind === 'shape') {
      const candidates = placementIndex.value != null ? [placementIndex.value] : inst.placements.map((_, i) => i);
      const match = candidates.find((i) =>
        inst.ordered ? inst.order[i][found.value.size] === key : inst.placements[i].has(key)
      );
      if (match != null) {
        placementIndex.value = match;
        found.value.add(key);
        correctCount.value++;
        vibrate(15);
        if (found.value.size === inst.placements[match].size) succeed();
      } else {
        addMarker(key, 'wrong', pcName(midi));
        registerMistake();
      }
      return;
    }

    if (inst.kind === 'sequence') {
      const step = steps.value[stepIndex.value];
      if (step && noteMatches(step.spec, midi)) {
        addMarker(key, 'hit', pcName(midi));
        vibrate(15);
        advanceStep();
      } else {
        addMarker(key, 'wrong', pcName(midi));
        registerMistake();
      }
    }
  }

  /** "name" exercises: the player answers with a pitch class from the keypad. */
  function handleNameAnswer(pc) {
    const inst = instance.value;
    if (!inst || inst.error || inst.kind !== 'name' || status.value !== 'active') return;
    const p = steps.value[stepIndex.value];
    if (!p) return;
    if (p.midi % 12 === pc) {
      addMarker(posKey(p.stringIndex, p.fret), 'hit', pcName(p.midi));
      vibrate(15);
      advanceStep();
    } else {
      wrongAnswer.value = { id: ++markerId, pc };
      registerMistake();
    }
  }

  function giveUp() {
    fail();
  }

  function markSetCompleted() {
    const id = currentSet.value?.id;
    if (!id) return;
    const next = new Set(completedSetIds.value);
    next.add(id);
    completedSetIds.value = next;
    writeCompleted(next);
  }

  function nextExercise() {
    clearTimers();
    if (queuePos.value + 1 >= queue.value.length) {
      setComplete.value = true;
      instance.value = null;
      stats.value = { ...stats.value, finishedAt: Date.now() };
      markSetCompleted();
      return;
    }
    queuePos.value++;
    startInstance();
  }

  function startSet(index) {
    clearTimers();
    selectedSetIndex.value = index;
    setComplete.value = false;
    queuePos.value = 0;
    stats.value = { solved: 0, failed: 0, mistakes: 0, startedAt: Date.now(), finishedAt: 0 };
    const set = index != null ? sets.value[index] : null;
    if (!set) {
      queue.value = [];
      instance.value = null;
      return;
    }
    const expanded = set.exercises.flatMap((def) => Array.from({ length: def.repeat }, () => def));
    queue.value = set.ordered ? expanded : shuffled(expanded);
    startInstance();
  }

  function restartExercise() {
    startInstance();
  }

  function restartSet() {
    startSet(selectedSetIndex.value);
  }

  async function loadAll() {
    const builtIn = await loadBuiltInExerciseSets();
    sets.value = [...builtIn, ...loadUploadedExerciseSets()];
  }

  async function importFile(file) {
    uploadError.value = null;
    try {
      const text = await file.text();
      const parsed = { ...parseExerciseYaml(text, file.name), folder: UPLOADED_FOLDER, id: `upload:${file.name}` };
      saveUploadedExercise(file.name, text);
      const others = sets.value.filter((s) => s.id !== parsed.id);
      sets.value = [...others, parsed];
      startSet(sets.value.length - 1);
    } catch (err) {
      uploadError.value = err.message;
    }
  }

  function removeUploaded(index) {
    const set = sets.value[index];
    if (!set || set.folder !== UPLOADED_FOLDER) return;
    removeUploadedExercise(set.sourceName);
    const wasSelected = selectedSetIndex.value === index;
    const selectedId = currentSet.value?.id;
    sets.value = sets.value.filter((_, i) => i !== index);
    if (wasSelected) startSet(null);
    else if (selectedId) selectedSetIndex.value = sets.value.findIndex((s) => s.id === selectedId);
  }

  function clearFreeMarks() {
    freeMarks.value = new Set();
    lastTapped.value = null;
  }

  onUnmounted(clearTimers);

  // --- derived view state -------------------------------------------------

  /** The prompt position for "name" exercises. */
  const promptPosition = computed(() => {
    const inst = instance.value;
    if (!inst || inst.error || inst.kind !== 'name' || status.value !== 'active') return null;
    return steps.value[stepIndex.value] ?? null;
  });

  /** Current note to tap for "sequence" exercises. */
  const currentStep = computed(() => {
    const inst = instance.value;
    if (!inst || inst.error || inst.kind !== 'sequence') return null;
    return steps.value[stepIndex.value] ?? null;
  });

  const progress = computed(() => {
    const inst = instance.value;
    if (!inst || inst.error) return null;
    if (inst.kind === 'find') return { done: found.value.size, total: inst.targets.size };
    if (inst.kind === 'shape') {
      const total = inst.placements[placementIndex.value ?? 0].size;
      return { done: found.value.size, total };
    }
    if (inst.endless) return { done: correctCount.value, total: inst.successOn };
    return { done: stepIndex.value, total: steps.value.length };
  });

  const timeLeft = computed(() => {
    const limit = instance.value?.timeLimit;
    return limit != null ? Math.max(0, limit - elapsed.value) : null;
  });

  const exerciseNumber = computed(() => queuePos.value + 1);
  const exerciseCount = computed(() => queue.value.length);

  return {
    sets,
    groupedSets,
    selectedSetIndex,
    currentSet,
    completedSetIds,
    setComplete,
    uploadError,
    instrument,
    neck,
    instance,
    inExercise,
    status,
    found,
    revealed,
    markers,
    wrongAnswer,
    promptPosition,
    currentStep,
    progress,
    correctCount,
    mistakeCount,
    elapsed,
    timeLeft,
    stats,
    exerciseNumber,
    exerciseCount,
    freeMarks,
    lastTapped,
    loadAll,
    importFile,
    removeUploaded,
    startSet,
    restartExercise,
    restartSet,
    nextExercise,
    giveUp,
    handleTap,
    handleNameAnswer,
    clearFreeMarks,
  };
}
