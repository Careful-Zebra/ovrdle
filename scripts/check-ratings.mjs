#!/usr/bin/env node
/**
 * Check the ratings in data/players.json against a full-squad CSV export,
 * such as the Kaggle "FIFA Players" dataset (luisfucros), which is SoFIFA data.
 *
 * Put CSVs in data/raw/ (git-ignored). Each edition is checked if its file is
 * there: players_22.csv or fifa22.csv -> fifa22, players_24.csv -> fc24, etc.
 *
 *   node scripts/check-ratings.mjs             # report only, changes nothing
 *   node scripts/check-ratings.mjs --apply     # also write the confident fixes
 *   node scripts/check-ratings.mjs --dir PATH  # read CSVs from another folder
 *
 * Only `ovr` is ever written, and only for confident matches. Clubs are
 * reported but not applied: the CSV uses SoFIFA's club names ("FC Barcelona"
 * for our "Barcelona"), so a club "difference" is often just naming.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, pick } from './lib/csv.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data', 'players.json');

// Column names across the layouts we've seen: the SoFIFA-style Kaggle dumps
// and FUTBIN's Ultimate Team export (PlayerName, Rating, Card, ...).
const COLUMNS = {
  id: ['sofifa_id', 'player_id', 'id'],
  short: ['short_name', 'playername', 'name'],
  long: ['long_name'],
  ovr: ['overall', 'rating'],
  club: ['club_name', 'club'],
  nation: ['nationality_name', 'nationality', 'nation'],
  dob: ['dob', 'birth_date'],
  age: ['age'],
  update: ['fifa_update', 'update_as_of', 'fifa_update_date'],
  card: ['card'],
};

// Ultimate Team exports list every card a player has (in-forms, promos, World
// Cup...), each with a different rating. Only plain base cards count, e.g.
// "fut23 gold rare" or "fut23 silver common".
const BASE_CARD = /^fut\d+ (gold|silver|bronze) (rare|common)$/;

// When a player is reported "not found" or "ambiguous", pin them to the
// dataset's player id here: { playerId: { editionId: sofifaId } }.
const OVERRIDES = {
  gavi: { fifa23: 1821 }, // FUTBIN: "Páez Gavira"
  gabriel: { fifa23: 1451 }, // FUTBIN: just "Gabriel"; Gabriel Jesus shares his year, nation and club
};

// Country names that differ between our data and SoFIFA's.
const NATION_ALIASES = {
  'south korea': 'korea republic',
  usa: 'united states',
  'ivory coast': 'cote d ivoire',
  turkey: 'turkiye',
  czechia: 'czech republic',
};

// Club-name words that carry no meaning ("FC Barcelona" == "Barcelona").
const CLUB_NOISE = new Set(['fc', 'cf', 'ac', 'afc', 'sc', 'ssc', 'as', 'club', 'de', 'the', 'calcio', 'football']);
const CLUB_ALIASES = { munchen: 'munich', milano: 'milan' };

// Letters NFD can't split into a base letter plus an accent.
const SPECIAL = { ø: 'o', ł: 'l', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i', ð: 'd', þ: 'th' };

// ---------------------------------------------------------------- args

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dirAt = args.indexOf('--dir');
const RAW_DIR = dirAt === -1 ? join(ROOT, 'data', 'raw') : args[dirAt + 1];

// ---------------------------------------------------------------- main

const data = JSON.parse(readFileSync(DATA, 'utf8'));
let checkedAny = false;
let applied = 0;

for (const edition of data.editions) {
  const csvPath = findCsv(edition.id);
  if (!csvPath) continue;
  checkedAny = true;
  applied += checkEdition(edition, csvPath);
}

if (!checkedAny) {
  console.error(`No CSVs found in ${RAW_DIR}.`);
  console.error('Expected e.g. players_22.csv (FIFA 22) or players_24.csv (EA FC 24).');
  process.exit(1);
}

if (APPLY && applied) {
  writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nApplied ${applied} rating fix(es) to data/players.json.`);
  console.log('Review:  git diff data/players.json');
  console.log('Undo:    git checkout data/players.json');
} else if (!APPLY) {
  console.log('\nReport only - nothing was changed. Re-run with --apply to write the confident fixes.');
}

// ---------------------------------------------------------------- per edition

/** Returns the number of fixes applied to `data`. */
function checkEdition(edition, csvPath) {
  const rows = loadRows(csvPath);
  const ours = data.players.filter((p) => p.ratings[edition.id]);

  console.log(`\n=== ${edition.label}: ${ours.length} players vs ${csvPath.split(/[\\/]/).pop()} (${rows.length.toLocaleString()} rows) ===`);
  describeSnapshot(rows);

  const agree = [];
  const differ = [];
  const notFound = [];
  const ambiguous = [];
  const clubNotes = [];

  for (const player of ours) {
    const entry = player.ratings[edition.id];
    const m = matchPlayer(player, entry, edition, rows);

    if (m.status === 'not-found') { notFound.push(player); continue; }
    if (m.status === 'ambiguous') { ambiguous.push({ player, candidates: m.candidates }); continue; }

    const row = m.row;
    if (row.ovr === entry.ovr) agree.push(player);
    else differ.push({ player, entry, row });
    if (!clubMatches(entry.club, row.club)) clubNotes.push({ player, entry, row });
  }

  console.log(
    `${agree.length} agree · ${differ.length} differ · ${notFound.length} not found · ${ambiguous.length} ambiguous`
  );

  if (differ.length) {
    console.log('\nRatings that differ (ours -> dataset). Check the "matched to" column is the right person:');
    differ.sort((a, b) => Math.abs(b.row.ovr - b.entry.ovr) - Math.abs(a.row.ovr - a.entry.ovr));
    for (const { player, entry, row } of differ) {
      const d = row.ovr - entry.ovr;
      console.log(
        `  ${player.name.padEnd(24)} ${String(entry.ovr).padStart(2)} -> ${String(row.ovr).padStart(2)}  (${d > 0 ? '+' : ''}${d})` +
          `   matched to: ${describeRow(row)}`
      );
    }
  }

  if (notFound.length) {
    console.log('\nNot found (spelling differs, or not in this dataset). Pin them in OVERRIDES if you find their id:');
    for (const p of notFound) console.log(`  ${p.name} (${p.nation}, born ${p.born})`);
  }

  if (ambiguous.length) {
    console.log('\nAmbiguous (more than one plausible match; never applied). Pin the right one in OVERRIDES:');
    for (const { player, candidates } of ambiguous) {
      console.log(`  ${player.name}:`);
      for (const c of candidates) console.log(`      ${describeRow(c.row)}  ovr ${c.row.ovr}`);
    }
  }

  if (clubNotes.length) {
    console.log('\nClub differences (informational; often just SoFIFA naming, never applied):');
    for (const { player, entry, row } of clubNotes) {
      console.log(`  ${player.name.padEnd(24)} ours: ${entry.club}  |  dataset: ${row.club}`);
    }
  }

  if (!APPLY) return 0;
  for (const { entry, row } of differ) entry.ovr = row.ovr;
  return differ.length;
}

