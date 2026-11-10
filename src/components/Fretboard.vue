<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, posKey } from '../lib/instruments.js';
import { pcName } from '../lib/theory.js';

const props = defineProps({
  instrument: { type: Object, required: true }, // { tuning, names }
  fretCount: { type: Number, required: true },
  orientation: { type: String, default: 'horizontal' }, // 'horizontal' | 'vertical'
  leftHanded: { type: Boolean, default: false },
  window: { type: Object, default: null }, // { frets: Set|null, strings: Set|null }; null = whole neck
  interactive: { type: Boolean, default: true },
  found: { type: Set, default: () => new Set() }, // keys of correct (green) positions
  rootPc: { type: Number, default: null }, // found dots of this pitch class get a root ring
  markers: { type: Array, default: () => [] }, // transient [{ id, key, type: 'wrong'|'hit', label }]
  revealed: { type: Map, default: () => new Map() }, // missed positions shown after a failure
  prompt: { type: Object, default: null }, // { stringIndex, fret } to highlight with "?"
  freeMarks: { type: Set, default: () => new Set() },
  showNoteNames: { type: Boolean, default: true },
  showAllNotes: { type: Boolean, default: false },
});

const emit = defineEmits(['tap']);

const stringCount = computed(() => props.instrument.tuning.length);
const frets = computed(() => Array.from({ length: props.fretCount + 1 }, (_, i) => i));
const strings = computed(() => props.instrument.tuning.map((open, index) => ({ index, open, name: props.instrument.names[index] })));
const vertical = computed(() => props.orientation === 'vertical');

// Grid placement. Horizontal: highest string on top (like tab), nut on the
// left (right on left-handed). Vertical: nut on top, lowest string on the
// left (right on left-handed) — the way chord charts are drawn, and the
// layout that fits a phone held upright.
function fretTrack(fret) {
  if (vertical.value) return fret + 2;
  return props.leftHanded ? props.fretCount - fret + 1 : fret + 2;
}

function stringTrack(stringIndex) {
  const S = stringCount.value;
  if (vertical.value) return props.leftHanded ? S - stringIndex + 1 : stringIndex + 2;
  return S - stringIndex + 1;
}

const labelFretTrack = computed(() => (!vertical.value && props.leftHanded ? props.fretCount + 2 : 1));

function place(stringTrackValue, fretTrackValue) {
  return vertical.value
    ? { gridRow: fretTrackValue, gridColumn: stringTrackValue }
    : { gridRow: stringTrackValue, gridColumn: fretTrackValue };
}

const gridStyle = computed(() => {
  const S = stringCount.value;
  const F = props.fretCount + 1;
  if (vertical.value) {
    return {
      gridTemplateColumns: `var(--label-size) repeat(${S}, minmax(var(--cell-min), 1fr))`,
      gridTemplateRows: `var(--header-size) repeat(${F}, var(--fret-size))`,
    };
  }
  const fretCols = `repeat(${F}, minmax(var(--cell-min), 1fr))`;
  return {
    gridTemplateColumns: props.leftHanded ? `${fretCols} var(--label-size)` : `var(--label-size) ${fretCols}`,
    gridTemplateRows: `var(--header-size) repeat(${S}, var(--string-size))`,
  };
});

const stringsSpan = computed(() => {
  const S = stringCount.value;
  return `2 / span ${S}`;
});

function inlayStyle(fret) {
  return vertical.value
    ? { gridRow: fretTrack(fret), gridColumn: stringsSpan.value }
    : { gridColumn: fretTrack(fret), gridRow: stringsSpan.value };
}

function isDimmed(stringIndex, fret) {
  const w = props.window;
  if (!w) return false;
  return (w.frets != null && !w.frets.has(fret)) || (w.strings != null && !w.strings.has(stringIndex));
}

function isFretDimmed(fret) {
  return props.window?.frets != null && !props.window.frets.has(fret);
}

// Thicker lines for the low strings, like a real neck.
function stringThickness(stringIndex) {
  const S = stringCount.value;
  return `${(1 + 2.2 * (1 - stringIndex / Math.max(1, S - 1))).toFixed(2)}px`;
}

const markerMap = computed(() => {
  const m = new Map();
  for (const marker of props.markers) m.set(marker.key, marker);
  return m;
});

const promptKey = computed(() => (props.prompt ? posKey(props.prompt.stringIndex, props.prompt.fret) : null));

