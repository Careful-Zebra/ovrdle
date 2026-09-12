import {
  buildPuzzle,
  buildPracticePuzzle,
  dateKey,
  puzzleNumber,
  msUntilTomorrow,
  MAX_TRIES,
  PLAYERS_PER_PUZZLE,
} from './puzzle.js';
import {
  loadProgress,
  saveProgress,
  loadStats,
  recordResult,
  loadPractice,
  savePractice,
  loadPracticeStats,
  recordPracticeResult,
} from './storage.js';
import { buildShareText, share } from './share.js';

const MODE_KEY = 'ovrdle:mode';

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
  modes: document.getElementById('modes'),
};

const state = {
  mode: 'daily', // 'daily' | 'practice'
  data: null,
  items: [],
  slots: [],
  current: 0,
  typed: '',
  done: false,
  puzzleNo: 0, // daily
  practiceSeed: null, // practice
  practiceRound: 0, // practice
  countdownTimer: null,
};

// ---------------------------------------------------------------- boot

init();

async function init() {
  try {
    const res = await fetch('./data/players.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    el.board.innerHTML =
      `<li class="card"><div class="card-name">Couldn't load the players</div>` +
      `<div class="card-sub">${escapeHtml(String(err.message || err))}. ` +
      `Open the site over http://, not file://. Run <code>npm run dev</code> and reload.</div></li>`;
    return;
  }

  renderKeypad();

  el.help.addEventListener('click', showHelp);
  el.stats.addEventListener('click', () => (state.done ? showResults() : showStats()));
  el.modalClose.addEventListener('click', closeModal);
  el.scrim.addEventListener('click', (e) => {
    if (e.target === el.scrim) closeModal();
  });
  el.modes.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) switchMode(btn.dataset.mode);
  });
  document.addEventListener('keydown', onKeydown);

  enterMode(loadMode(), { firstLoad: true });
}

// ---------------------------------------------------------------- modes

function switchMode(mode) {
  if (mode === state.mode) return;
  closeModal();
  enterMode(mode, {});
}

function enterMode(mode, { firstLoad = false } = {}) {
  state.mode = mode;
  saveMode(mode);
  state.typed = '';

  if (mode === 'practice') enterPractice();
  else enterDaily();

  renderModes();
  render();

  if (state.done) showResults();
  else if (firstLoad && mode === 'daily' && !hasSeenHelp()) {
    markHelpSeen();
    showHelp();
  }
}

function enterDaily() {
  const key = dateKey();
  state.puzzleNo = puzzleNumber(key);
  state.items = buildPuzzle(state.data, state.puzzleNo);

  const saved = loadProgress(state.puzzleNo);
  if (saved) {
    state.slots = saved.slots;
    state.done = saved.done;
    state.current = firstOpenSlot(saved.current);
  } else {
    state.slots = freshSlots();
    state.current = 0;
    state.done = false;
  }

  el.meta.textContent = `Puzzle #${state.puzzleNo} · ${formatDate(key)}`;
}

function enterPractice() {
  const saved = loadPractice();
  if (saved && saved.seed) {
    state.practiceSeed = saved.seed;
    state.practiceRound = saved.round || 1;
    state.items = buildPracticePuzzle(state.data, saved.seed);
    state.slots = saved.slots;
    state.done = saved.done;
    state.current = firstOpenSlot(saved.current);
    setPracticeMeta();
  } else {
    startPracticeRound();
  }
}

function startPracticeRound() {
  state.practiceRound = (state.practiceRound || 0) + 1;
  state.practiceSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  state.items = buildPracticePuzzle(state.data, state.practiceSeed);
  state.slots = freshSlots();
  state.current = 0;
  state.done = false;
  state.typed = '';
  setPracticeMeta();
  persist();
}

function setPracticeMeta() {
  const st = loadPracticeStats();
  el.meta.textContent = st.rounds
    ? `Practice · Round ${state.practiceRound} · ${st.rounds} done`
    : `Practice · Round ${state.practiceRound}`;
}

function freshSlots() {
  return state.items.map(() => ({ guesses: [], solved: false, failed: false }));
}

/** Index of an open (unsolved, unfailed) slot, preferring `prefer`, else the first. */
function firstOpenSlot(prefer = 0) {
  const open = (i) => state.slots[i] && !state.slots[i].solved && !state.slots[i].failed;
  if (open(prefer)) return prefer;
  const i = state.slots.findIndex((_, n) => open(n));
  return i === -1 ? 0 : i;
}

/** Next open slot after `from`, wrapping; -1 when every slot is done. */
function nextOpenSlot(from) {
  for (let n = 1; n <= state.slots.length; n++) {
    const i = (from + n) % state.slots.length;
    const s = state.slots[i];
    if (!s.solved && !s.failed) return i;
  }
  return -1;
}

/** Make a card the keyboard target. Ignored for solved/failed cards. */
function focusCard(i) {
  const s = state.slots[i];
  if (state.done || !s || s.solved || s.failed || i === state.current) return;
  state.current = i;
  state.typed = '';
  persist();
  render();
}