// ---------------------------------------------------------------- matching

/**
 * Find a player's row. Name similarity decides who is a candidate; birth year,
 * nationality and club break ties. A match is confident only if it clearly
 * beats the runner-up and either the birth year or the club lines up.
 */
function matchPlayer(player, entry, edition, rows) {
  const pinned = OVERRIDES[player.id]?.[edition.id];
  if (pinned !== undefined) {
    const row = rows.find((r) => r.id === String(pinned));
    return row ? { status: 'ok', row } : { status: 'not-found' };
  }

  const ourTokens = tokens(player.name);
  const scored = [];
  for (const row of rows) {
    const name = nameScore(player.name, ourTokens, row);
    if (!name) continue;

    let score = name;
    const birthGap = player.born && row.born ? Math.abs(player.born - row.born) : null;
    if (birthGap === 0) score += 3;
    else if (birthGap === 1) score += 1;
    else if (birthGap !== null) score -= 3;
    if (nation(player.nation) === nation(row.nation)) score += 2;
    const club = clubMatches(entry.club, row.club);
    if (club) score += 3;

    scored.push({ row, score, solid: birthGap !== null ? birthGap <= 1 || club : club });
  }

  if (!scored.length) return { status: 'not-found' };
  scored.sort((a, b) => b.score - a.score);

  const [best, next] = scored;
  const clear = !next || best.score - next.score >= 2;
  if (clear && best.solid) return { status: 'ok', row: best.row };
  return { status: 'ambiguous', candidates: scored.slice(0, 3) };
}