/** What (if anything) to draw on a cell — the first matching state wins. */
function dotFor(string, fret) {
  const key = posKey(string.index, fret);
  const name = pcName(string.open + fret);
  if (key === promptKey.value) return { cls: 'prompt', label: '?' };
  const marker = markerMap.value.get(key);
  if (marker) return { cls: marker.type, label: marker.label, id: marker.id };
  if (props.found.has(key)) {
    const root = props.rootPc != null && (string.open + fret) % 12 === props.rootPc;
    return { cls: root ? 'correct root' : 'correct', label: props.showNoteNames ? name : '' };
  }
  if (props.revealed.has(key)) return { cls: 'revealed', label: name };
  if (props.freeMarks.has(key)) return { cls: 'free', label: name };
  if (props.showAllNotes) return { cls: 'ghost', label: name };
  return null;
}

function cellLabel(string, fret) {
  const number = stringCount.value - string.index;
  return fret === 0 ? `String ${number} (${string.name}), open` : `String ${number} (${string.name}), fret ${fret}`;
}

function onTap(string, fret) {
  if (!props.interactive || isDimmed(string.index, fret)) return;
  emit('tap', string.index, fret);
}

// Bring the "name this note" prompt into view when it lands off-screen —
// on a phone in portrait the neck is taller than the viewport.
const boardRef = ref(null);
watch(promptKey, async (key) => {
  if (!key) return;
  await nextTick();
  const el = boardRef.value?.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const margin = 140; // room for the sticky exercise panel / bottom keypad
  const offscreen =
    rect.top < margin || rect.bottom > window.innerHeight - margin || rect.left < 0 || rect.right > window.innerWidth;
  if (offscreen) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
});
</script>

<template>
  <div class="fretboard" :class="[orientation, { lefty: leftHanded }]">
    <div ref="boardRef" class="board" :style="gridStyle">
      <!-- Fret numbers -->
      <span
        v-for="fret in frets"
        :key="`n${fret}`"
        class="fret-number"
        :class="{ marker: INLAY_FRETS.includes(fret), dim: isFretDimmed(fret) }"
        :style="place(1, fretTrack(fret))"
      >
        {{ fret }}
      </span>

      <!-- String names -->
      <span
        v-for="string in strings"
        :key="`s${string.index}`"
        class="string-label"
        :style="place(stringTrack(string.index), labelFretTrack)"
      >
        {{ string.name }}
      </span>

      <!-- Inlay dots, drawn under the cells -->
      <div
        v-for="fret in INLAY_FRETS.filter((f) => f <= fretCount)"
        :key="`i${fret}`"
        class="inlay"
        :style="inlayStyle(fret)"
      >
        <span class="inlay-dot" />
        <span v-if="DOUBLE_INLAY_FRETS.includes(fret)" class="inlay-dot" />
      </div>

      <template v-for="string in strings" :key="`row${string.index}`">
        <button
          v-for="fret in frets"
          :key="`${string.index}-${fret}`"
          type="button"
          class="cell"
          :class="{ nut: fret === 0, dim: isDimmed(string.index, fret), passive: !interactive }"
          :style="{ ...place(stringTrack(string.index), fretTrack(fret)), '--thick': stringThickness(string.index) }"
          :data-key="`${string.index}-${fret}`"
          :aria-label="cellLabel(string, fret)"
          :tabindex="isDimmed(string.index, fret) || !interactive ? -1 : 0"
          @click="onTap(string, fret)"
        >
          <span class="string-line" />
          <template v-for="dot in [dotFor(string, fret)]" :key="dot ? `${dot.cls}${dot.id ?? ''}` : 'none'">
            <span v-if="dot" class="note-dot" :class="dot.cls">{{ dot.label }}</span>
          </template>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fretboard {
  --label-size: 2.25rem;
  --header-size: 1.4rem;
  --cell-min: 2.6rem;
  --string-size: 2.6rem;
  --fret-size: 2.9rem;
  --dot-size: 1.8rem;

  margin: 1rem auto 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: #3b2a1a;
  border-radius: 8px;
  padding: 0.75rem;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.4);
}

.fretboard.vertical {
  --label-size: 1.75rem;
  --cell-min: 2.6rem;
  max-width: 28rem;
  padding: 0.5rem 0.5rem 0.75rem 0.25rem;
}

.board {
  display: grid;
  position: relative;
  min-width: max-content;
}

.vertical .board {
  min-width: 0;
}

.fret-number {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: #cbb896;
  font-variant-numeric: tabular-nums;
}

.fret-number.marker {
  color: #f0d9a8;
  font-weight: 700;
}

.fret-number.dim {
  opacity: 0.35;
}

.string-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #f0d9a8;
}

