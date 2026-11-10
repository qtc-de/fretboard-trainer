### Fretboard Trainer

----

Single-page Vue app for learning the guitar or bass fretboard without an
instrument. It gives you tasks like *"Find every C on the fretboard"* or
*"Show me the 3rd A minor pentatonic shape"*, and you answer by tapping
the positions on a virtual neck. It is built for phones first: in portrait
the neck stands upright so every fret is a large tap target, and a piano
style keypad is docked at the bottom for "name that note" drills.

<img width="1040" height="572" alt="image" src="https://github.com/user-attachments/assets/3ea8c5e7-8947-42fa-bc8c-f3478ecdf285" />

Exercises are YAML files, in the same style as
[BassBuddy](https://github.com/qtc-de/BassBuddy). You can load your own
from disk.

Try it out at: https://qtc-de.github.io/fretboard-trainer/


### Development

----

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests + validation of every built-in exercise file
npm run build     # static bundle in dist/
npm run preview   # serve dist/
```

Requires Node.js 20.19+ (CI uses Node 22).

See [docs/exercises.md](docs/exercises.md) for the exercise file format
and [docs/development.md](docs/development.md) for the project layout.


### Run with Docker

----

```sh
docker build -t fretboard-trainer .
docker run --rm -p 8080:80 fretboard-trainer
```

Open `http://localhost:8080`.


### Disclaimer

----

This app was created using vibe-coding only.
