# OVRdle

A daily football guessing game. Each round: guess the **overall rating** of 5
footballers, one pinned to each of the last five games (FIFA 22 → EA FC 26).

- 5 players per round, all shown at once, guess them in any order
- 3 tries per player, higher/lower feedback only
- Deterministic daily puzzle (seeded from the date); no player two days running
- Endless **Practice** mode alongside the daily
- Spoiler-free emoji share grid, local stats with streaks and distribution

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
  by Luis (luisfucros) on Kaggle, MIT licensed.
- FIFA 23 ratings were checked against base cards in the
  [spreadsheet of all FIFA 23 FUT player data](https://www.reddit.com/r/fut/comments/zwb6tz/spreadsheet_of_all_fifa_23_fut_player_data/)
  shared on r/fut.
- EA FC 24 ratings were checked against launch ratings in the
  [EA Sports FC 24 complete player dataset](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset)
  by Stefano Leone on Kaggle, CC0.
- EA FC 25 ratings were checked against the
  [EA SPORTS FC 25 Database, Ratings and Stats](https://www.kaggle.com/datasets/nyagami/ea-sports-fc-25-database-ratings-and-stats)
  by Davis Nyagami on Kaggle, Apache 2.0.
- EA FC 26 ratings were checked against
  [EA Sports FC 26 Player Ratings](https://www.kaggle.com/datasets/justdhia/ea-sports-fc-26-player-ratings)
  by Dhia (justdhia) on Kaggle, CC0.
- Player photos come from Wikimedia Commons; each photographer and licence is
  listed in the in-game Photo credits.

