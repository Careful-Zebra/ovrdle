import { buildPuzzle, dateKey, puzzleNumber, msUntilTomorrow, MAX_TRIES, PLAYERS_PER_PUZZLE } from './puzzle.js';
import { loadProgress, saveProgress, loadStats, recordResult } from './storage.js';
import { buildShareText, share } from './share.js';

const MIN_RATING = 40;
const MAX_RATING = 99;

const el = {
  meta: document.getElementById('meta'),
  board: document.getElementById('board'),
  keypad: document.getElementById('keypad'),
  toast: document.getElementById('toast'),
  scrim: document.getElementById('modal-scrim'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  help: document.getElementById('btn-help'),
  stats: document.getElementById('btn-stats'),
};

const state = {
  items: [],
  slots: [],
  current: 0,
  typed: '',
  done: false,
  puzzleNo: 0,
  countdownTimer: null,
};

// ---------------------------------------------------------------- boot

init();

async function init() {
  let data;
  try {
    const res = await fetch('./data/players.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    el.board.innerHTML =
      `<li class="card"><div class="card-name">Could not load player data</div>` +
      `<div class="card-sub">${escapeHtml(String(err.message || err))}. ` +
      `Open the site over http:// rather than file:// &mdash; run <code>npm run dev</code>.</div></li>`;
    return;
  }

  const key = dateKey();
  state.puzzleNo = puzzleNumber(key);
  state.items = buildPuzzle(data, state.puzzleNo);

  const saved = loadProgress(state.puzzleNo);
  if (saved) {
    state.slots = saved.slots;
    state.current = saved.current;
    state.done = saved.done;
  } else {
    state.slots = state.items.map(() => ({ guesses: [], solved: false, failed: false }));
  }

  el.meta.textContent = `Puzzle #${state.puzzleNo} · ${formatDate(key)}`;

  renderKeypad();
  render();

  el.help.addEventListener('click', showHelp);
  el.stats.addEventListener('click', () => (state.done ? showResults() : showStats()));
  el.modalClose.addEventListener('click', closeModal);
  el.scrim.addEventListener('click', (e) => {
    if (e.target === el.scrim) closeModal();
  });
  document.addEventListener('keydown', onKeydown);

  if (state.done) showResults();
  else if (!hasSeenHelp()) {
    markHelpSeen();
    showHelp();
  }
}

// ---------------------------------------------------------------- input

function onKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!el.scrim.hidden) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    typeDigit(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    deleteDigit();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  }
}

function typeDigit(d) {
  if (state.done || state.typed.length >= 2) return;
  state.typed += d;
  render();
}

function deleteDigit() {
  if (state.done || !state.typed) return;
  state.typed = state.typed.slice(0, -1);
  render();
}

function submit() {
  if (state.done) return;

  const slot = state.slots[state.current];
  const item = state.items[state.current];

  if (state.typed.length < 2) return toast('Enter a two-digit rating');

  const guess = Number(state.typed);
  if (guess < MIN_RATING) return toast(`Ratings run ${MIN_RATING}–${MAX_RATING}`);
  if (slot.guesses.includes(guess)) return toast('Already guessed');

  slot.guesses.push(guess);
  state.typed = '';

  if (guess === item.answer) slot.solved = true;
  else if (slot.guesses.length >= MAX_TRIES) slot.failed = true;

  if (slot.solved || slot.failed) {
    if (state.current >= state.items.length - 1) finish();
    else state.current += 1;
  }

  persist();
  render();

  if (state.done) setTimeout(showResults, 700);
}

function finish() {
  state.done = true;
  recordResult(state.puzzleNo, state.slots.filter((s) => s.solved).length);
}

function persist() {
  saveProgress({
    puzzleNo: state.puzzleNo,
    slots: state.slots,
    current: state.current,
    done: state.done,
  });
}

// ---------------------------------------------------------------- render

function render() {
  el.board.innerHTML = '';
  state.items.forEach((item, i) => el.board.appendChild(renderCard(item, state.slots[i], i)));

  const active = state.done ? null : state.slots[state.current];
  el.keypad.querySelectorAll('[data-digit]').forEach((b) => {
    b.disabled = state.done || state.typed.length >= 2;
  });
  el.keypad.querySelector('[data-action="del"]').disabled = state.done || !state.typed;
  el.keypad.querySelector('[data-action="enter"]').disabled =
    state.done || state.typed.length < 2 || !active;

  const activeCard = el.board.querySelector('.is-active');
  if (activeCard) activeCard.scrollIntoView({ block: 'nearest' });
}

