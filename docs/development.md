### Project layout

---

```
public/exercises/        Built-in exercise YAML files (subfolders OK) + generated manifest.json
public/manifest.webmanifest, favicon.svg, icon-*.png   Home-screen install metadata
scripts/generate-exercise-manifest.mjs  Recursively scans public/exercises, writes manifest.json
src/lib/theory.js        Note parsing, scale formulas, scale-shape generation
src/lib/instruments.js   Tunings, fret counts, inlay positions
src/lib/exercises.js     Exercise YAML parsing/validation, built-in + localStorage-persisted upload loading
src/lib/engine.js        Turns an exercise definition into a concrete attempt (targets, prompts, random draws)
src/composables/useExercises.js  Set selection, import, tap/answer scoring state machine
src/composables/useSettings.js   Persisted user settings (instrument, frets, layout, ...)
src/components/Fretboard.vue     Tappable neck, horizontal or vertical, right- or left-handed
src/components/NoteKeypad.vue    Piano-style note picker for "name" exercises
src/App.vue              Top-level UI: picker, settings, exercise panel
tests/                   Vitest unit tests (theory, engine, all built-in exercise files)
```

Internally string index 0 is always the **lowest** string. Exercise files
use player numbering instead (string 1 = highest), and engine.js converts
between the two.
