<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import Fretboard from './components/Fretboard.vue';
import NoteKeypad from './components/NoteKeypad.vue';
import { useExercises } from './composables/useExercises.js';
import { useSettings } from './composables/useSettings.js';
import { FRET_COUNTS, INSTRUMENTS } from './lib/instruments.js';
import { UPLOADED_FOLDER } from './lib/exercises.js';
import { midiToNote } from './lib/theory.js';

const settings = useSettings();
const exercises = useExercises(settings);

onMounted(() => exercises.loadAll());

function onExerciseFileChange(event) {
  const file = event.target.files[0];
  if (file) exercises.importFile(file);
  event.target.value = '';
  pickerOpen.value = false;
}

// --- layout -----------------------------------------------------------------

// "Auto" stands the neck upright on narrow portrait screens: six strings
// across a phone's width leave every fret a comfortably large tap target,
// where a sideways neck would need tiny cells or constant scrolling.
const portraitQuery = window.matchMedia('(max-width: 700px) and (orientation: portrait)');
const isPortraitPhone = ref(portraitQuery.matches);
const onPortraitChange = (e) => (isPortraitPhone.value = e.matches);
portraitQuery.addEventListener('change', onPortraitChange);
onUnmounted(() => portraitQuery.removeEventListener('change', onPortraitChange));

const orientation = computed(() => {
  if (settings.layout !== 'auto') return settings.layout;
  return isPortraitPhone.value ? 'vertical' : 'horizontal';
});

const settingsOpen = ref(false);
const showAllNotes = ref(false);

// The sticky panel on an upright neck clamps long descriptions to two
// lines (tap to expand) so it doesn't eat half the screen.
const descriptionExpanded = ref(false);
watch(
  () => exercises.instance.value?.def,
  () => (descriptionExpanded.value = false)
);

// --- exercise picker (positioned like BassBuddy's) -------------------------

const pickerOpen = ref(false);
const pickerButtonRef = ref(null);
const pickerPanelRef = ref(null);
const pickerPanelStyle = ref({});

const selectedSetLabel = computed(() => exercises.currentSet.value?.name ?? 'Free Play');

// The panel is position: fixed and clamped to the viewport: centered on the
// button when there's room, shifted inward when that would overflow.
const PICKER_MARGIN = 12;

function positionPickerPanel() {
  const btn = pickerButtonRef.value;
  const panel = pickerPanelRef.value;
  if (!btn || !panel) return;
  const btnRect = btn.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const maxLeft = window.innerWidth - panelRect.width - PICKER_MARGIN;
  const centered = btnRect.left + btnRect.width / 2 - panelRect.width / 2;
  const left = Math.max(PICKER_MARGIN, Math.min(centered, maxLeft));
  const top = btnRect.bottom + 8;
  const maxHeight = window.innerHeight - top - PICKER_MARGIN;
  pickerPanelStyle.value = { left: `${left}px`, top: `${top}px`, maxHeight: `${maxHeight}px` };
}

watch(pickerOpen, (open) => {
  if (open) {
    nextTick(positionPickerPanel);
    window.addEventListener('resize', positionPickerPanel);
  } else {
    window.removeEventListener('resize', positionPickerPanel);
  }
});

onUnmounted(() => window.removeEventListener('resize', positionPickerPanel));

function selectSet(index) {
  exercises.startSet(index);
  pickerOpen.value = false;
  settingsOpen.value = false;
  showAllNotes.value = false;
}

// --- exercise panel -----------------------------------------------------------

const inst = computed(() => exercises.instance.value);
const status = computed(() => exercises.status.value);

const taskText = computed(() => {
  const i = inst.value;
  if (!i || i.error) return '';
  switch (i.kind) {
    case 'find':
      return `Tap every ${i.notes.map((n) => (n.octave != null ? `${n.name}${n.octave}` : n.name)).join(' and ')}`;
    case 'shape':
      return i.ordered ? 'Tap the shape from its lowest to its highest note' : 'Tap every note of the shape';
    case 'sequence':
      return 'Tap the note shown';
    case 'name':
      return 'Which note is highlighted?';
    default:
      return '';
  }
});

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const progressText = computed(() => {
  const p = exercises.progress.value;
  if (!p) return '';
  if (p.total == null) return `${p.done} correct`;
  return `${p.done} / ${p.total}`;
});

