// Public scores. Anyone can read the board and add their own name. Nobody can edit or delete a row.
const URL = 'https://nqzhtltwznuvxjpfvtpg.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xemh0bHR3em51dnhqcGZ2dHBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4NjA0MjIsImV4cCI6MjA2MjQzNjQyMn0.NTXaXQxNTa1-nVKW6qKVNfLNt0A7bCtdbuY5rtmMEKE';
const NAME_KEY = 'one-night-name';
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/;

const board = document.getElementById('board');
const nameInput = document.getElementById('playerName');
const saveBtn = document.getElementById('saveScore');
const list = document.getElementById('boardList');
const note = document.getElementById('boardNote');

let pending = null;
let saving = false;

function headers(extra) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra };
}

function cleanName(raw) {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 20);
}

function clock(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
}

async function refresh() {
  const res = await fetch(`${URL}/rest/v1/one_night_scores?select=username,won,round_reached,seconds&order=score.desc,created_at.asc&limit=8`, {
    headers: headers(),
  });
  if (!res.ok) {
    if (!note.textContent) note.textContent = 'The board is quiet.';
    return;
  }
  const rows = await res.json();
  list.replaceChildren();
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = 'No names yet.';
    list.append(li);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.textContent = String(i + 1);
    const who = document.createElement('span');
    who.textContent = row.username;
    const result = document.createElement('span');
    result.textContent = row.won ? `DAWN ${clock(row.seconds)}` : `R${row.round_reached} ${clock(row.seconds)}`;
    li.append(rank, who, result);
    list.append(li);
  });
}

async function submit() {
  if (!pending || saving) return;
  const username = cleanName(nameInput.value);
  if (!NAME_OK.test(username)) {
    note.textContent = 'Use letters or numbers, up to 20 characters.';
    nameInput.focus();
    return;
  }
  localStorage.setItem(NAME_KEY, username);
  saving = true;
  saveBtn.textContent = 'Saving...';
  const res = await fetch(`${URL}/rest/v1/one_night_scores`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({
      username,
      won: !!pending.won,
      round_reached: pending.round,
      seconds: pending.seconds,
      map: pending.map,
      ending: pending.ending,
    }),
  });
  saving = false;
  if (!res.ok) {
    saveBtn.textContent = 'Save this run';
    note.textContent = 'The board did not take it.';
    return;
  }
  pending = null;
  saveBtn.hidden = true;
  note.textContent = 'Saved.';
  refresh();
}

export function mountLeaderboard() {
  nameInput.value = localStorage.getItem(NAME_KEY) || '';
  nameInput.addEventListener('input', () => localStorage.setItem(NAME_KEY, nameInput.value));
  board.addEventListener('click', (e) => e.stopPropagation());
  board.addEventListener('keydown', (e) => e.stopPropagation());
  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
  nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !saveBtn.hidden) { e.preventDefault(); submit(); }
  });
  refresh();
}

export function offerScore(run) {
  pending = run;
  saving = false;
  saveBtn.hidden = false;
  saveBtn.textContent = 'Save this run';
  note.textContent = '';
}