function renderCard(item, slot, i) {
  const li = document.createElement('li');
  const isActive = !state.done && i === state.current;
  const isLocked = !state.done && i > state.current;

  li.className = 'card';
  if (isActive) li.classList.add('is-active');
  if (isLocked) li.classList.add('is-locked');
  if (slot.solved) li.classList.add('is-solved');
  if (slot.failed) li.classList.add('is-failed');

  if (isLocked) {
    li.innerHTML =
      `<div class="card-head"><div class="card-name">— — —</div>` +
      `<div class="card-index">${i + 1}/${PLAYERS_PER_PUZZLE}</div></div>` +
      `<div class="card-sub">Locked</div>`;
    return li;
  }

  const facts = [item.position, item.club, item.nation];
  if (item.age) facts.push(`age ${item.age}`);

  li.innerHTML =
    `<div class="card-head">` +
    `<div class="card-name">${escapeHtml(item.name)}</div>` +
    `<div class="card-index">${i + 1}/${PLAYERS_PER_PUZZLE}</div>` +
    `</div>` +
    `<div class="card-sub"><span class="badge">${escapeHtml(item.edition.label)}</span>` +
    facts.map((f) => `<span>${escapeHtml(f)}</span>`).join('<span class="dot">·</span>') +
    `</div>`;

  li.appendChild(renderGuesses(item, slot, isActive));
  return li;
}

function renderGuesses(item, slot, isActive) {
  const row = document.createElement('div');
  row.className = 'guesses';

  slot.guesses.forEach((g) => {
    const hit = g === item.answer;
    row.appendChild(
      tile(String(g), hit ? 'is-hit' : 'is-miss', hit ? null : g < item.answer ? '▲' : '▼')
    );
  });

  if (isActive && !slot.solved && !slot.failed) {
    const used = slot.guesses.length;
    row.appendChild(tile(state.typed.padEnd(2, ' '), 'is-typing'));
    for (let i = used + 1; i < MAX_TRIES; i++) row.appendChild(tile('', ''));

    const last = slot.guesses[slot.guesses.length - 1];
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.innerHTML = last
      ? `<strong>${last < item.answer ? 'Higher' : 'Lower'}</strong> · ${MAX_TRIES - used} left`
      : `${MAX_TRIES} tries`;
    row.appendChild(hint);
  }

  if (slot.failed) {
    row.appendChild(tile(String(item.answer), 'is-answer'));
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.innerHTML = `Actual <strong>${item.answer}</strong>`;
    row.appendChild(hint);
  }

  return row;
}

function tile(text, cls, arrow) {
  const d = document.createElement('div');
  d.className = `tile ${cls}`.trim();
  d.textContent = text;
  if (arrow) {
    const a = document.createElement('span');
    a.className = 'arrow';
    a.textContent = arrow;
    d.appendChild(a);
  }
  return d;
}

function renderKeypad() {
  const keys = [
    ...'1234567890'.split('').map((d) => ({ label: d, digit: d })),
    { label: 'DELETE', action: 'del', wide: true },
    { label: 'ENTER', action: 'enter', wide: true, enter: true },
  ];

  el.keypad.innerHTML = '';
  keys.forEach((k) => {
    const b = document.createElement('button');
    b.className = 'key' + (k.wide ? ' key-wide' : '') + (k.enter ? ' key-enter' : '');
    b.textContent = k.label;
    b.type = 'button';
    if (k.digit) b.dataset.digit = k.digit;
    if (k.action) b.dataset.action = k.action;
    b.addEventListener('click', () => {
      if (k.digit) typeDigit(k.digit);
      else if (k.action === 'del') deleteDigit();
      else submit();
    });
    el.keypad.appendChild(b);
  });

  // Row 3 is DELETE + a spacer + ENTER; the spacer keeps the 5-column grid tidy.
  const spacer = document.createElement('div');
  el.keypad.insertBefore(spacer, el.keypad.querySelector('[data-action="enter"]'));
}

// ---------------------------------------------------------------- modals

function openModal(html) {
  el.modalBody.innerHTML = html;
  el.scrim.hidden = false;
}

