#!/usr/bin/env node
/**
 * Rebuild data/players.json from full-squad CSV exports.
 *
 * Drop one CSV per edition into data/raw/, named after the edition id in
 * data/players.json - fifa22.csv, fifa23.csv, fc24.csv, fc25.csv, fc26.csv.
 * The column names below match the widely-circulated "FIFA complete player
 * dataset" layout; adjust COLUMNS if yours differs.
 *
 *   node scripts/import-csv.mjs [--min-ovr 78] [--min-editions 2]
 *
 * Writes data/players.json. Your hand-written file is copied to
 * data/players.backup.json first.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const COLUMNS = {
  id: ['sofifa_id', 'player_id', 'id'],
  name: ['short_name', 'name'],
  longName: ['long_name'],
  ovr: ['overall'],
  club: ['club_name', 'club'],
  positions: ['player_positions', 'position'],
  nation: ['nationality_name', 'nationality'],
  dob: ['dob', 'birth_date'],
  age: ['age'],
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const MIN_OVR = flag('min-ovr', 78);
const MIN_EDITIONS = flag('min-editions', 2);

const dataPath = new URL('../data/players.json', import.meta.url);
const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
const players = new Map();

for (const edition of existing.editions) {
  const csvPath = new URL(`../data/raw/${edition.id}.csv`, import.meta.url);
  if (!existsSync(csvPath)) {
    console.warn(`skip  ${edition.id} - data/raw/${edition.id}.csv not found`);
    continue;
  }

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  let kept = 0;

  for (const row of rows) {
    const ovr = Number(pick(row, COLUMNS.ovr));
    if (!Number.isFinite(ovr) || ovr < MIN_OVR) continue;

    const name = pick(row, COLUMNS.name);
    const club = pick(row, COLUMNS.club);
    if (!name || !club) continue;

    const key = pick(row, COLUMNS.id) || slug(pick(row, COLUMNS.longName) || name);
    if (!players.has(key)) {
      players.set(key, {
        id: slug(name),
        name,
        pos: (pick(row, COLUMNS.positions) || '').split(',')[0].trim().toUpperCase(),
        nation: pick(row, COLUMNS.nation) || '',
        born: birthYear(row, edition.year),
        ratings: {},
      });
    }
    players.get(key).ratings[edition.id] = { ovr, club };
    kept++;
  }

  console.log(`load  ${edition.id} - ${kept} of ${rows.length} rows at ovr >= ${MIN_OVR}`);
}

const out = [...players.values()].filter((p) => Object.keys(p.ratings).length >= MIN_EDITIONS);
if (out.length === 0) {
  console.error('\nNo players imported. Put CSVs in data/raw/ named after the edition ids.');
  process.exit(1);
}

dedupeIds(out);
out.sort((a, b) => a.name.localeCompare(b.name));

copyFileSync(dataPath, new URL('../data/players.backup.json', import.meta.url));
writeFileSync(
  dataPath,
  JSON.stringify({ _comment: existing._comment, editions: existing.editions, players: out }, null, 2) + '\n'
);

console.log(`\nwrote ${out.length} players (>= ${MIN_EDITIONS} editions each)`);
console.log('previous file saved as data/players.backup.json');
console.log('run  npm run validate  to check the result');

// ---------------------------------------------------------------- helpers

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.length >= header.length / 2)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function pick(row, names) {
  for (const n of names) if (row[n]) return row[n];
  return '';
}

function birthYear(row, editionYear) {
  const dob = pick(row, COLUMNS.dob);
  if (dob) {
    const y = Number(String(dob).slice(0, 4));
    if (y > 1960 && y < 2015) return y;
  }
  const age = Number(pick(row, COLUMNS.age));
  return Number.isFinite(age) && age > 0 ? editionYear - age : null;
}

function slug(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Two different players can slug identically; suffix the later ones. */
function dedupeIds(list) {
  const used = new Set();
  for (const p of list) {
    let id = p.id || 'player';
    let n = 2;
    while (used.has(id)) id = `${p.id}-${n++}`;
    used.add(id);
    p.id = id;
  }
}
