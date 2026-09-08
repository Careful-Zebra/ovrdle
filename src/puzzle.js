import { rngFrom, shuffle, pick } from './rng.js';

/** Puzzle #1 is this date, local time. */
export const EPOCH = { y: 2026, m: 9, d: 6 };

export const PLAYERS_PER_PUZZLE = 5;
export const MAX_TRIES = 3;

const DAY_MS = 86400000;

/** Local calendar date as YYYY-MM-DD, so the puzzle rolls over at local midnight. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days between the epoch and a YYYY-MM-DD key; puzzle #1 is day 0. */
export function puzzleNumber(key = dateKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const days = (Date.UTC(y, m - 1, d) - Date.UTC(EPOCH.y, EPOCH.m - 1, EPOCH.d)) / DAY_MS;
  return Math.floor(days) + 1;
}

/** Milliseconds until the next local midnight. */
export function msUntilTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}

/**
 * Pick the day's five players.
 *
 * The pool is shuffled once per "cycle" and consumed five at a time, so a player
 * cannot reappear until every other player has been used. Each cycle reshuffles
 * with a new seed, so the order does not repeat either.
 */
export function buildPuzzle(data, puzzleNo) {
  const pool = data.players.filter((p) => editionsFor(data, p).length > 0);
  if (pool.length < PLAYERS_PER_PUZZLE) {
    throw new Error(`Need at least ${PLAYERS_PER_PUZZLE} players, have ${pool.length}`);
  }

  const perCycle = Math.floor(pool.length / PLAYERS_PER_PUZZLE);
  const index = puzzleNo - 1;
  // Negative index (someone's clock is before the epoch) still lands somewhere valid.
  const cycle = Math.floor(index / perCycle);
  const offset = ((index % perCycle) + perCycle) % perCycle;

  const order = shuffle(pool.slice(), rngFrom(`fifa-wordle:cycle:${cycle}`));
  const chosen = order.slice(offset * PLAYERS_PER_PUZZLE, offset * PLAYERS_PER_PUZZLE + PLAYERS_PER_PUZZLE);

  const rand = rngFrom(`fifa-wordle:day:${puzzleNo}`);
  const items = chosen.map((player) => {
    const edition = pick(editionsFor(data, player), rand);
    const entry = player.ratings[edition.id];
    return {
      playerId: player.id,
      name: player.name,
      nation: player.nation,
      position: entry.pos || player.pos,
      club: entry.club,
      age: player.born ? edition.year - player.born : null,
      edition,
      answer: entry.ovr,
    };
  });

  // Shuffle again so the five are not ordered by anything guessable.
  return shuffle(items, rand);
}

function editionsFor(data, player) {
  return data.editions.filter((e) => player.ratings && player.ratings[e.id]);
}