function closeModal() {
  el.scrim.hidden = true;
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function showHelp() {
  openModal(
    `<h2 id="modal-title">How to play</h2>` +
      `<p>Five footballers, each pinned to one edition of the game. Guess that player's <strong>overall rating</strong> in that edition.</p>` +
      `<ul>` +
      `<li><strong>Three tries</strong> per player.</li>` +
      `<li>After each miss you are told only <strong>higher</strong> or <strong>lower</strong>.</li>` +
      `<li>Players unlock one at a time. A new set every day.</li>` +
      `</ul>` +
      `<h3>Reading a guess</h3>` +
      `<div class="example">${tileHtml('84', 'is-miss', '▲')}<span>Too low &mdash; go higher.</span></div>` +
      `<div class="example">${tileHtml('90', 'is-miss', '▼')}<span>Too high &mdash; go lower.</span></div>` +
      `<div class="example">${tileHtml('89', 'is-hit')}<span>Exact. On to the next player.</span></div>` +
      `<div class="example">${tileHtml('89', 'is-answer')}<span>Out of tries &mdash; the answer, revealed.</span></div>` +
      `<p class="note">Ratings are overalls, not in-form or special cards.</p>`
  );
}

function showStats() {
  openModal(`<h2 id="modal-title">Statistics</h2>${statsHtml(loadStats(), null)}`);
}

function showResults() {
  const stats = loadStats();
  const solved = state.slots.filter((s) => s.solved).length;

  const recap = state.items
    .map((item, i) => {
      const slot = state.slots[i];
      const mark = slot.solved
        ? `<span class="ovr ok">${item.answer} · ${slot.guesses.length}/${MAX_TRIES}</span>`
        : `<span class="ovr no">${item.answer} · missed</span>`;
      return `<li><span>${escapeHtml(item.name)} <span class="note">${escapeHtml(item.edition.label)}</span></span>${mark}</li>`;
    })
    .join('');

  openModal(
    `<h2 id="modal-title">${solved}/5 correct</h2>` +
      `<ul class="recap">${recap}</ul>` +
      statsHtml(stats, solved) +
      `<button class="btn" id="btn-share">SHARE RESULT</button>` +
      `<div class="countdown">Next puzzle in <b id="countdown">--:--:--</b></div>`
  );

  document.getElementById('btn-share').addEventListener('click', async () => {
    const result = await share(buildShareText(state.puzzleNo, state.slots));
    if (result === 'copied') toast('Copied to clipboard');
    else if (result === 'failed') toast('Could not copy');
  });

  startCountdown();
}

function statsHtml(stats, todaySolved) {
  const avg = stats.played ? (stats.solvedTotal / stats.played).toFixed(1) : '0.0';
  const max = Math.max(1, ...stats.distribution);

  const rows = stats.distribution
    .map((count, solved) => {
      const width = Math.max(8, Math.round((count / max) * 100));
      const today = todaySolved === solved ? ' is-today' : '';
      return (
        `<div class="dist-row"><span>${solved}</span>` +
        `<span class="dist-bar${today}" style="width:${width}%">${count}</span></div>`
      );
    })
    .join('');

  return (
    `<h3>Your record</h3>` +
    `<div class="stat-grid">` +
    `<div class="stat"><b>${stats.played}</b><span>Played</span></div>` +
    `<div class="stat"><b>${avg}</b><span>Avg /5</span></div>` +
    `<div class="stat"><b>${stats.streak}</b><span>Streak</span></div>` +
    `<div class="stat"><b>${stats.maxStreak}</b><span>Best</span></div>` +
    `</div>` +
    `<h3>Players solved per day</h3>` +
    `<div class="dist">${rows}</div>`
  );
}

function startCountdown() {
  const node = document.getElementById('countdown');
  if (!node) return;
  const tick = () => {
    const ms = msUntilTomorrow();
    if (ms <= 0) return location.reload();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    node.textContent = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  };
  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

// ---------------------------------------------------------------- helpers

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 1600);
}

function tileHtml(text, cls, arrow) {
  return `<div class="tile ${cls}">${text}${arrow ? `<span class="arrow">${arrow}</span>` : ''}</div>`;
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hasSeenHelp() {
  try {
    return localStorage.getItem('fifa-wordle:seen-help') === '1';
  } catch {
    return true;
  }
}

function markHelpSeen() {
  try {
    localStorage.setItem('fifa-wordle:seen-help', '1');
  } catch {
    /* ignore */
  }
}
