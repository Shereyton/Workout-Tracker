// Workout Tracker - Golden Version
// Schema v2, storage keys and normalization are source-of-truth here.

export const WT_SCHEMA_VERSION = 2;

export const WT_KEYS = {
  HISTORY: 'wt_history',
  META: 'wt_meta',
};

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

function nowISODateLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function parseDateLocal(str) {
  // Accept YYYY-MM-DD; clamp invalid to today
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return nowISODateLocal();
  const y = +m[1], mo = +m[2]-1, da = +m[3];
  const d = new Date(y, mo, da);
  if (isNaN(d.getTime())) return nowISODateLocal();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0,10);
}

function readJSON(key, fallback) {
  try {
    const raw = (isBrowser ? localStorage.getItem(key) : (globalThis.__MEM__?.[key])) ?? null;
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  const str = JSON.stringify(value);
  if (isBrowser) localStorage.setItem(key, str);
  else {
    globalThis.__MEM__ ||= {};
    globalThis.__MEM__[key] = str;
  }
}

function ensureHistory(obj) {
  return obj && typeof obj === 'object' ? obj : {};
}

// ---------- Session State ----------
let session = {
  active: false,
  startedAt: 0,
  updatedAt: 0,
  items: [], // {type:'strength'|'cardio', exercise, weight, reps, notes, distance, time}
};

function sessionMetaText(s) {
  if (!s.active) return 'No active session.';
  const started = new Date(s.startedAt).toLocaleTimeString();
  const count = s.items.length;
  return `Active since ${started} • ${count} item${count===1?'':'s'}`;
}

function canLogSet({ exercise, weight, reps }) {
  return Boolean(exercise && String(exercise).trim()) && Number.isFinite(+reps) && +reps > 0 && (!weight || Number.isFinite(+weight));
}
function canLogCardio({ exercise, distance, time }) {
  return Boolean(exercise && String(exercise).trim()) && (Number.isFinite(+distance) || Number.isFinite(+time));
}

export { canLogSet, canLogCardio };

function normalizeSet({ exercise, weight, reps, notes }) {
  return {
    type: 'strength',
    exercise: String(exercise || '').trim(),
    weight: weight === '' || weight === null || weight === undefined ? null : +weight,
    reps: +reps,
    notes: String(notes || '').trim(),
  };
}
function normalizeCardio({ exercise, distance, time, notes }) {
  return {
    type: 'cardio',
    exercise: String(exercise || '').trim(),
    distance: distance === '' || distance === null || distance === undefined ? null : +distance,
    time: time === '' || time === null || time === undefined ? null : +time,
    notes: String(notes || '').trim(),
  };
}
export { normalizeSet, normalizeCardio };

function ensureSessionActive() {
  if (!session.active) {
    session.active = true;
    session.startedAt = Date.now();
    session.updatedAt = session.startedAt;
    updateSessionUI();
  }
}
function clearSession() {
  session = { active:false, startedAt:0, updatedAt:0, items:[] };
  updateSessionUI();
}

function getHistory() {
  return ensureHistory(readJSON(WT_KEYS.HISTORY, {}));
}
function setHistory(h) {
  writeJSON(WT_KEYS.HISTORY, ensureHistory(h));
}

function mergeIntoHistory(history, date, lines) {
  const arr = history[date] || [];
  const existing = new Set(arr.map(s => s.trim()).filter(Boolean));
  for (const line of lines) {
    const t = String(line || '').trim();
    if (t && !existing.has(t)) {
      arr.push(t);
      existing.add(t);
    }
  }
  history[date] = arr;
  return history;
}

export { mergeIntoHistory };

// ---------- Calendar helpers (parsing & snapshot formatting) ----------
export function parseAiText(text) {
  // Supports lines like "Bench Press — Set 1: 225 lbs × 5"
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // ignore header lines like WORKOUT DATA - YYYY-MM-DD
    if (/WORKOUT DATA\s*-\s*\d{4}-\d{2}-\d{2}/i.test(t)) continue;
    out.push(t);
  }
  return out;
}

export function parseCsv(text) {
  // CSV: Exercise,Set,Weight,Reps
  const rows = [];
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return rows;
  const header = lines[0].trim().split(',').map(s=>s.trim().toLowerCase());
  const idx = {
    exercise: header.indexOf('exercise'),
    set: header.indexOf('set'),
    weight: header.indexOf('weight'),
    reps: header.indexOf('reps'),
  };
  if (idx.exercise<0 || idx.set<0 || idx.weight<0 || idx.reps<0) return rows;
  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',').map(s=>s.trim());
    const ex = cols[idx.exercise];
    const setNo = cols[idx.set];
    const w = cols[idx.weight];
    const r = cols[idx.reps];
    if (!ex || !r) continue;
    const unit = w ? `${w} lbs` : '';
    const setLabel = setNo ? `Set ${setNo}: ` : '';
    const line = `${ex} — ${setLabel}${unit}${unit&&r?' × ':''}${r||''}`.trim().replace(/\s+—\s+$/, ' —');
    rows.push(line);
  }
  return rows;
}