const mistakesText = computed(() => {
  const limit = inst.value?.failureOn;
  const n = exercises.mistakeCount.value;
  return limit != null ? `${n} / ${limit} mistakes` : plural(n, 'mistake');
});

const timeText = computed(() => {
  const left = exercises.timeLeft.value;
  return left != null ? `${formatTime(left)} left` : formatTime(exercises.elapsed.value);
});

const summary = computed(() => {
  const s = exercises.stats.value;
  const total = s.solved + s.failed;
  const seconds = Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000);
  return { ...s, total, time: formatTime(seconds) };
});

const showKeypad = computed(() => inst.value && !inst.value.error && inst.value.kind === 'name');

const isUploaded = (set) => set.folder === UPLOADED_FOLDER;

// Free-play readout of the last tapped position.
const tappedNote = computed(() => {
  const t = exercises.lastTapped.value;
  if (!t) return null;
  const { name, octave } = midiToNote(t.midi);
  const instrument = exercises.instrument.value;
  return {
    name,
    octave,
    where: `String ${instrument.tuning.length - t.stringIndex} (${instrument.names[t.stringIndex]}) · ${t.fret === 0 ? 'open' : `fret ${t.fret}`}`,
  };
});

// Keyboard shortcuts on desktop: Enter/N = next once an exercise is done,
// R = restart.
function onKeydown(event) {
  if (event.key === 'Escape') {
    pickerOpen.value = false;
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
  if (!exercises.inExercise.value) return;
  if ((event.key === 'Enter' || event.key === 'n' || event.key === 'N') && status.value !== 'active' && !showKeypad.value) {
    exercises.nextExercise();
  } else if ((event.key === 'r' || event.key === 'R') && !showKeypad.value) {
    exercises.restartExercise();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <main class="app" :class="{ 'has-keypad': showKeypad, vertical: orientation === 'vertical' }">
    <h1>Fretboard Trainer</h1>
    <p class="subtitle">Learn every note on the neck — no instrument needed.</p>

    <div class="controls">
      <div class="exercise-picker">
        <button ref="pickerButtonRef" class="exercise-picker-button" @click="pickerOpen = !pickerOpen">
          <span>{{ selectedSetLabel }}</span>
          <span class="caret">▾</span>
        </button>

        <template v-if="pickerOpen">
          <div class="picker-backdrop" @click="pickerOpen = false" />
          <div ref="pickerPanelRef" class="picker-panel" :style="pickerPanelStyle">
            <button
              class="picker-item picker-item-freeplay"
              :class="{ active: exercises.selectedSetIndex.value == null }"
              @click="selectSet(null)"
            >
              Free Play
            </button>

            <p v-if="exercises.sets.value.length === 0" class="picker-empty">No exercise sets yet.</p>

            <div v-for="group in exercises.groupedSets.value" :key="group.folder ?? '__root'" class="picker-group">
              <div v-if="group.folder" class="picker-group-label">{{ group.folder }}</div>
              <div v-for="item in group.items" :key="item.set.id" class="picker-row">
                <button
                  class="picker-item"
                  :class="{ active: exercises.selectedSetIndex.value === item.index }"
                  @click="selectSet(item.index)"
                >
                  {{ item.set.name }}
                  <span v-if="exercises.completedSetIds.value.has(item.set.id)" class="picker-done" title="Completed">✓</span>
                  <span class="picker-item-count">
                    ({{ item.set.exercises.length }} exercise{{ item.set.exercises.length === 1 ? '' : 's' }})
                  </span>
                </button>
                <button
                  v-if="isUploaded(item.set)"
                  class="picker-remove"
                  :title="`Remove ${item.set.name}`"
                  :aria-label="`Remove ${item.set.name}`"
                  @click="exercises.removeUploaded(item.index)"
                >
                  ✕
                </button>
              </div>
            </div>

            <label class="upload-button picker-upload">
              Import Exercise Set…
              <input type="file" accept=".yaml,.yml" @change="onExerciseFileChange" />
            </label>
          </div>
        </template>
      </div>

      <button
        class="settings-button"
        :class="{ active: settingsOpen }"
        :aria-expanded="settingsOpen"
        aria-label="Settings"
        @click="settingsOpen = !settingsOpen"
      >
        <span aria-hidden="true">⚙</span>
        <span class="settings-label">Settings</span>
      </button>
    </div>

    <section v-if="settingsOpen" class="settings-panel">
      <label class="field">
        <span>Instrument</span>
        <select v-model="settings.instrument">
          <option v-for="instrument in INSTRUMENTS" :key="instrument.id" :value="instrument.id">{{ instrument.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Frets</span>
        <select v-model.number="settings.fretCount">
          <option v-for="count in FRET_COUNTS" :key="count" :value="count">{{ count }}</option>
        </select>
      </label>
      <label class="field">
        <span>Layout</span>
        <select v-model="settings.layout">
          <option value="auto">Auto</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label class="checkbox-toggle">
        <input v-model="settings.showNoteNames" type="checkbox" />
        <span>Show note names</span>
      </label>
      <label class="checkbox-toggle">
        <input v-model="settings.leftHanded" type="checkbox" />
        <span>Left-handed</span>
      </label>
      <label class="checkbox-toggle">
        <input v-model="settings.vibrate" type="checkbox" />
        <span>Vibrate on mistakes</span>
      </label>
      <p
        v-if="exercises.inExercise.value && exercises.instrument.value.id !== settings.instrument"
        class="settings-note"
      >
        This exercise always uses the {{ exercises.instrument.value.label.toLowerCase() }}.
      </p>
    </section>

    <p v-if="exercises.uploadError.value" class="error">{{ exercises.uploadError.value }}</p>

    <!-- Set finished -->
    <section v-if="exercises.setComplete.value" class="exercise-panel">
      <div class="panel-icons">
        <button class="icon-button restart" title="Restart set" aria-label="Restart set" @click="exercises.restartSet()">↻</button>
      </div>
      <p class="exercise-set-progress">Set Complete</p>
      <p class="exercise-name">
        {{ exercises.currentSet.value?.name }}
        <span class="check-icon">✓</span>
      </p>
      <p class="exercise-meta">
        {{ summary.solved }} of {{ summary.total }} solved · {{ plural(summary.mistakes, 'mistake') }} · {{ summary.time }}
      </p>
      <div class="panel-actions">
        <button class="action-button" @click="exercises.restartSet()">Practice again</button>
        <button class="action-button secondary" @click="pickerOpen = true">Choose another set</button>
      </div>
    </section>

    <!-- Running exercise -->
    <section v-else-if="inst" class="exercise-panel" :class="{ sticky: orientation === 'vertical' }">
      <div class="panel-icons">
        <button
          v-if="status === 'active' && !inst.error"
          class="icon-button"
          title="Show answer"
          aria-label="Show answer"
          @click="exercises.giveUp()"
        >
          👁
        </button>
        <button class="icon-button restart" title="Restart exercise" aria-label="Restart exercise" @click="exercises.restartExercise()">
          ↻
        </button>
      </div>
      <p class="exercise-set-progress">
        Exercise {{ exercises.exerciseNumber.value }} of {{ exercises.exerciseCount.value }}
        <span v-if="exercises.currentSet.value">— {{ exercises.currentSet.value.name }}</span>
      </p>
      <p class="exercise-name">
        {{ inst.name }}
        <span v-if="status !== 'active'" class="check-icon" :class="{ 'fail-icon': status === 'failure' }">
          {{ status === 'failure' ? '✗' : '✓' }}
        </span>
      </p>
      <p
        v-if="inst.description"
        class="exercise-description"
        :class="{ clamped: orientation === 'vertical' && !descriptionExpanded }"
        @click="descriptionExpanded = !descriptionExpanded"
      >
        {{ inst.description }}
      </p>

      <p v-if="inst.error" class="error">{{ inst.error }}</p>
      <template v-else>
        <p v-if="exercises.currentStep.value && status === 'active'" class="exercise-target">
          Tap: <strong>{{ exercises.currentStep.value.label }}</strong>
        </p>
        <p class="exercise-meta">
          <span class="task-text">{{ taskText }}<br /></span>
          <span class="meta-chip">{{ progressText }}</span>
          <span class="meta-chip" :class="{ bad: exercises.mistakeCount.value > 0 }">{{ mistakesText }}</span>
          <span class="meta-chip" :class="{ bad: exercises.timeLeft.value != null && exercises.timeLeft.value <= 10 }">
            {{ timeText }}
          </span>
        </p>
      </template>

      <div v-if="status === 'failure' || inst.error" class="panel-actions">
        <button class="action-button secondary" @click="exercises.restartExercise()">Try again</button>
        <button class="action-button" @click="exercises.nextExercise()">
          {{ exercises.exerciseNumber.value === exercises.exerciseCount.value ? 'Finish' : 'Next ›' }}
        </button>
      </div>
    </section>

    <!-- Free play -->
    <section v-else class="exercise-panel free-panel" :class="{ sticky: orientation === 'vertical' }">
      <div class="free-readout">
        <div class="note-display">
          <span class="note-name">{{ tappedNote ? tappedNote.name : '–' }}</span>
          <span class="note-octave">{{ tappedNote ? tappedNote.octave : '' }}</span>
        </div>
        <div class="free-text">
          <p class="exercise-name">Free Play</p>
          <p class="exercise-meta">{{ tappedNote ? tappedNote.where : 'Tap any position to see its note.' }}</p>
        </div>
      </div>
      <div class="free-controls">
        <label class="checkbox-toggle">
          <input v-model="showAllNotes" type="checkbox" />
          <span>Show all notes</span>
        </label>
        <button class="action-button secondary small" :disabled="exercises.freeMarks.value.size === 0" @click="exercises.clearFreeMarks()">
          Clear marks
        </button>
      </div>
    </section>

    <Fretboard
      :instrument="exercises.instrument.value"
      :fret-count="settings.fretCount"
      :orientation="orientation"
      :left-handed="settings.leftHanded"
      :window="inst && !inst.error ? inst.window : null"
      :interactive="!showKeypad && (!inst || status === 'active')"
      :found="exercises.found.value"
      :root-pc="inst?.rootPc ?? null"
      :markers="exercises.markers.value"
      :revealed="exercises.revealed.value"
      :prompt="exercises.promptPosition.value"
      :free-marks="exercises.inExercise.value ? undefined : exercises.freeMarks.value"
      :show-note-names="settings.showNoteNames"
      :show-all-notes="!exercises.inExercise.value && showAllNotes"
      @tap="exercises.handleTap"
    />

    <div v-if="showKeypad" class="keypad-dock">
      <NoteKeypad
        :disabled="status !== 'active'"
        :wrong="exercises.wrongAnswer.value"
        @answer="exercises.handleNameAnswer"
      />
    </div>
  </main>
</template>

<style scoped>
.app {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
  text-align: center;
  font-family: system-ui, sans-serif;
  color: #eee8dc;
}

.app.has-keypad {
  /* Leave room so the fixed keypad never covers the end of the neck. */
  padding-bottom: calc(9rem + env(safe-area-inset-bottom));
}

h1 {
  margin: 0 0 0.25rem;
  letter-spacing: 0.05em;
}

.subtitle {
  color: #a89f8f;
  margin-top: 0;
  margin-bottom: 1rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.exercise-picker {
  position: relative;
}

.exercise-picker-button,
.settings-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  padding: 0.6rem 1rem;
  min-height: 2.75rem;
  border-radius: 6px;
  border: 1px solid #8a7554;
  background: #2a1e12;
  color: #eee8dc;
  cursor: pointer;
}

.settings-button {
  color: #f0d9a8;
}

.settings-button.active {
  background: #3b2a1a;
  border-color: #f0d9a8;
}

.exercise-picker-button .caret {
  font-size: 0.65rem;
  color: #a89f8f;
}

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.picker-panel {
  position: fixed;
  z-index: 21;
  width: min(calc(100vw - 24px), 24rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.5rem;
  border-radius: 10px;
  background: #2a1e12;
  border: 1px solid #4a3722;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  text-align: left;
}

/* Wide screens: folders side by side as grid columns (grid, not
   multi-column, so overflow scrolls vertically instead of sideways). */
@media (min-width: 640px) {
  .picker-panel {
    width: min(92vw, 64rem);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    align-content: start;
    column-gap: 1rem;
  }

  .picker-item-freeplay,
  .picker-empty,
  .picker-upload {
    grid-column: 1 / -1;
  }
}

.picker-group {
  margin-bottom: 0.5rem;
}

.picker-group-label {
  padding: 0.5rem 0.6rem 0.15rem;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a7554;
}

.picker-row {
  display: flex;
  align-items: stretch;
  gap: 0.25rem;
}

.picker-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.6rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #eee8dc;
  font-size: 0.95rem;
  cursor: pointer;
}

.picker-item:hover {
  background: #3b2a1a;
}

.picker-item.active {
  background: #ff5a3c;
  color: #1a1006;
}

.picker-item-count {
  color: #a89f8f;
  font-size: 0.8rem;
}

.picker-item.active .picker-item-count {
  color: #1a1006;
  opacity: 0.75;
}

.picker-done {
  color: #4caf50;
  font-weight: 700;
}

.picker-item.active .picker-done {
  color: #12250f;
}

.picker-remove {
  flex-shrink: 0;
  width: 2.5rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #a89f8f;
  cursor: pointer;
}

.picker-remove:hover {
  background: #3b2a1a;
  color: #ff8a70;
}

.picker-empty {
  margin: 0;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  color: #a89f8f;
}

.upload-button {
  position: relative;
  display: block;
  font-size: 0.9rem;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  border: 1px dashed #8a7554;
  background: transparent;
  color: #f0d9a8;
  text-align: center;
  cursor: pointer;
}

.picker-upload {
  margin-top: 0.25rem;
}

.upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.settings-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem 1.25rem;
  max-width: 40rem;
  margin: 0.75rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #2a1e12;
  border: 1px solid #4a3722;
}

.settings-note {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.8rem;
  color: #a89f8f;
}

.field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #a89f8f;
}

.field select {
  font-size: 0.95rem;
  padding: 0.45rem 0.6rem;
  min-height: 2.5rem;
  border-radius: 6px;
  border: 1px solid #8a7554;
  background: #1a1006;
  color: #eee8dc;
}

.checkbox-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.5rem;
  font-size: 0.9rem;
  color: #a89f8f;
  cursor: pointer;
}

.checkbox-toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #ff5a3c;
  cursor: pointer;
}

.exercise-panel {
  position: relative;
  max-width: 34rem;
  min-height: 7rem;
  margin: 0.75rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #2a1e12;
  border: 1px solid #4a3722;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35rem;
}

/* Upright neck on a phone is taller than the screen — keep the task in
   view while scrolling along it. */
.exercise-panel.sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
}

