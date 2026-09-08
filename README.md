# FIFA Wordle

A Wordle-style guessing game with a FIFA / football theme. Each day presents a
new challenge: guess the **overall rating** of 5 footballers, each pinned to a
specific edition from the last five FIFA / EA FC games (FIFA 22 → EA FC 26).

- 5 players per day, revealed one at a time
- 3 tries per player, higher/lower feedback only
- Deterministic daily puzzle (seeded from the date)
- Spoiler-free emoji share grid, local stats with streaks and distribution

## Development

No build step. Static HTML + vanilla JS.

```
npm run dev        # serve on http://localhost:5173
npm run validate   # check data/players.json integrity + rotation
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
src/app.js             game loop, rendering, modals, stats
src/puzzle.js          daily puzzle selection (deterministic from date)
src/rng.js             seeded PRNG
src/storage.js         localStorage progress + stats
src/share.js           emoji share grid
src/styles.css
scripts/validate-data.mjs
scripts/import-csv.mjs
```