export function snapshotToLines(snap) {
  // Convert in-memory session snapshot into lines for history
  if (!snap || !Array.isArray(snap.items)) return [];
  const out = [];
  let counters = new Map(); // exercise -> set#
  for (const it of snap.items) {
    if (it.type === 'strength') {
      const ex = it.exercise || 'Exercise';
      const cur = (counters.get(ex) || 0) + 1;
      counters.set(ex, cur);
      const w = (it.weight==null||it.weight==='') ? '' : `${it.weight} lbs`;
      const x = w && it.reps ? ' × ' : '';
      const line = `${ex} — Set ${cur}: ${w}${x}${it.reps||''}`.trim();
      out.push(line);
    } else if (it.type === 'cardio') {
      const ex = it.exercise || 'Cardio';
      const parts = [];
      if (it.distance != null) parts.push(`${it.distance} mi`);
      if (it.time != null) parts.push(`${it.time} min`);
      const line = `${ex}${parts.length?': '+parts.join(' • '):''}`;
      out.push(line);
    }
  }
  return out;
}

// ---------- UI wiring ----------
function qs(sel){return document.querySelector(sel)}
function qsa(sel){return Array.from(document.querySelectorAll(sel))}

function setDisabled(el, v){ if (!el) return; el.disabled = !!v; }

function updateSessionUI() {
  if (!isBrowser) return;
  const meta = qs('#sessionMeta');
  const finish = qs('#finishSession');
  const resetBtn = qs('#resetSession');
  const clearBtn = qs('#clearSession');
  const saveToday = qs('#saveTodaySession');
  if (meta) meta.textContent = sessionMetaText(session);
  const hasItems = session.items.length > 0;
  setDisabled(finish, !session.active || !hasItems);
  setDisabled(resetBtn, !session.active && !hasItems);
  setDisabled(clearBtn, !hasItems);
  setDisabled(saveToday, !hasItems);
  const setList = qs('#setList');
  if (setList) {
    setList.innerHTML = '';
    session.items.forEach((it, i) => {
      const li = document.createElement('li');
      if (it.type === 'strength') {
        const w = it.weight==null ? '' : `${it.weight} lbs × `;
        li.textContent = `${it.exercise} — ${w}${it.reps}`;
      } else {
        const parts = [];
        if (it.distance != null) parts.push(`${it.distance} mi`);
        if (it.time != null) parts.push(`${it.time} min`);
        li.textContent = `${it.exercise}${parts.length?': '+parts.join(' • '):''}`;
      }
      const del = document.createElement('button');
      del.className = 'btn-mini del';
      del.textContent = 'Del';
      del.addEventListener('click', () => {
        session.items.splice(i,1);
        session.updatedAt = Date.now();
        updateSessionUI();
      });
      const actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.appendChild(del);
      li.appendChild(actions);
      setList.appendChild(li);
    });
  }
}

function bell(msg){ alert(msg); }

function loadExercisesList() {
  const list = qs('#exerciseList');
  if (!list || !Array.isArray(window.EXERCISES)) return;
  list.innerHTML = '';
  window.EXERCISES.forEach(name => {
    const o = document.createElement('option');
    o.value = name;
    list.appendChild(o);
  });
}

function addLoggedSet() {
  const exercise = qs('#exerciseInput').value;
  const weight = qs('#weightInput').value;
  const reps = qs('#repsInput').value;
  const notes = qs('#notesInput').value;
  if (!canLogSet({exercise, weight, reps})) {
    bell('Enter exercise and reps (weight optional).');
    return;
  }
  ensureSessionActive();
  session.items.push(normalizeSet({exercise, weight, reps, notes}));
  session.updatedAt = Date.now();
  updateSessionUI();
}

function addLoggedCardio() {
  const exercise = qs('#exerciseInput').value;
  const distance = qs('#weightInput').value;
  const time = qs('#repsInput').value;
  const notes = qs('#notesInput').value;
  if (!canLogCardio({exercise, distance, time})) {
    bell('Enter cardio name and at least distance or time.');
    return;
  }
  ensureSessionActive();
  session.items.push(normalizeCardio({exercise, distance, time, notes}));
  session.updatedAt = Date.now();
  updateSessionUI();
}

