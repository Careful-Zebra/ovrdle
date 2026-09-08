# OVRdle

A daily football guessing game. Each round: guess the **overall rating** of 5
footballers, one pinned to each of the last five games (FIFA 22 → EA FC 26).

- 5 players per round, all shown at once — guess them in any order
- 3 tries per player, higher/lower feedback only
- Deterministic daily puzzle (seeded from the date); no player two days running
- Endless **Practice** mode alongside the daily
- Spoiler-free emoji share grid, local stats with streaks and distribution

("OVR" is the in-game term for a player's overall rating. The name avoids
"FIFA", which is EA's former brand and a trademark.)

## Development

No build step. Static HTML + vanilla JS.

```
npm run dev        # serve on http://localhost:5173 (no cache headers - hard-refresh after edits)
npm run validate   # check data/players.json integrity + per-edition rosters
npm run import     # rebuild players.json from a CSV in data/raw/
```

## Data

`data/players.json` is hand-built (127 players, 584 ratings). Scraping SoFIFA is
not viable — their `robots.txt` blocks `ClaudeBot` by name, `/api/` is disallowed
for all agents, and the ToS page 403s automated fetches. Ratings come from model
training data; spot-check before launch, or drop a Kaggle-style CSV into
`data/raw/` and run `npm run import`.

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
```

Internal RNG seed strings in `src/puzzle.js` still read `fifa-wordle:*` — they
are arbitrary seeds, not branding; changing them would reshuffle every past and
future puzzle.