/** 3 = full name match, 2 = partial (mononym, "L. Messi" style), 0 = no. */
function nameScore(ourName, ours, row) {
  if (norm(ourName) === norm(row.short)) return 3;
  if (ours.every((t) => row.longSet.has(t))) return 3;
  if (ours.length === 1) return row.shortSet.has(ours[0]) || row.longSet.has(ours[0]) ? 2 : 0;

  // "L. Messi" / "H. Son": only when the short name really is initial + surname.
  // The surname can be our first word (Korean, Chinese order: "Son Heung-min")
  // or our last word, and the initial must start one of our other words.
  const short = row.shortTokens;
  if (short.length === 2 && short[0].length === 1) {
    const [initial, surname] = short;
    const at = [0, ours.length - 1].find((i) => ours[i] === surname);
    if (at !== undefined && ours.some((t, i) => i !== at && t[0] === initial)) return 2;
  }
  // "Camavinga", "ter Stegen": the dataset uses only the end of our name.
  // Deliberately no matching on first names alone ("Gabriel" would also fit
  // Gabriel Jesus) - pin those in OVERRIDES instead.
  const tail = ours.slice(ours.length - short.length);
  if (short.length && short.length < ours.length && short.every((t, i) => t === tail[i])) return 2;

  if (ours.every((t) => row.longSet.has(t) || row.shortSet.has(t))) return 2;
  return 0;
}

function clubMatches(a, b) {
  const x = clubTokens(a);
  const y = clubTokens(b);
  if (!x.length || !y.length) return false;
  const ys = new Set(y);
  const shared = x.filter((t) => ys.has(t)).length;
  return shared === x.length || shared === y.length;
}

// ---------------------------------------------------------------- loading

function findCsv(editionId) {
  const num = editionId.match(/\d+$/)?.[0];
  for (const name of [`players_${num}.csv`, `${editionId}.csv`]) {
    const p = join(RAW_DIR, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function loadRows(csvPath) {
  const raw = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = Object.keys(raw[0] || {});
  const has = (names) => names.some((n) => header.includes(n));
  if (!has(COLUMNS.ovr) || (!has(COLUMNS.short) && !has(COLUMNS.long))) {
    console.error(`${csvPath} is missing a name or "overall" column. Columns found:\n  ${header.join(', ')}`);
    process.exit(1);
  }

  let source = raw;
  if (has(COLUMNS.card)) {
    source = raw.filter((r) => BASE_CARD.test(pick(r, COLUMNS.card).toLowerCase()));
    console.log(`Card types: kept ${source.length.toLocaleString()} base cards, skipped ${(raw.length - source.length).toLocaleString()} special cards`);
  }

  const rows = source
    .map((r) => {
      const short = pick(r, COLUMNS.short);
      const long = pick(r, COLUMNS.long) || short;
      const dob = pick(r, COLUMNS.dob);
      return {
        id: pick(r, COLUMNS.id),
        short,
        long,
        shortTokens: tokens(short),
        shortSet: new Set(tokens(short)),
        longSet: new Set(tokens(long)),
        ovr: Number(pick(r, COLUMNS.ovr)),
        club: pick(r, COLUMNS.club),
        nation: pick(r, COLUMNS.nation),
        dob,
        born: dob ? Number(dob.slice(0, 4)) || null : null,
        update: pick(r, COLUMNS.update),
      };
    })
    .filter((r) => Number.isFinite(r.ovr) && r.ovr > 0);

  // Some exports hold several in-season updates per player. Keep the earliest,
  // which is closest to the launch rating.
  if (!rows.some((r) => r.update) || !rows.some((r) => r.id)) return rows;
  const byId = new Map();
  for (const r of rows) {
    const prev = byId.get(r.id);
    if (!prev || compareUpdates(r.update, prev.update) < 0) byId.set(r.id, r);
  }
  return [...byId.values()];
}

function compareUpdates(a, b) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b));
}

/** Ratings change during a season, so say which snapshot this file is. */
function describeSnapshot(rows) {
  const updates = [...new Set(rows.map((r) => r.update).filter(Boolean))].sort(compareUpdates);
  if (!updates.length) {
    console.log('Snapshot date: unknown (no update column). Ratings may be launch or a later in-season update,');
    console.log('so a difference of 1-2 can be timing rather than an error.');
  } else {
    console.log(`Snapshot: update ${updates[0]}${updates.length > 1 ? ` to ${updates[updates.length - 1]} (earliest kept per player)` : ''}`);
  }
}

// ---------------------------------------------------------------- text helpers

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[øłđßæœıðþ]/g, (c) => SPECIAL[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function nation(s) {
  const n = tokens(s).join(' ');
  return NATION_ALIASES[n] || n;
}

function clubTokens(s) {
  return tokens(s)
    .map((t) => CLUB_ALIASES[t] || t)
    .filter((t) => !CLUB_NOISE.has(t) && !/^\d+$/.test(t));
}

function describeRow(r) {
  return [r.short, r.club, r.nation, r.dob && `b. ${r.dob}`, r.id && `id ${r.id}`].filter(Boolean).join(' · ');
}
