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
 * Build the day's round: one player from each edition of the game, so every
 * round spans all five years. Deterministic from the puzzle number.
 *
 * Each edition carries its own rotation - the full list of players who appear
 * in that edition, shuffled once from a stable seed, then walked one step per
 * day. An edition's slot therefore will not repeat a player for ~100+ days,
 * and consecutive days share no players.
 */
export function buildPuzzle(data, puzzleNo) {
  assertOnePerEdition(data);
  const rand = rngFrom(`fifa-wordle:day:${puzzleNo}`);
  const index = puzzleNo - 1;
  const used = new Set();

  const items = data.editions.map((edition) => {
    const roster = shuffle(rosterFor(data, edition), rngFrom(`fifa-wordle:roster:${edition.id}`));
    // Negative index (a clock set before the epoch) still lands in range.
    let cursor = ((index % roster.length) + roster.length) % roster.length;
    // Skip anyone already taken by an earlier edition this day.
    for (let n = 0; n < roster.length && used.has(roster[cursor].id); n++) {
      cursor = (cursor + 1) % roster.length;
    }
    used.add(roster[cursor].id);
    return toItem(roster[cursor], edition);
  });

  // Shuffle so the five are not shown in edition order.
  return shuffle(items, rand);
}

/**
 * A one-off practice round: still one player per edition, but drawn at random
 * instead of by rotation. Reproducible from the seed for save/resume.
 */
export function buildPracticePuzzle(data, seed) {
  assertOnePerEdition(data);
  const rand = rngFrom(`fifa-wordle:practice:${seed}`);
  const used = new Set();

  const items = shuffle(data.editions.slice(), rand).map((edition) => {
    const player = pick(rosterFor(data, edition).filter((p) => !used.has(p.id)), rand);
    used.add(player.id);
    return toItem(player, edition);
  });

  return shuffle(items, rand);
}

/** Players who appear in a given edition. */
function rosterFor(data, edition) {
  return data.players.filter((p) => p.ratings && p.ratings[edition.id]);
}

/** One puzzle item: a player pinned to a specific edition. */
function toItem(player, edition) {
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
}

/**
 * The round is one player per edition, so the edition count must match the
 * round size and every edition needs enough players to fill its slot after the
 * others have taken theirs.
 */
function assertOnePerEdition(data) {
  if (data.editions.length !== PLAYERS_PER_PUZZLE) {
    throw new Error(
      `Round is ${PLAYERS_PER_PUZZLE} players, one per edition, but data has ${data.editions.length} editions`
    );
  }
  for (const edition of data.editions) {
    const n = rosterFor(data, edition).length;
    if (n < PLAYERS_PER_PUZZLE) throw new Error(`Edition ${edition.id} has only ${n} players`);
  }
}
