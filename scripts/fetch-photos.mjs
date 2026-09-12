// Fetch Creative-Commons / public-domain player photos from Wikimedia and wire
// them into data/players.json with attribution.
//
//   node scripts/fetch-photos.mjs                 # all players missing a photo
//   node scripts/fetch-photos.mjs --only=messi,saka
//   node scripts/fetch-photos.mjs --limit=6
//   node scripts/fetch-photos.mjs --force         # refetch even if one exists
//
// We only keep images whose licence is CC-BY, CC-BY-SA, CC0 or public domain,
// and only when the page reads as a footballer, so we do not grab the wrong
// "Rodrigo". Anything uncertain is skipped and reported for manual review.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data', 'players.json');
const IMG_DIR = join(ROOT, 'data', 'img');
const UA = 'OVRdle/0.1 (https://ovrdle.com) photo-fetch';

// enwiki can't host non-free photos of living people, so lead images are free:
// CC-BY / CC-BY-SA, CC0, public domain, or the bare "Attribution" licence.
const OK_LICENCE = /(^cc[\s-]?by)|(^cc0)|(public\s*domain)|(^pd)|(^attribution$)/i;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

async function api(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Resolve a name to a Wikipedia summary (follows redirects). */
async function summary(name) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  return res.json();
}

/** Licence + author for a File: page, via imageinfo extmetadata. */
async function licenceFor(filename, width = 320) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent('File:' + filename)}` +
    `&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=${width}`;
  const j = await api(url);
  const info = j?.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const ext = info.extmetadata || {};
  return {
    thumbUrl: info.thumburl || info.url,
    by: stripHtml(ext.Artist?.value) || 'Unknown',
    license: stripHtml(ext.LicenseShortName?.value) || '',
    licenseUrl: stripHtml(ext.LicenseUrl?.value) || '',
  };
}

async function fetchOne(player) {
  const s = await summary(player.search || player.name);
  if (!s || s.type === 'disambiguation') return { skip: 'no clear page' };
  const desc = `${s.description || ''} ${s.extract || ''}`.toLowerCase();
  if (!/(footballer|football player|soccer)/.test(desc)) {
    return { skip: `not clearly a footballer ("${s.description || '?'}")` };
  }
  const orig = s.originalimage?.source || s.thumbnail?.source;
  if (!orig) return { skip: 'no image on page' };

  const filename = decodeURIComponent(orig.split('/').pop().split('?')[0]);
  const lic = await licenceFor(filename);
  if (!lic) return { skip: 'no image info' };
  if (!OK_LICENCE.test(lic.license)) return { skip: `licence not free ("${lic.license}")` };

  const ext = (filename.match(/\.(jpe?g|png)$/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const file = `${player.id}.${ext}`;
  const bin = await fetch(lic.thumbUrl, { headers: { 'User-Agent': UA } });
  if (!bin.ok) return { skip: `download HTTP ${bin.status}` };
  await writeFile(join(IMG_DIR, file), Buffer.from(await bin.arrayBuffer()));

  return {
    photo: {
      file,
      by: lic.by,
      license: lic.license,
      licenseUrl: lic.licenseUrl,
      source: s.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}`,
    },
    pageTitle: s.title,
  };
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });
  const data = JSON.parse(await readFile(DATA, 'utf8'));

  let targets = data.players;
  if (args.only) {
    const ids = new Set(String(args.only).split(','));
    targets = targets.filter((p) => ids.has(p.id));
  }
  if (!args.force) targets = targets.filter((p) => !p.photo);
  if (args.limit) targets = targets.slice(0, Number(args.limit));

  console.log(`Fetching photos for ${targets.length} player(s)...\n`);
  const skipped = [];
  let got = 0;

  for (const player of targets) {
    try {
      const r = await fetchOne(player);
      if (r.skip) {
        skipped.push([player.name, r.skip]);
        console.log(`  skip  ${player.name.padEnd(24)} ${r.skip}`);
      } else {
        player.photo = r.photo;
        got++;
        console.log(`  ok    ${player.name.padEnd(24)} ${r.photo.license} · ${r.photo.by}`);
      }
    } catch (err) {
      skipped.push([player.name, err.message]);
      console.log(`  ERR   ${player.name.padEnd(24)} ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite to the API
  }

  await writeFile(DATA, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nDone. ${got} added, ${skipped.length} skipped. players.json updated.`);
  if (skipped.length) console.log('Review skipped players by hand or add a "search" override in the data.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
