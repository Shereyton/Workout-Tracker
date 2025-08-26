/**
 * Calendar utilities and month view renderer.
 * This module exposes helpers for parsing workout history lines
 * and mounts a simple month calendar that reads from localStorage.
 */

const LINE_RE = /^(.*?):\s*(\d+(?:\.\d+)?)\s*lbs\s*[×x]\s*(\d+)\s*reps\s*$/i;

function parseHistoryLine(str) {
  const m = String(str || '').match(LINE_RE);
  if (!m) return null;
  return { name: m[1].trim(), weight: +m[2], reps: +m[3] };
}

function computeDayTotals(lines) {
  let sets = 0, volume = 0;
  (Array.isArray(lines) ? lines : []).forEach(l => {
    const p = parseHistoryLine(l);
    if (p) { sets++; volume += p.weight * p.reps; }
  });
  return { sets, volume };
}

function parseDateLocal(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseAiText(text, selectedDate) {
  const lines = String(text || '').split(/\r?\n/);
  let target = selectedDate;
  const header = lines[0] && lines[0].match(/WORKOUT DATA - (\d{4}-\d{2}-\d{2})/i);
  if (header) target = header[1];
  const out = [];
  let currentExercise = null;
  lines.forEach(l => {
    const trimmed = l.trim();
    if (!trimmed) return;
    const exHeader = trimmed.match(/^([^:]+):\s*$/);
    if (exHeader) {
      currentExercise = exHeader[1].trim();
      return;
    }
    const setMatch = trimmed.match(/^(?:Set\s+\d+\s*[-–:]?\s*)?(.*?):\s*(\d+(?:\.\d+)?)\s*(?:lbs|kg)\s*[×xX]\s*(\d+)\s*reps/i);
    if (setMatch) {
      let name = setMatch[1].trim();
      if (!name && currentExercise) name = currentExercise;
      if (name) {
        out.push(`${name}: ${setMatch[2]} lbs × ${setMatch[3]} reps`);
      }
    }
  });
  if (out.length) return { [target]: out };
  return null;
}

function snapshotToLines(snapshot) {
  const lines = [];
  (snapshot || []).forEach(ex => {
    if (ex.isSuperset) {
      ex.sets.forEach((set, setIdx) => {
        (set.exercises || []).forEach(sub => {
          lines.push(`${sub.name}: Set ${setIdx + 1} - ${sub.weight} lbs × ${sub.reps} reps`);
        });
      });
    } else {
      (ex.sets || []).forEach((set, setIdx) => {
        lines.push(`${ex.name}: Set ${setIdx + 1} - ${set.weight} lbs × ${set.reps} reps`);
      });
    }
  });
  return lines;
}

// --- new calendar helpers ---

function parseHistoryLines(lines) {
  const out = { sets: 0, volume: 0, entries: [] };
  (Array.isArray(lines) ? lines : []).forEach(text => {
    const p = parseHistoryLine(text);
    if (p) {
      out.sets++;
      out.volume += p.weight * p.reps;
      out.entries.push({ text, lift: p.name, weight: p.weight, reps: p.reps });
    }
  });
  return out;
}

const HISTORY_KEY = 'wt_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; }
  catch (e) { return {}; }
}

function saveHistory(data) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
}

function getDayStats(dayISO) {
  const hist = loadHistory();
  return parseHistoryLines(hist[dayISO] || []);
}

function getMonthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      date: d,
      iso: d.toISOString().slice(0, 10),
      inMonth: d.getMonth() === first.getMonth()
    });
  }
  return days;
}

let currentMonthDate = new Date();
let undoPayload = null;

function announce(msg) {
  const live = document.getElementById('wt-cal-live');
  if (live) {
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 10);
  }
}

function mountCalendar() {
  if (typeof document === 'undefined') return;
  const prev = document.getElementById('wt-cal');
  if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
  const section = document.createElement('section');
  section.id = 'wt-cal';
  section.className = 'wt-cal';
  const historyArea = document.querySelector('#history, #wt-history, .history');
  if (historyArea && historyArea.parentNode) historyArea.parentNode.insertBefore(section, historyArea.nextSibling);
  else document.body.appendChild(section);
  if (!document.getElementById('wt-cal-live')) {
    const live = document.createElement('div');
    live.id = 'wt-cal-live';
    live.setAttribute('aria-live', 'polite');
    live.className = 'sr-only';
    document.body.appendChild(live);
  }
  currentMonthDate = new Date();
  renderCalendar(currentMonthDate);
}

