/**
 * Minimal RFC-4180 parser: handles quoted fields, embedded commas and ""
 * escapes. Returns one object per row, keyed by lower-cased header names.
 */
export function parseCsv(text) {
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

/** First non-empty value among several possible column names. */
export function pick(row, names) {
  for (const n of names) if (row[n]) return row[n];
  return '';
}