/* Keep centered text clear of the corner icon buttons. */
.exercise-panel > p {
  padding: 0 4.5rem;
  margin: 0;
}

.exercise-set-progress {
  font-size: 0.75rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #8a7554;
}

.exercise-name {
  margin: 0;
  font-weight: 700;
  color: #f0d9a8;
}

.exercise-description {
  color: #eee8dc;
  font-size: 0.95rem;
}

.exercise-description.clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  cursor: pointer;
}

.exercise-target {
  font-size: 1.1rem;
  color: #eee8dc;
}

.exercise-target strong {
  display: inline-block;
  min-width: 2.5ch;
  padding: 0.05rem 0.5rem;
  border-radius: 6px;
  background: #ff5a3c;
  color: #1a1006;
  font-size: 1.5rem;
}

.exercise-meta {
  margin: 0;
  font-size: 0.85rem;
  color: #a89f8f;
  line-height: 1.8;
}

.meta-chip {
  display: inline-block;
  margin: 0 0.15rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: #1a1006;
  color: #cbb896;
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
}

.meta-chip.bad {
  color: #ff8a70;
}

.panel-icons {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.4rem;
}

.icon-button {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  line-height: 1;
  border-radius: 50%;
  border: 1px solid #8a7554;
  background: transparent;
  color: #f0d9a8;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}

.icon-button:hover {
  background: #f0d9a8;
  color: #1a1006;
}

.icon-button.restart:hover {
  transform: rotate(-40deg);
}

.check-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: #4caf50;
  color: #12250f;
  font-size: 0.7rem;
  font-weight: 700;
  vertical-align: middle;
}