function renderCalendar(date) {
  const mount = document.getElementById('wt-cal');
  if (!mount) return;
  currentMonthDate = new Date(date.getFullYear(), date.getMonth(), 1);
  mount.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'cal-header';
  const prevBtn = document.createElement('button'); prevBtn.className = 'btn'; prevBtn.textContent = '« Prev';
  const title = document.createElement('div'); title.className = 'cal-title';
  title.textContent = currentMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const nextBtn = document.createElement('button'); nextBtn.className = 'btn'; nextBtn.textContent = 'Next »';
  const todayBtn = document.createElement('button'); todayBtn.className = 'btn'; todayBtn.textContent = 'Today';
  header.appendChild(prevBtn); header.appendChild(title); header.appendChild(nextBtn); header.appendChild(todayBtn);
  mount.appendChild(header);

  const dowRow = document.createElement('div'); dowRow.className = 'grid';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const el = document.createElement('div'); el.className = 'dow'; el.textContent = d; dowRow.appendChild(el);
  });
  mount.appendChild(dowRow);

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.setAttribute('role', 'grid');
  mount.appendChild(grid);

  const days = getMonthGrid(currentMonthDate);
  const cells = [];
  days.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (day.inMonth ? '' : ' out');
    cell.setAttribute('role', 'gridcell');
    cell.dataset.iso = day.iso;
    const daynum = document.createElement('div'); daynum.className = 'daynum'; daynum.textContent = day.date.getDate();
    cell.appendChild(daynum);
    const stats = getDayStats(day.iso);
    if (stats.sets > 0) {
      const badges = document.createElement('div'); badges.className = 'badges';
      const s = document.createElement('span'); s.className = 'badge'; s.textContent = `S: ${stats.sets}`;
      const v = document.createElement('span'); v.className = 'badge'; v.textContent = `V: ${stats.volume}`;
      badges.appendChild(s); badges.appendChild(v); cell.appendChild(badges);
    }
    const card = document.createElement('div'); card.className = 'card'; card.style.display = 'none'; cell.appendChild(card);
    cell.addEventListener('click', e => { if (e.target.closest('button')) return; toggleCard(cell, day); });
    cells.push(cell); grid.appendChild(cell);
  });

  announce(`Month changed to ${title.textContent}`);

  prevBtn.addEventListener('click', () => { const d = new Date(currentMonthDate); d.setMonth(d.getMonth() - 1); renderCalendar(d); });
  nextBtn.addEventListener('click', () => { const d = new Date(currentMonthDate); d.setMonth(d.getMonth() + 1); renderCalendar(d); });
  todayBtn.addEventListener('click', () => {
    const today = new Date();
    renderCalendar(today);
    const iso = today.toISOString().slice(0, 10);
    const c = grid.querySelector(`[data-iso="${iso}"]`);
    if (c) { focusCell(c); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  let focusEl = grid.querySelector(`[data-iso="${new Date().toISOString().slice(0,10)}"]`) || cells[0];
  focusCell(focusEl);

  grid.addEventListener('keydown', e => {
    const idx = cells.indexOf(document.activeElement);
    let n = idx;
    if (e.key === 'ArrowRight') { n = idx + 1; e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { n = idx - 1; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { n = idx + 7; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { n = idx - 7; e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); toggleCard(cells[idx], days[idx], true); return; }
    else if (e.key === 'Escape') { e.preventDefault(); const card = document.activeElement.querySelector('.card'); if (card) card.style.display = 'none'; return; }
    if (n >= 0 && n < cells.length && n !== idx) focusCell(cells[n]);
  });

  function focusCell(el) {
    cells.forEach(c => { c.tabIndex = -1; c.setAttribute('aria-selected', 'false'); });
    el.tabIndex = 0; el.setAttribute('aria-selected', 'true'); el.focus();
  }

  function toggleCard(cell, day, fromKeyboard) {
    const card = cell.querySelector('.card');
    if (card.style.display === 'none' || !card.style.display) {
      buildCard(card, day);
      card.style.display = '';
      if (fromKeyboard) {
        const stats = getDayStats(day.iso);
        announce(`Opened ${day.date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}: ${stats.sets} sets, ${stats.volume} lbs volume`);
      }
    } else {
      card.style.display = 'none';
    }
  }

  function buildCard(card, day) {
    card.innerHTML = '';
    const stats = getDayStats(day.iso);
    if (!stats.entries.length) { card.textContent = 'No entries'; return; }
    stats.entries.forEach((en, idx) => {
      const row = document.createElement('div'); row.className = 'entry';
      const text = document.createElement('span'); text.textContent = en.text;
      const actions = document.createElement('span'); actions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'btn'; editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const val = window.prompt('Edit entry', en.text);
        if (val == null || val === en.text) return;
        if (!parseHistoryLine(val)) {
          if (typeof showToast === 'function') showToast('Invalid format. Use ‘Bench Press: 185 lbs × 5 reps’');
          else alert('Invalid format. Use “Bench Press: 185 lbs × 5 reps”');
          return;
        }
        const hist = loadHistory();
        const arr = hist[day.iso] || [];
        arr[idx] = val; hist[day.iso] = arr; saveHistory(hist); renderCalendar(currentMonthDate);
      });
      const delBtn = document.createElement('button'); delBtn.className = 'btn'; delBtn.textContent = 'Del';
      delBtn.addEventListener('click', () => {
        const hist = loadHistory();
        const arr = hist[day.iso] || [];
        const removed = arr.splice(idx, 1)[0];
        if (arr.length) hist[day.iso] = arr; else delete hist[day.iso];
        saveHistory(hist);
        const payload = { dayISO: day.iso, lineText: removed };
        if (typeof pushUndo === 'function') pushUndo({ type: 'cal-del', payload });
        else undoPayload = payload;
        const onUndo = () => {
          if (typeof performUndo === 'function') performUndo();
          else if (undoPayload) {
            const h = loadHistory();
            h[undoPayload.dayISO] = h[undoPayload.dayISO] || [];
            h[undoPayload.dayISO].push(undoPayload.lineText);
            saveHistory(h);
            undoPayload = null;
            renderCalendar(currentMonthDate);
          }
        };
        if (typeof showToast === 'function') showToast('Entry deleted', { actionLabel: 'Undo', onAction: onUndo });
        else if (confirm('Entry deleted. Undo?')) onUndo();
        renderCalendar(currentMonthDate);
      });
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      row.appendChild(text); row.appendChild(actions);
      card.appendChild(row);
    });
  }
}

if (typeof window !== 'undefined') {
  window.mountCalendar = mountCalendar;
  document.addEventListener('DOMContentLoaded', () => { mountCalendar(); });
}

// exports for tests
if (typeof module !== 'undefined') {
  module.exports = {
    parseHistoryLine,
    computeDayTotals,
    parseDateLocal,
    parseAiText,
    snapshotToLines,
    parseHistoryLines,
    getDayStats,
    getMonthGrid,
    mountCalendar
  };
}

