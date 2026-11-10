import { reactive, watch } from 'vue';
import { DEFAULT_FRET_COUNT, DEFAULT_INSTRUMENT, FRET_COUNTS, INSTRUMENTS } from '../lib/instruments.js';

const STORAGE_KEY = 'fretboardtrainer:settings';

const DEFAULTS = {
  instrument: DEFAULT_INSTRUMENT,
  fretCount: DEFAULT_FRET_COUNT,
  showNoteNames: true,
  leftHanded: false,
  layout: 'auto', // 'auto' | 'horizontal' | 'vertical'
  vibrate: true,
};

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const merged = { ...DEFAULTS, ...stored };
    // Drop values a previous version (or a hand-edited store) left invalid.
    if (!INSTRUMENTS[merged.instrument]) merged.instrument = DEFAULTS.instrument;
    if (!FRET_COUNTS.includes(merged.fretCount)) merged.fretCount = DEFAULTS.fretCount;
    if (!['auto', 'horizontal', 'vertical'].includes(merged.layout)) merged.layout = DEFAULTS.layout;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

const settings = reactive(readStored());

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, etc.) — settings just won't persist.
    }
  },
  { deep: true }
);

/** Shared, localStorage-persisted app settings. */
export function useSettings() {
  return settings;
}
