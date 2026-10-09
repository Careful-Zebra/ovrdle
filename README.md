# OVRdle

A daily football guessing game. Each round: guess the **overall rating** of 5
footballers, one pinned to each of the last five games (FIFA 22 → EA FC 26).

- 5 players per round, all shown at once, guess them in any order
- 3 tries per player, higher/lower feedback only
- Deterministic daily puzzle (seeded from the date); no player two days running
- Endless **Practice** mode alongside the daily
- Spoiler-free emoji share grid, local stats with streaks and distribution

## Development

No build step. Static HTML + vanilla JS.

```
npm run dev        # serve on http://localhost:5173 (no cache headers - hard-refresh after edits)
npm run validate   # check data/players.json integrity + per-edition rosters
npm run import     # rebuild players.json from a CSV in data/raw/
npm run check-ratings              # compare ratings with CSVs in data/raw/ (report only)
npm run check-ratings -- --apply   # ...and write the confident fixes
node scripts/fetch-photos.mjs      # fetch CC-licensed photos for players missing one
```

`data/raw/` is git-ignored: Amplify publishes every committed file, so
third-party CSVs must never be committed.

## Layout

```
index.html            game shell
src/app.js             game loop, rendering, modals, stats, Daily/Practice modes
src/puzzle.js          daily + practice puzzle building (deterministic)
src/rng.js             seeded PRNG
src/storage.js         localStorage progress + stats (keys: ovrdle:*)
src/share.js           emoji share grid
src/styles.css
scripts/validate-data.mjs
scripts/import-csv.mjs
scripts/check-ratings.mjs
scripts/fetch-photos.mjs
scripts/lib/csv.mjs    CSV parser shared by the import and check scripts
data/players.json      players, ratings, photo attribution
data/img/              player photos
```

## Credits

- FIFA 22 ratings were checked against the
  [FIFA Players dataset](https://www.kaggle.com/datasets/luisfucros/fifa-players)
  by Luis (luisfucros) on Kaggle, MIT licensed, which is SoFIFA data. Other
  editions' ratings are hand-compiled and not yet verified.
- Player photos come from Wikimedia Commons; each photographer and licence is
  listed in the in-game Photo credits.