function clearSessionItems() {
  if (!session.items.length) return;
  if (!confirm('Clear current session items?')) return;
  session.items = [];
  session.updatedAt = Date.now();
  updateSessionUI();
}

function finishSession() {
  if (!session.items.length) { bell('No items to save.'); return; }
  const date = nowISODateLocal();
  const lines = snapshotToLines({items: session.items});
  const hist = getHistory();
  mergeIntoHistory(hist, date, lines);
  setHistory(hist);
  clearSession();
  // refresh day panel + calendar
  renderDay(date);
  renderCalendar(date);
  bell('Session saved to today.');
}

function resetSession() {
  if (!session.active && !session.items.length) return;
  if (!confirm('Reset the session?')) return;
  clearSession();
}

function saveTodaySession() {
  if (!session.items.length) { bell('Nothing to save'); return; }
  const date = nowISODateLocal();
  const lines = snapshotToLines({items: session.items});
  const hist = getHistory();
  mergeIntoHistory(hist, date, lines);
  setHistory(hist);
  renderDay(date);
  renderCalendar(date);
  bell('Saved to today.');
}

// ---------- Day + entry management ----------
let selectedDate = nowISODateLocal();

function renderDay(date) {
  selectedDate = parseDateLocal(date || selectedDate);
  const hist = getHistory();
  const list = hist[selectedDate] || [];
  const title = qs('#dayTitle');
  if (title) title.textContent = selectedDate;
  const entries = qs('#entries');
  if (entries) {
    entries.innerHTML = '';
    list.forEach((txt, idx) => {
      const li = document.createElement('li');
      li.className = 'entry-item';
      li.textContent = txt;
      const edit = document.createElement('button');
      edit.className = 'btn-mini edit';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        const nv = prompt('Edit entry:', txt);
        if (nv === null) return;
        const t = String(nv).trim();
        if (!t) {
          if (confirm('Empty = delete this entry?')) {
            list.splice(idx,1);
          }
        } else {
          list[idx] = t;
        }
        hist[selectedDate] = list;
        setHistory(hist);
        renderDay(selectedDate);
        renderCalendar(selectedDate);
      });
      const del = document.createElement('button');
      del.className = 'btn-mini del';
      del.textContent = 'Del';
      del.addEventListener('click', () => {
        if (!confirm('Delete this entry?')) return;
        list.splice(idx,1);
        hist[selectedDate] = list;
        setHistory(hist);
        renderDay(selectedDate);
        renderCalendar(selectedDate);
      });
      const actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.append(edit, del);
      li.appendChild(actions);
      entries.appendChild(li);
    });
  }
  setDisabled(qs('#resetDay'), list.length === 0);
}

function addEntry() {
  const el = qs('#entryInput');
  const t = String(el.value || '').trim();
  if (!t) return;
  const hist = getHistory();
  mergeIntoHistory(hist, selectedDate, [t]);
  setHistory(hist);
  el.value = '';
  renderDay(selectedDate);
  renderCalendar(selectedDate);
}

function resetDay() {
  const hist = getHistory();
  const list = hist[selectedDate] || [];
  if (!list.length) return;
  if (!confirm(`Clear ${list.length} entr${list.length===1?'y':'ies'} for ${selectedDate}?`)) return;
  hist[selectedDate] = [];
  setHistory(hist);
  renderDay(selectedDate);
  renderCalendar(selectedDate);
}

// ---------- Import / Export / Backup ----------
function safeParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

