#!/usr/bin/env node
// Sanity-checks data/players.json. Hard errors fail the run; "review" items are
// only suspicious, since real careers do sometimes jump.

import { readFileSync } from 'node:fs';

const JUMP_THRESHOLD = 9; // year-over-year swing worth a second look
const MIN_OVR = 40;
const MAX_OVR = 99;
const PLAYERS_PER_PUZZLE = 5;

const path = new URL('../data/players.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));

const errors = [];
const review = [];
const editionIds = data.editions.map((e) => e.id);
const seen = new Set();

if (new Set(editionIds).size !== editionIds.length) errors.push('Duplicate edition ids');

for (const p of data.players) {
  const where = p.id || p.name || '(unnamed)';

  if (!p.id) errors.push(`${where}: missing id`);
  else if (seen.has(p.id)) errors.push(`${p.id}: duplicate id`);
  else seen.add(p.id);

  for (const field of ['name', 'pos', 'nation']) {
    if (!p[field]) errors.push(`${where}: missing ${field}`);
  }
  if (p.born && (p.born < 1970 || p.born > 2012)) errors.push(`${where}: implausible born ${p.born}`);

  const keys = Object.keys(p.ratings || {});
  if (keys.length === 0) errors.push(`${where}: no ratings`);

  for (const k of keys) {
    if (!editionIds.includes(k)) errors.push(`${where}: unknown edition "${k}"`);
    const r = p.ratings[k];
    if (!r || typeof r.ovr !== 'number') errors.push(`${where}/${k}: missing ovr`);
    else if (r.ovr < MIN_OVR || r.ovr > MAX_OVR) errors.push(`${where}/${k}: ovr ${r.ovr} out of range`);
    if (!r || !r.club) errors.push(`${where}/${k}: missing club`);
  }

  // Compare consecutive editions the player actually appears in.
  const timeline = editionIds.filter((id) => p.ratings && p.ratings[id]);
  for (let i = 1; i < timeline.length; i++) {
    const [prev, next] = [timeline[i - 1], timeline[i]];
    const delta = p.ratings[next].ovr - p.ratings[prev].ovr;
    if (Math.abs(delta) >= JUMP_THRESHOLD) {
      review.push(`${where}: ${prev} ${p.ratings[prev].ovr} -> ${next} ${p.ratings[next].ovr} (${delta > 0 ? '+' : ''}${delta})`);
    }
  }
}

const cells = data.players.reduce((n, p) => n + Object.keys(p.ratings || {}).length, 0);
const cycleDays = Math.floor(data.players.length / PLAYERS_PER_PUZZLE);

console.log(`players    ${data.players.length}`);
console.log(`editions   ${editionIds.length} (${editionIds.join(', ')})`);
console.log(`cells      ${cells} player-edition ratings`);
console.log(`rotation   ${cycleDays} days before a player can repeat`);

if (review.length) {
  console.log(`\nreview (${review.length}) - large year-over-year swings, verify these:`);
  for (const r of review) console.log(`  ${r}`);
}

if (errors.length) {
  console.error(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log('\nOK');
