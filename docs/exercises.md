### Exercises

----

Each exercise **file is one practice set**. The **exercise picker** (the
button showing the current set, or "Free Play") lists whole files loaded
from `public/exercises/**/*.yaml`, including subfolders. It does not list
the exercises inside a file. Sets are grouped by subfolder: everything
under `public/exercises/scales/` appears under a "scales" heading.

Pick a set to start it. The app gives you one task at a time ("Find every
C", "Show me the 3rd A minor pentatonic shape", ...), and you answer by
tapping positions on the virtual fretboard:

- a correct tap turns **green** and stays green (root notes of a scale or
  shape get a light ring),
- a wrong tap flashes **red** with the note you actually hit, counts as a
  mistake and vibrates the phone (if your phone supports it and the
  setting is on),
- taps on dimmed frets or strings (outside the exercise's area) are ignored.

A solved exercise advances to the next one after a moment. If you fail one
(too many mistakes, the time runs out, or you press 👁 **Show answer**),
the missed positions appear as dashed outlines. You can then choose **Try
again** or **Next ›**. The ↻ button restarts the current exercise, and
also re-draws any random note, root or shape. When a set is finished, a
summary shows how many exercises you solved, how many mistakes you made
and how long it took, and the set gets a ✓ in the picker.

**Import Exercise Set…** (at the bottom of the picker) loads your own
`.yaml`/`.yml` file. It is parsed entirely in the browser and kept in
`localStorage`, so it is still there next time. Imported sets are listed
last, under "Uploaded Exercises", and can be removed with ✕.

## Exercise file format

```yaml
fretboardtrainer:
  name: My Practice Set     # display name; defaults to the file name
  description: Optional     # not shown in the UI, for your own notes
  ordered: true             # true: exercises in file order, false: shuffled each run
  instrument: guitar        # optional: force guitar | bass | bass5 | guitar7 for the whole set
  exercises:
    - name: Find every C
      description: Tap every C on the fretboard.
      notes: [C]
```

### Exercise types

`type` selects what the player does. When you leave it out, it is
inferred: `shape` if the exercise has `shape` or `positions`, `name` if it
has `randomPositions`, and `find` otherwise. A `name` exercise that uses
`positions` needs an explicit `type: name`.

| type       | the player…                                                 | needs                                                    |
|------------|-------------------------------------------------------------|----------------------------------------------------------|
| `find`     | taps **every** position of the given notes                  | `notes`, `randomNotes`, or `root` + `scale`              |
| `shape`    | taps every note of a scale shape / custom shape             | `root` + `scale` + `shape`, or `positions`               |
| `sequence` | taps **one** position of each note, one note after another  | `notes`, `randomNotes`, or `root` + `scale`              |
| `name`     | sees a highlighted position and picks its note on a keypad  | nothing (random positions); optional `positions`/`notes` |

```yaml
    # find: all Cs and Gs between fret 0 and 5
    - name: Find C and G
      notes: [C, G]
      fretboard: { start: 0, end: 5 }

    # find: a random note each time, 4 rounds
    - name: "Find every {{note}}"
      randomNotes: 1
      repeat: 4

    # find: every note of a scale or arpeggio inside a window
    - name: C major in open position
      root: C
      scale: major
      fretboard: { start: 0, end: 3 }

    # shape: the third A minor pentatonic box
    - name: "{{shape_ordinal}} A minor pentatonic shape"
      root: A
      scale: minor-pentatonic
      shape: 3

    # shape: random key and shape, tapped from lowest to highest note
    - name: "{{root}} minor pentatonic, shape {{shape}}"
      root: random
      scale: minor-pentatonic
      shape: random
      ordered: true

    # shape: any custom shape, "string:fret" with string 1 = highest string
    - name: Open C chord
      instrument: guitar
      positions: ["5:3", "4:2", "3:0", "2:1", "1:0"]

    # sequence: speed drill, 20 random natural notes, 3 mistakes allowed
    - name: Natural notes sprint
      type: sequence
      notes: [C, D, E, F, G, A, B]
      success_on: 20
      failure_on: 3

    # name: identify 10 random positions in frets 0-4
    - name: Name the notes
      randomPositions: 10
      fretboard: { start: 0, end: 4 }
```

### Keys

| key                | applies to       | meaning |
|--------------------|------------------|---------|
| `name`             | all              | Title. Supports placeholders, see below. |
| `description`      | all              | Instruction text. Supports placeholders. |
| `type`             | all              | `find`, `shape`, `sequence` or `name` (see above). |
| `notes`            | find, sequence, name | Note list. `C#` and `Db` are both fine (`♯`/`♭` also work). A trailing octave pins one exact pitch, e.g. `E2` = low E string open on guitar, `C4` = middle C. For `name`, it limits the asked positions to these notes. |
| `randomNotes: N`   | find, sequence   | Draws `N` random notes each attempt, from `notes`, the scale, or all 12 notes. |
| `root`             | find, shape, sequence, name | Root note for `scale`, or `random`. |
| `scale`            | find, shape, sequence, name | One of the scales below. |
| `shape`            | shape            | Shape number (1 = starts on the root on the lowest string), or `random`. |
| `notes_per_string` | shape            | Overrides the shape system: 2 for pentatonics and 3 for seven-note scales by default. |
| `positions`        | shape, name      | Explicit positions, `"string:fret"` or `{ string: 6, fret: 5 }`. String 1 is the highest string. |
| `randomPositions: N` | name           | Number of positions to ask (default 10). |
| `ordered`          | shape, sequence, name | shape: tap from the lowest to the highest pitch (default `false`). sequence: always in order. name with `positions`: ask in the listed order. |
| `success_on: N`    | sequence, name   | **Scoring mode**: endless random prompts. The exercise is solved after `N` correct answers. |
| `failure_on: N`    | all              | The exercise fails after `N` mistakes. |
| `time_limit: S`    | all              | Countdown in seconds. Running out fails the exercise. The exception is scoring mode without `success_on`: there the time limit is the end of the drill ("as many as you can in 60 s"). |
| `repeat: N`        | all              | Plays the exercise `N` times in a row, with fresh random values each time. |
| `instrument`       | all              | Forces `guitar`, `bass`, `bass5` or `guitar7` for this exercise. Otherwise the instrument from the settings is used. |
| `fretboard`        | all              | The relevant area: `{ start: 5, end: 8 }` or `{ frets: [0, 12] }`, optionally with `strings: [1, 2]`. Everything else is dimmed. If you leave it out, the whole neck is used. |

### Placeholders

`{{note}}` (first drawn note), `{{notes}}` (all of them), `{{root}}`,
`{{scale}}` (e.g. "minor pentatonic"), `{{shape}}` (e.g. `3`) and
`{{shape_ordinal}}` (e.g. `3rd`) are replaced with the actual values of the
current attempt. This lets random exercises say what to look for.

### Scales

`major` (`ionian`), `minor` (`aeolian`, `natural-minor`), `major-pentatonic`,
`minor-pentatonic`, `blues`, `harmonic-minor`, `melodic-minor`, `dorian`,
`phrygian`, `lydian`, `mixolydian`, `locrian`, `major-triad`, `minor-triad`,
`diminished-triad`, `augmented-triad`, `major-7`, `minor-7`, `dominant-7`,
`minor-7b5`.

Shapes are built by starting on the N-th scale degree on the lowest string
and walking up the scale with a fixed number of notes per string. That
gives the five standard pentatonic boxes (2 per string) and the seven
3-notes-per-string shapes for seven-note scales. Because the walk follows
pitch, it handles the guitar's B string correctly and works on any of the
supported instruments. The same shape one octave higher is also accepted.
The first correct tap decides which octave you are playing. Triads,
seventh chords and `blues` have no standard shape system. Use them in
`find` exercises, or set `notes_per_string` yourself.

## Adding built-in exercises

Drop a `.yaml`/`.yml` file anywhere under `public/exercises/` (subfolders
become groups in the picker) and restart `npm run dev`, or rerun
`npm run build`. A `pre*` npm hook regenerates
`public/exercises/manifest.json`, which is how the app finds the files.
`npm run exercises:manifest` regenerates the manifest on its own. `npm test`
checks that every built-in file parses and builds on every instrument.
