<script setup>
import { onMounted, onUnmounted } from 'vue';

const props = defineProps({
  disabled: { type: Boolean, default: false },
  wrong: { type: Object, default: null }, // { id, pc } — flashes that key red
});

const emit = defineEmits(['answer']);

// Laid out like a piano octave: naturals along the bottom, sharps/flats
// raised between them. `col` is the start column in a 14-column grid where
// each key spans two columns, so the black keys sit between white keys.
const NATURALS = [
  { pc: 0, label: 'C', col: 1 },
  { pc: 2, label: 'D', col: 3 },
  { pc: 4, label: 'E', col: 5 },
  { pc: 5, label: 'F', col: 7 },
  { pc: 7, label: 'G', col: 9 },
  { pc: 9, label: 'A', col: 11 },
  { pc: 11, label: 'B', col: 13 },
];
const ACCIDENTALS = [
  { pc: 1, sharp: 'C♯', flat: 'D♭', col: 2 },
  { pc: 3, sharp: 'D♯', flat: 'E♭', col: 4 },
  { pc: 6, sharp: 'F♯', flat: 'G♭', col: 8 },
  { pc: 8, sharp: 'G♯', flat: 'A♭', col: 10 },
  { pc: 10, sharp: 'A♯', flat: 'B♭', col: 12 },
];

const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function answer(pc) {
  if (!props.disabled) emit('answer', pc);
}

// Desktop shortcut: a letter answers the natural, Shift+letter its sharp.
function onKeydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
  const pc = LETTER_PC[event.key.toLowerCase()];
  if (pc == null) return;
  event.preventDefault();
  answer((pc + (event.shiftKey ? 1 : 0)) % 12);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="keypad" role="group" aria-label="Note names">
    <button
      v-for="key in ACCIDENTALS"
      :key="`${key.pc}-${wrong?.pc === key.pc ? wrong.id : ''}`"
      type="button"
      class="key accidental"
      :class="{ wrong: wrong?.pc === key.pc }"
      :style="{ gridColumn: `${key.col} / span 2`, gridRow: 1 }"
      :disabled="disabled"
      :aria-label="`${key.sharp} / ${key.flat}`"
      @click="answer(key.pc)"
    >
      <span>{{ key.sharp }}</span>
      <span class="flat">{{ key.flat }}</span>
    </button>
    <button
      v-for="key in NATURALS"
      :key="`${key.pc}-${wrong?.pc === key.pc ? wrong.id : ''}`"
      type="button"
      class="key natural"
      :class="{ wrong: wrong?.pc === key.pc }"
      :style="{ gridColumn: `${key.col} / span 2`, gridRow: 2 }"
      :disabled="disabled"
      @click="answer(key.pc)"
    >
      {{ key.label }}
    </button>
  </div>
</template>

<style scoped>
.keypad {
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  grid-template-rows: 3rem 3.25rem;
  gap: 0.35rem 0.3rem;
  max-width: 30rem;
  margin: 0 auto;
}

.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s, background 0.15s;
  line-height: 1.05;
}

.key:active:not(:disabled) {
  transform: scale(0.94);
}

.key:disabled {
  opacity: 0.5;
  cursor: default;
}

.natural {
  background: #eee8dc;
  color: #1a1006;
  border: 1px solid #cbb896;
  font-size: 1.1rem;
}

.accidental {
  background: #2a1e12;
  color: #f0d9a8;
  border: 1px solid #8a7554;
  font-size: 0.8rem;
}

.accidental .flat {
  font-size: 0.7rem;
  color: #a89f8f;
  font-weight: 600;
}

@media (hover: hover) {
  .natural:hover:not(:disabled) {
    background: #fff;
  }

  .accidental:hover:not(:disabled) {
    background: #3b2a1a;
  }
}

.key.wrong {
  animation: wrong-flash 0.6s ease-out;
}

@keyframes wrong-flash {
  0%,
  40% {
    background: #e53935;
    color: #fff;
    border-color: #e53935;
  }
}

@media (prefers-reduced-motion: reduce) {
  .key.wrong {
    animation-duration: 0.01s;
  }
}
</style>