.inlay {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  pointer-events: none;
  z-index: 0;
}

.horizontal .inlay {
  flex-direction: column;
}

.inlay-dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background: rgba(240, 217, 168, 0.22);
}

.cell {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.cell.passive {
  cursor: default;
}

.cell:focus-visible {
  outline: 2px solid #ff5a3c;
  outline-offset: -2px;
  border-radius: 6px;
}

@media (hover: hover) {
  .cell:not(.dim):not(.passive):hover {
    background: rgba(255, 255, 255, 0.07);
  }
}

/* Fret wire on the body side of each cell (the nut for fret 0). */
.cell::after {
  content: '';
  position: absolute;
  background: #8a7554;
}

.horizontal .cell::after {
  top: 0;
  bottom: 0;
  right: 0;
  width: 2px;
}

.horizontal.lefty .cell::after {
  right: auto;
  left: 0;
}

.vertical .cell::after {
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
}

.horizontal .cell.nut::after {
  width: 5px;
  background: #f0d9a8;
}

.vertical .cell.nut::after {
  height: 5px;
  background: #f0d9a8;
}

.cell.dim {
  opacity: 0.35;
  cursor: default;
}

.string-line {
  position: absolute;
  background: linear-gradient(90deg, #c8b28a, #e9dcc0, #c8b28a);
  pointer-events: none;
}

.horizontal .string-line {
  left: 0;
  right: 0;
  top: 50%;
  height: var(--thick);
  transform: translateY(-50%);
}

.vertical .string-line {
  top: 0;
  bottom: 0;
  left: 50%;
  width: var(--thick);
  transform: translateX(-50%);
  background: linear-gradient(180deg, #c8b28a, #e9dcc0, #c8b28a);
}

.note-dot {
  position: relative;
  z-index: 1;
  width: var(--dot-size);
  height: var(--dot-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.78);
  line-height: 1;
  pointer-events: none;
  animation: pulse 0.35s ease-out;
}

.note-dot.correct {
  background: #4caf50;
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.9);
}

.note-dot.correct.root {
  background: #2e7d32;
  color: #eaffea;
  box-shadow: 0 0 0 2px #f0d9a8, 0 0 12px rgba(76, 175, 80, 0.9);
}

.note-dot.hit {
  background: #4caf50;
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.9);
  animation: fade-out 0.7s ease-out forwards;
}

.note-dot.wrong {
  background: #e53935;
  color: #fff;
  box-shadow: 0 0 12px rgba(229, 57, 53, 0.9);
  animation: shake 0.3s ease-out, fade-out 0.7s ease-in forwards;
}

.note-dot.revealed {
  background: rgba(255, 90, 60, 0.15);
  border: 2px dashed #ff5a3c;
  color: #ffb3a3;
}

.note-dot.free {
  background: #ff5a3c;
  box-shadow: 0 0 12px rgba(255, 90, 60, 0.9);
}

.note-dot.prompt {
  background: #ff5a3c;
  color: #1a1006;
  font-size: 0.95rem;
  box-shadow: 0 0 0 3px rgba(255, 90, 60, 0.35), 0 0 16px rgba(255, 90, 60, 0.9);
  animation: prompt-pulse 1.4s ease-in-out infinite;
}

.note-dot.ghost {
  background: rgba(26, 16, 6, 0.55);
  color: #cbb896;
  font-weight: 600;
  animation: none;
}

@keyframes pulse {
  from {
    transform: scale(1.4);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes fade-out {
  0%,
  60% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes shake {
  0%,
  100% {
    translate: 0;
  }
  25% {
    translate: -3px;
  }
  75% {
    translate: 3px;
  }
}

@keyframes prompt-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(255, 90, 60, 0.35), 0 0 16px rgba(255, 90, 60, 0.9);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 90, 60, 0.1), 0 0 22px rgba(255, 90, 60, 1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .note-dot,
  .note-dot.prompt {
    animation: none;
  }
}

/* Phones: horizontal boards get slightly smaller cells so more of the
   neck fits before scrolling; vertical boards already fit the width. */
@media (max-width: 480px) {
  .horizontal {
    --label-size: 1.75rem;
    --cell-min: 2.4rem;
    --string-size: 2.4rem;
    padding: 0.5rem;
  }
}

/* Landscape phones are short: tighten rows so the whole neck stays on screen. */
@media (max-height: 480px) and (orientation: landscape) {
  .horizontal {
    --string-size: 2.05rem;
    --header-size: 1.1rem;
    --dot-size: 1.6rem;
  }
}
</style>