function renderModes() {
  el.modes.querySelectorAll('[data-mode]').forEach((b) => {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'practice' ? 'practice' : 'daily';
  } catch {
    return 'daily';
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
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

  if (state.typed.length < 2) return toast('Give me two digits');

  const guess = Number(state.typed);
  if (guess < MIN_RATING) return toast(`Ratings go from ${MIN_RATING} to ${MAX_RATING}`);
  if (slot.guesses.includes(guess)) return toast('You already tried that one');

  slot.guesses.push(guess);
  state.typed = '';

  if (guess === item.answer) slot.solved = true;
  else if (slot.guesses.length >= MAX_TRIES) slot.failed = true;

  if (slot.solved || slot.failed) {
    const next = nextOpenSlot(state.current);
    if (next === -1) finish();
    else state.current = next;
  }

  persist();
  render();

  if (state.done) setTimeout(showResults, 700);
}

function finish() {
  state.done = true;
  const solved = state.slots.filter((s) => s.solved).length;
  if (state.mode === 'practice') recordPracticeResult(solved);
  else recordResult(state.puzzleNo, solved);
}

function persist() {
  if (state.mode === 'practice') {
    savePractice({
      seed: state.practiceSeed,
      round: state.practiceRound,
      slots: state.slots,
      current: state.current,
      done: state.done,
    });
  } else {
    saveProgress({
      puzzleNo: state.puzzleNo,
      slots: state.slots,
      current: state.current,
      done: state.done,
    });
  }
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
  const isOpen = !state.done && !slot.solved && !slot.failed;

  li.className = 'card';
  if (isActive) li.classList.add('is-active');
  if (slot.solved) li.classList.add('is-solved');
  if (slot.failed) li.classList.add('is-failed');

  const facts = [item.position, item.club, item.nation];
  if (item.age) facts.push(`age ${item.age}`);

  const photoSrc = item.photo && item.photo.file ? `./data/img/${item.photo.file}` : '';

  li.innerHTML =
    `<div class="card-top">` +
    `<div class="card-avatar">${photoSrc ? `<img src="${escapeHtml(photoSrc)}" alt="" loading="lazy" />` : ''}</div>` +
    `<div class="card-info">` +
    `<div class="card-head">` +
    `<div class="card-name">${escapeHtml(item.name)}</div>` +
    `<div class="card-index">${i + 1}/${PLAYERS_PER_PUZZLE}</div>` +
    `</div>` +
    `<div class="card-sub"><span class="badge">${escapeHtml(item.edition.label)}</span>` +
    facts.map((f) => `<span>${escapeHtml(f)}</span>`).join('<span class="dot">·</span>') +
    `</div>` +
    `</div>` +
    `</div>`;

  // If a referenced photo 404s, drop the <img> so the silhouette shows through.
  const avatarImg = li.querySelector('.card-avatar img');
  if (avatarImg) avatarImg.addEventListener('error', () => avatarImg.remove());

  li.appendChild(renderGuesses(item, slot, isActive));

  if (isOpen && !isActive) {
    li.classList.add('is-focusable');
    li.addEventListener('click', () => focusCard(i));
  }
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

  const isOpen = !slot.solved && !slot.failed && !state.done;
  if (isOpen) {
    const used = slot.guesses.length;
    if (isActive) row.appendChild(tile(state.typed.padEnd(2, ' '), 'is-typing'));
    for (let i = used + (isActive ? 1 : 0); i < MAX_TRIES; i++) row.appendChild(tile('', ''));

    const last = slot.guesses[slot.guesses.length - 1];
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.innerHTML = last
      ? `<strong>${last < item.answer ? 'Higher' : 'Lower'}</strong> · ${MAX_TRIES - used} left`
      : isActive
        ? `${MAX_TRIES} tries`
        : `Tap to guess`;
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
      `<p>Five footballers, one from each of the last five games (FIFA 22 up to EA FC 26). Your job is to guess each one's <strong>overall rating</strong> in that edition.</p>` +
      `<ul>` +
      `<li><strong>Three tries</strong> each.</li>` +
      `<li>Miss, and I'll only tell you <strong>higher</strong> or <strong>lower</strong>.</li>` +
      `<li>All five sit on the board at once, so take them in whatever order you like. Fresh five every day.</li>` +
      `<li>Can't get enough? Hit <strong>Practice</strong> for endless rounds.</li>` +
      `</ul>` +
      `<h3>Reading a guess</h3>` +
      `<div class="example">${tileHtml('84', 'is-miss', '▲')}<span>Too low, go higher.</span></div>` +
      `<div class="example">${tileHtml('90', 'is-miss', '▼')}<span>Too high, go lower.</span></div>` +
      `<div class="example">${tileHtml('89', 'is-hit')}<span>Nailed it. On to the next.</span></div>` +
      `<div class="example">${tileHtml('89', 'is-answer')}<span>Out of tries, here's the answer.</span></div>` +
      `<p class="note">These are base overalls, not in-form or special cards.</p>` +
      `<p class="note">Photos from Wikimedia Commons. <button type="button" class="linkish" id="show-credits">Photo credits</button></p>`
  );
  const credits = document.getElementById('show-credits');
  if (credits) credits.addEventListener('click', showCredits);
}

function showCredits() {
  const players = (state.data?.players || [])
    .filter((p) => p.photo)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = players
    .map((p) => {
      const ph = p.photo;
      const who = ph.source
        ? `<a href="${escapeHtml(ph.source)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
        : escapeHtml(p.name);
      const lic = ph.licenseUrl
        ? `<a href="${escapeHtml(ph.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(ph.license)}</a>`
        : escapeHtml(ph.license);
      return `<li>${who}: ${escapeHtml(ph.by)} (${lic})</li>`;
    })
    .join('');

  openModal(
    `<h2 id="modal-title">Photo credits</h2>` +
      `<p>Player photos come from <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>, used under Creative Commons or public-domain licences. Thanks to the photographers.</p>` +
      `<ul class="credits">${rows}</ul>` +
      `<button class="btn btn-ghost" id="btn-back-help">BACK</button>`
  );
  const back = document.getElementById('btn-back-help');
  if (back) back.addEventListener('click', showHelp);
}

function showStats() {
  if (state.mode === 'practice') {
    openModal(`<h2 id="modal-title">Practice</h2>${practiceStatsHtml(loadPracticeStats())}`);
  } else {
    openModal(`<h2 id="modal-title">Statistics</h2>${statsHtml(loadStats(), null)}`);
  }
}

function showResults() {
  if (state.mode === 'practice') return showPracticeResults();
  return showDailyResults();
}

function recapHtml() {
  return state.items
    .map((item, i) => {
      const slot = state.slots[i];
      const mark = slot.solved
        ? `<span class="ovr ok">${item.answer} · ${slot.guesses.length}/${MAX_TRIES}</span>`
        : `<span class="ovr no">${item.answer} · missed</span>`;
      return `<li><span>${escapeHtml(item.name)} <span class="note">${escapeHtml(item.edition.label)}</span></span>${mark}</li>`;
    })
    .join('');
}

function showPracticeResults() {
  const solved = state.slots.filter((s) => s.solved).length;

  openModal(
    `<h2 id="modal-title">${solved}/5 correct</h2>` +
      `<ul class="recap">${recapHtml()}</ul>` +
      practiceStatsHtml(loadPracticeStats()) +
      `<button class="btn" id="btn-next">NEXT ROUND</button>` +
      `<button class="btn btn-ghost" id="btn-to-daily">BACK TO DAILY</button>`
  );

  document.getElementById('btn-next').addEventListener('click', () => {
    closeModal();
    startPracticeRound();
    render();
  });
  document.getElementById('btn-to-daily').addEventListener('click', () => switchMode('daily'));
}

function practiceStatsHtml(stats) {
  const avg = stats.rounds ? (stats.solvedTotal / stats.rounds).toFixed(1) : '0.0';
  const max = Math.max(1, ...stats.distribution);

  const rows = stats.distribution
    .map((count, solved) => {
      const width = Math.max(8, Math.round((count / max) * 100));
      return (
        `<div class="dist-row"><span>${solved}</span>` +
        `<span class="dist-bar" style="width:${width}%">${count}</span></div>`
      );
    })
    .join('');

  return (
    `<h3>Practice record</h3>` +
    `<div class="stat-grid">` +
    `<div class="stat"><b>${stats.rounds}</b><span>Rounds</span></div>` +
    `<div class="stat"><b>${avg}</b><span>Avg /5</span></div>` +
    `<div class="stat"><b>${stats.perfect}</b><span>Perfect</span></div>` +
    `<div class="stat"><b>${stats.best}</b><span>Best</span></div>` +
    `</div>` +
    `<h3>Players solved per round</h3>` +
    `<div class="dist">${rows}</div>`
  );
}

function showDailyResults() {
  const stats = loadStats();
  const solved = state.slots.filter((s) => s.solved).length;

  openModal(
    `<h2 id="modal-title">${solved}/5 correct</h2>` +
      `<ul class="recap">${recapHtml()}</ul>` +
      statsHtml(stats, solved) +
      `<button class="btn" id="btn-share">SHARE RESULT</button>` +
      `<div class="countdown">Next puzzle in <b id="countdown">--:--:--</b></div>`
  );

  document.getElementById('btn-share').addEventListener('click', async () => {
    const result = await share(buildShareText(state.puzzleNo, state.slots));
    if (result === 'copied') toast('Copied, go paste it');
    else if (result === 'failed') toast("Couldn't copy that");
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
    return localStorage.getItem('ovrdle:seen-help') === '1';
  } catch {
    return true;
  }
}

function markHelpSeen() {
  try {
    localStorage.setItem('ovrdle:seen-help', '1');
  } catch {
    /* ignore */
  }
}
