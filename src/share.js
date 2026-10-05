import { MAX_TRIES } from './puzzle.js';

const WRONG = '\u{1F7E8}'; // yellow - a guess that missed
const RIGHT = '\u{1F7E9}'; // green  - the guess that landed
const FAILED = '\u{1F7E5}'; // red    - ran out of tries
const BLANK = '\u{2B1C}'; // white  - unused try

/** Spoiler-free emoji grid: one row per player, one square per try. */
export function buildShareText(puzzleNo, slots) {
  const solved = slots.filter((s) => s.solved).length;
  const rows = slots.map((slot) => {
    if (!slot.solved && !slot.failed) return BLANK.repeat(MAX_TRIES);
    if (slot.failed) return FAILED.repeat(MAX_TRIES);
    const misses = slot.guesses.length - 1;
    return WRONG.repeat(misses) + RIGHT + BLANK.repeat(MAX_TRIES - misses - 1);
  });

  return [`OVRdle #${puzzleNo}: ${solved}/5`, '', ...rows, '', 'ovrdle.com'].join('\n');
}

/** Native share sheet where available, clipboard otherwise. Returns a status word. */
export async function share(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard.
    }
  }
  return shareCopy(text);
}

/** Clipboard sharing without involving native share sheet at all. Returns a status word. */
export async function shareCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed'
  }
}
