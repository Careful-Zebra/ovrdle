import { clientId } from './storage.js';

const API = 'https://YOUR-URL.lambda-url.REGION.on.aws';

/** Never throws: if it fails, the game carries on and this result just isn't counted. */
export function submitResult(puzzleNo, solved) {
  return fetch(`${API}/results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ puzzleNo, solved, clientId: clientId() }),
  }).then((r) => r.ok, () => false);
}

export async function loadWeek(from) {
  const r = await fetch(`${API}/week?from=${from}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).counts;
}