.check-icon.fail-icon {
  background: #e05252;
  color: #2a0a0a;
}

.panel-actions {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.action-button {
  font-size: 0.95rem;
  padding: 0.55rem 1.25rem;
  min-height: 2.75rem;
  border-radius: 999px;
  border: 2px solid #ff5a3c;
  background: #ff5a3c;
  color: #1a1006;
  font-weight: 600;
  cursor: pointer;
}

.action-button.secondary {
  background: transparent;
  border-color: #f0d9a8;
  color: #f0d9a8;
}

.action-button.small {
  padding: 0.3rem 0.9rem;
  min-height: 2.25rem;
  font-size: 0.85rem;
}

.action-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.error {
  color: #ff8a70;
}

.free-readout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.free-text {
  text-align: left;
}

.free-text p {
  margin: 0;
}

.note-display {
  min-width: 4.5rem;
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
}

.note-octave {
  font-size: 1.4rem;
  vertical-align: super;
  color: #a89f8f;
}

.free-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.25rem 1rem;
}

/* Note-name keypad: docked to the bottom of the screen so it stays under
   the thumb while the neck scrolls behind it. */
.keypad-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 15;
  padding: 0.6rem 0.75rem calc(0.6rem + env(safe-area-inset-bottom));
  background: rgba(26, 16, 6, 0.94);
  border-top: 1px solid #4a3722;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
}

