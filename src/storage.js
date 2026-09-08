// All persistence is per-browser localStorage. Wrapped because private-mode and
// blocked-cookie browsers throw on access rather than returning null.

const PROGRESS_KEY = 'ovrdle:progress';
const STATS_KEY = 'ovrdle:stats';
const PRACTICE_KEY = 'ovrdle:practice';
const PRACTICE_STATS_KEY = 'ovrdle:practice-stats';

// Bump when puzzle generation changes so a saved in-progress round whose
// players no longer match the new layout is dropped rather than shown stale.
const SCHEMA = 2;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - the game still plays, it just will not resume */
  }
}

export function loadProgress(puzzleNo) {
  const saved = read(PROGRESS_KEY, null);
  return saved && saved.puzzleNo === puzzleNo && saved.schema === SCHEMA ? saved : null;
}

export function saveProgress(progress) {
  write(PROGRESS_KEY, { ...progress, schema: SCHEMA });
}

export const emptyStats = () => ({
  played: 0,
  solvedTotal: 0,
  perfect: 0,
  streak: 0,
  maxStreak: 0,
  lastPuzzle: null,
  distribution: [0, 0, 0, 0, 0, 0], // index = players solved that day (0-5)
});

export function loadStats() {
  return { ...emptyStats(), ...read(STATS_KEY, {}) };
}

/** Record a finished puzzle. Idempotent - replaying the same day will not double-count. */
export function recordResult(puzzleNo, solvedCount) {
  const stats = loadStats();
  if (stats.lastPuzzle === puzzleNo) return stats;

  stats.played += 1;
  stats.solvedTotal += solvedCount;
  stats.distribution[solvedCount] = (stats.distribution[solvedCount] || 0) + 1;
  if (solvedCount === 5) stats.perfect += 1;

  // A streak survives only if you played the immediately preceding puzzle and
  // got at least one right.
  const continued = stats.lastPuzzle === puzzleNo - 1;
  stats.streak = solvedCount > 0 ? (continued ? stats.streak : 0) + 1 : 0;
  stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  stats.lastPuzzle = puzzleNo;

  write(STATS_KEY, stats);
  return stats;
}

// ---------------------------------------------------------------- practice

/** The in-progress practice round, so a refresh does not lose it. */
export function loadPractice() {
  const saved = read(PRACTICE_KEY, null);
  return saved && saved.schema === SCHEMA ? saved : null;
}

export function savePractice(round) {
  write(PRACTICE_KEY, { ...round, schema: SCHEMA });
}

export function clearPractice() {
  try {
    localStorage.removeItem(PRACTICE_KEY);
  } catch {
    /* ignore */
  }
}

export const emptyPracticeStats = () => ({
  rounds: 0,
  solvedTotal: 0,
  best: 0,
  perfect: 0,
  distribution: [0, 0, 0, 0, 0, 0], // index = players solved that round (0-5)
});

export function loadPracticeStats() {
  return { ...emptyPracticeStats(), ...read(PRACTICE_STATS_KEY, {}) };
}

/** Tally a finished practice round. Every round counts - there is no "same day" guard. */
export function recordPracticeResult(solvedCount) {
  const stats = loadPracticeStats();
  stats.rounds += 1;
  stats.solvedTotal += solvedCount;
  stats.best = Math.max(stats.best, solvedCount);
  stats.distribution[solvedCount] = (stats.distribution[solvedCount] || 0) + 1;
  if (solvedCount === 5) stats.perfect += 1;
  write(PRACTICE_STATS_KEY, stats);
  return stats;
}