function exportHistory() {
  const hist = getHistory();
  const blob = new Blob([JSON.stringify(hist, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `workout-history-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

function importFileJson(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    const data = safeParseJson(String(fr.result || ''));
    if (!data || typeof data !== 'object') {
      bell('Invalid JSON.');
      return;
    }
    const hist = getHistory();
    let added=0;
    Object.entries(data).forEach(([date, lines])=>{
      if (!Array.isArray(lines)) return;
      const before = (hist[date]||[]).length;
      mergeIntoHistory(hist, date, lines);
      const after = (hist[date]||[]).length;
      added += Math.max(0, after - before);
    });
    setHistory(hist);
    renderDay(selectedDate);
    renderCalendar(selectedDate);
    bell(`Imported ${added} entr${added===1?'y':'ies'}.`);
  };
  fr.readAsText(file);
}

function pasteJson() {
  navigator.clipboard.readText().then(text=>{
    const data = safeParseJson(String(text||''));
    if (!data || typeof data !== 'object') { bell('Clipboard does not contain valid JSON.'); return; }
    const hist = getHistory();
    let added=0;
    Object.entries(data).forEach(([date, lines])=>{
      if (!Array.isArray(lines)) return;
      const before = (hist[date]||[]).length;
      mergeIntoHistory(hist, date, lines);
      const after = (hist[date]||[]).length;
      added += Math.max(0, after - before);
    });
    setHistory(hist);
    renderDay(selectedDate);
    renderCalendar(selectedDate);
    bell(`Imported ${added} entr${added===1?'y':'ies'}.`);
  }).catch(()=>bell('Clipboard read failed.'));
}

function importFromPaste() {
  const text = prompt('Paste JSON / AI text / CSV:');
  if (text == null) return;
  const trimmed = String(text).trim();
  const asJson = safeParseJson(trimmed);
  const hist = getHistory();
  let added=0, movedTo=null;

  if (asJson && typeof asJson === 'object') {
    Object.entries(asJson).forEach(([date, lines])=>{
      if (!Array.isArray(lines)) return;
      const before = (hist[date]||[]).length;
      mergeIntoHistory(hist, date, lines);
      const after = (hist[date]||[]).length;
      added += Math.max(0, after - before);
      if (!movedTo) movedTo = date;
    });
  } else if (/^Exercise\s*,/i.test(trimmed)) {
    const lines = parseCsv(trimmed);
    const d = selectedDate;
    const before = (hist[d]||[]).length;
    mergeIntoHistory(hist, d, lines);
    const after = (hist[d]||[]).length;
    added += Math.max(0, after - before);
    movedTo = d;
  } else {
    const lines = parseAiText(trimmed);
    const d = selectedDate;
    const before = (hist[d]||[]).length;
    mergeIntoHistory(hist, d, lines);
    const after = (hist[d]||[]).length;
    added += Math.max(0, after - before);
    movedTo = d;
  }

  setHistory(hist);
  renderDay(movedTo || selectedDate);
  renderCalendar(movedTo || selectedDate);
  bell(`Imported ${added} entr${added===1?'y':'ies'}.`);
}

function backupToClipboard() {
  const hist = getHistory();
  const text = JSON.stringify(hist);
  navigator.clipboard.writeText(text).then(()=>bell('Copied JSON to clipboard.'))
    .catch(()=>bell('Copy failed.'));
}

function backupToFile() { exportHistory(); }

function restoreFromFile(ev) {
  importFileJson(ev);
}

// ---------- Calendar (UI) ----------
import { renderCalendar, initCalendarNav } from './calendar.js';

function initDayPanel() {
  renderDay(selectedDate);
}

function initHistoryControls() {
  qs('#exportHistory')?.addEventListener('click', exportHistory);
  qs('#importHistoryFile')?.addEventListener('change', importFileJson);
  qs('#pasteJson')?.addEventListener('click', pasteJson);
  qs('#importFromPaste')?.addEventListener('click', importFromPaste);
  qs('#addEntry')?.addEventListener('click', addEntry);
  qs('#resetDay')?.addEventListener('click', resetDay);
}

function initSessionControls() {
  qs('#startSession')?.addEventListener('click', ()=>{
    ensureSessionActive(); updateSessionUI();
  });
  qs('#finishSession')?.addEventListener('click', finishSession);
  qs('#resetSession')?.addEventListener('click', resetSession);
  qs('#logSet')?.addEventListener('click', addLoggedSet);
  qs('#logCardio')?.addEventListener('click', addLoggedCardio);
  qs('#clearSession')?.addEventListener('click', clearSessionItems);
  qs('#saveTodaySession')?.addEventListener('click', saveTodaySession);
}

function initExercises() { loadExercisesList(); }

function initSchemaBadge() {
  const badge = qs('#schemaBadge');
  if (badge) badge.textContent = `v${WT_SCHEMA_VERSION}`;
}

function init() {
  if (!isBrowser) return;
  initSchemaBadge();
  initExercises();
  initSessionControls();
  initHistoryControls();
  initCalendarNav({
    onChange: (date)=>{ renderDay(date); },
  });
  renderCalendar(selectedDate);
  renderDay(selectedDate);
  updateSessionUI();
}

if (isBrowser) window.addEventListener('DOMContentLoaded', init);

// Expose some helpers for tests
if (!isBrowser) {
  globalThis.__api__ = {
    parseDateLocal, parseAiText, parseCsv, snapshotToLines,
    canLogSet, canLogCardio, normalizeSet, normalizeCardio,
    mergeIntoHistory,
  };
}