/* Phones: tighter header so the neck starts higher up. */
@media (max-width: 480px) {
  .app {
    padding: 0.75rem 0.75rem 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
  }

  .subtitle {
    font-size: 0.85rem;
    margin-bottom: 0.6rem;
  }

  .exercise-panel {
    min-height: 0;
    padding: 0.6rem 0.75rem;
  }

  .exercise-panel > p {
    padding: 0 4.75rem 0 0;
    text-align: left;
  }

  .exercise-panel > .exercise-meta,
  .exercise-panel > .exercise-target,
  .exercise-panel > .exercise-description,
  .exercise-panel > .error {
    padding-right: 0;
  }

  .note-display {
    font-size: 2.5rem;
    min-width: 3.5rem;
  }

  .controls {
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .exercise-picker {
    min-width: 0;
    flex: 1;
  }

  .exercise-picker-button {
    width: 100%;
    justify-content: space-between;
  }

  .exercise-picker-button > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-label {
    display: none;
  }
}

/* Landscape phones: every pixel of height goes to the neck — no title,
   one-line description, compact panel. */
@media (max-height: 480px) and (orientation: landscape) {
  .subtitle,
  h1 {
    display: none;
  }

  .app {
    padding-top: 0.5rem;
  }

  .exercise-panel {
    min-height: 0;
    padding: 0.4rem 0.75rem;
    gap: 0.15rem;
  }

  .exercise-description {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    overflow: hidden;
  }

  .exercise-meta {
    line-height: 1.5;
  }

  .exercise-set-progress,
  .task-text {
    display: none;
  }

  .note-display {
    font-size: 2rem;
  }

  .exercise-picker-button,
  .settings-button {
    min-height: 2.25rem;
    padding: 0.35rem 0.8rem;
  }
}
</style>
