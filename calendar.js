// Classic calendar implementation with month grid and history management
// Provides public helpers for tests: parseDateLocal, parseAiText, parseCsv,
// snapshotToLines and mergeHistory.

// ---------- Helpers ----------

const STORAGE_KEY = 'wt_history';

function pad(n) {
  return n.toString().padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateLocal(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function extractJsonFromText(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  return safeParseJson(text.slice(start, end + 1));
}

// Line parsing helpers for history entries
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
    if (p) {
      sets++;
      volume += p.weight * p.reps;
    }
  });
  return { sets, volume };
}

// ---------- Parsing utilities ----------

// AI text format
function parseAiText(text, selectedDate) {
  const lines = String(text || '').split(/\r?\n/);
  let target = selectedDate;
  const header = lines[0] && lines[0].match(/WORKOUT DATA - (\d{4}-\d{2}-\d{2})/i);
  if (header) target = header[1];
  if (!target) return null;

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
    const setMatch = trimmed.match(/^(?:Set\s+\d+\s*[-–:]?\s*)?(.*?):\s*(\d+(?:\.\d+)?)\s*(lbs|kg)\s*[×xX]\s*(\d+)\s*reps/i);
    if (setMatch) {
      let name = setMatch[1].trim();
      if (!name && currentExercise) name = currentExercise;
      if (name) {
        out.push(`${name}: ${setMatch[2]} ${setMatch[3]} × ${setMatch[4]} reps`);
      }
    }
  });

  return out.length ? { [target]: out } : null;
}

// CSV format: Exercise,Set,Weight,Reps
function parseCsv(text, selectedDate) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2 || !selectedDate) return null;

  const headers = lines[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(s => s.trim().toLowerCase());
  if (!['exercise', 'set', 'weight', 'reps'].every(h => headers.includes(h))) return null;

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, ''));
    if (parts.length < 4) continue;
    const [exercise, set, weight, reps] = parts;
    if (exercise && weight && reps) {
      out.push(`${exercise}: Set ${set} - ${weight} lbs × ${reps} reps`);
    }
  }

  return out.length ? { [selectedDate]: out } : null;
}

// Convert session snapshot to history lines
function snapshotToLines(snapshot) {
  const lines = [];
  (snapshot || []).forEach(ex => {
    if (ex.isSuperset) {
      (ex.sets || []).forEach((set, idx) => {
        (set.exercises || []).forEach(sub => {
          lines.push(`${sub.name}: Set ${idx + 1} - ${sub.weight} lbs × ${sub.reps} reps`);
        });
      });
    } else {
      (ex.sets || []).forEach((set, idx) => {
        lines.push(`${ex.name}: Set ${idx + 1} - ${set.weight} lbs × ${set.reps} reps`);
      });
    }
  });
  return lines;
}

// Merge new history into existing, avoiding duplicates
function mergeHistory(base, incoming) {
  let added = 0;
  const dates = new Set();
  if (!incoming) return { added, dates: [] };
  for (const [date, lines] of Object.entries(incoming)) {
    if (!Array.isArray(lines) || !lines.length) continue;
    if (!base[date]) base[date] = [];
    lines.forEach(l => {
      if (!base[date].includes(l)) {
        base[date].push(l);
        added++;
        dates.add(date);
      }
    });
  }
  return { added, dates: Array.from(dates).sort() };
}

// ---------- UI Rendering ----------

function loadHistory() {
  try {
    return safeParseJson(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  if (typeof renderVolumeChart === 'function') renderVolumeChart();
}

function renderCalendar(state) {
  const cal = document.getElementById('calendar');
  if (!cal) return;
  cal.innerHTML = '';

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdays.forEach(w => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = w;
    cal.appendChild(h);
  });

  const month = state.currentMonth.getMonth();
  const year = state.currentMonth.getFullYear();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateStr = formatDate(date);

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.textContent = date.getDate();
    cell.dataset.date = dateStr;

    if (date.getMonth() !== month) cell.classList.add('muted');
    if (state.history[dateStr] && state.history[dateStr].length) cell.classList.add('has-data');
    if (dateStr === state.selectedDate) cell.classList.add('selected');

    cell.addEventListener('click', () => {
      state.selectedDate = dateStr;
      renderDay(state);
      renderCalendar(state);
    });

    cal.appendChild(cell);
  }

  const title = document.getElementById('calTitle');
  if (title) {
    title.textContent = state.currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}

function renderDay(state) {
  const title = document.getElementById('dayTitle');
  const list = document.getElementById('entries');
  if (!title || !list) return;

  title.textContent = parseDateLocal(state.selectedDate).toDateString();
  list.innerHTML = '';
  const items = state.history[state.selectedDate] || [];

  items.forEach((text, idx) => {
    const li = document.createElement('li');
    li.className = 'entry-item';

    const span = document.createElement('span');
    span.textContent = text;
    li.appendChild(span);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-mini edit';
    btnEdit.textContent = 'Edit';
    btnEdit.addEventListener('click', () => {
      const val = prompt('Edit entry', text);
      if (val == null) return; // cancelled
      const trimmed = val.trim();
      if (!trimmed) {
        // remove if blank
        items.splice(idx, 1);
      } else {
        items[idx] = trimmed;
      }
      state.history[state.selectedDate] = items;
      saveHistory(state.history);
      renderDay(state);
      renderCalendar(state);
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-mini del';
    btnDel.textContent = 'Del';
    btnDel.addEventListener('click', () => {
      if (confirm('Delete entry?')) {
        items.splice(idx, 1);
        state.history[state.selectedDate] = items;
        saveHistory(state.history);
        renderDay(state);
        renderCalendar(state);
      }
    });

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);
    li.appendChild(actions);
    list.appendChild(li);
  });

  const resetBtn = document.getElementById('resetDay');
  if (resetBtn) {
    resetBtn.disabled = items.length === 0;
  }
}

function initCalendar() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const state = {
      history: loadHistory(),
      currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      selectedDate: formatDate(new Date())
    };

    // Navigation
    const prev = document.getElementById('calPrev');
    const next = document.getElementById('calNext');
    const todayBtn = document.getElementById('calToday');
    const gotoInput = document.getElementById('calGoto');
    const gotoBtn = document.getElementById('calGo');

    if (prev) prev.addEventListener('click', () => { state.currentMonth.setMonth(state.currentMonth.getMonth() - 1); renderCalendar(state); });
    if (next) next.addEventListener('click', () => { state.currentMonth.setMonth(state.currentMonth.getMonth() + 1); renderCalendar(state); });
    if (todayBtn) todayBtn.addEventListener('click', () => { const today = new Date(); state.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1); state.selectedDate = formatDate(today); renderCalendar(state); renderDay(state); });
    if (gotoInput && gotoBtn) {
      gotoInput.addEventListener('input', () => { gotoBtn.disabled = !gotoInput.value; });
      gotoBtn.addEventListener('click', () => {
        const d = parseDateLocal(gotoInput.value);
        if (isNaN(d)) return;
        state.currentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        state.selectedDate = formatDate(d);
        renderCalendar(state);
        renderDay(state);
      });
    }

    // Entry add
    const addBtn = document.getElementById('addEntry');
    const entryInput = document.getElementById('entryInput');
    if (addBtn && entryInput) {
      addBtn.addEventListener('click', () => {
        const val = entryInput.value.trim();
        if (!val) return;
        if (!state.history[state.selectedDate]) state.history[state.selectedDate] = [];
        state.history[state.selectedDate].push(val);
        entryInput.value = '';
        saveHistory(state.history);
        renderDay(state);
        renderCalendar(state);
      });
    }

    // Reset day
    const resetBtn = document.getElementById('resetDay');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Clear all entries for this day?')) {
          delete state.history[state.selectedDate];
          saveHistory(state.history);
          renderDay(state);
          renderCalendar(state);
        }
      });
    }

    // Export
    const exportBtn = document.getElementById('exportHistory');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'history.json';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }

    // Import from file
    const importBtn = document.getElementById('importHistory');
    const importFile = document.getElementById('importHistoryFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const data = safeParseJson(reader.result);
          const res = mergeHistory(state.history, data);
          if (res.added) {
            saveHistory(state.history);
            alert(`Imported ${res.added} entries for ${res.dates.length} days`);
            state.selectedDate = res.dates[0] || state.selectedDate;
            renderCalendar(state);
            renderDay(state);
          } else {
            alert('No new entries imported');
          }
        };
        reader.readAsText(file);
        importFile.value = '';
      });
    }

    // Import from paste
    const pasteArea = document.getElementById('pasteJson');
    const pasteBtn = document.getElementById('importFromPaste');
    if (pasteArea && pasteBtn) {
      pasteBtn.addEventListener('click', () => {
        const txt = pasteArea.value;
        let data = extractJsonFromText(txt);
        if (!data) data = parseAiText(txt, state.selectedDate);
        if (!data) data = parseCsv(txt, state.selectedDate);
        if (!data) { alert('Invalid data'); return; }
        const res = mergeHistory(state.history, data);
        if (res.added) {
          saveHistory(state.history);
          alert(`Imported ${res.added} entries for ${res.dates.length} days`);
          state.selectedDate = res.dates[0] || state.selectedDate;
          pasteArea.value = '';
          renderCalendar(state);
          renderDay(state);
        } else {
          alert('No new entries imported');
        }
      });
    }

    // Save today session
    const saveSessionBtn = document.getElementById('saveTodaySession');
    if (saveSessionBtn) {
      saveSessionBtn.addEventListener('click', () => {
        if (typeof window.getSessionSnapshot !== 'function') {
          alert('No session snapshot available');
          return;
        }
        const snap = window.getSessionSnapshot();
        const lines = snapshotToLines(snap);
        const data = { [state.selectedDate]: lines };
        const res = mergeHistory(state.history, data);
        if (res.added) {
          saveHistory(state.history);
          alert(`Saved ${res.added} entries for today`);
          renderCalendar(state);
          renderDay(state);
        } else {
          alert('No new entries to save');
        }
      });
    }

    renderCalendar(state);
    renderDay(state);
  });
}

initCalendar();

// ---------- Exports for Node ----------

if (typeof module !== 'undefined') {
  module.exports = {
    parseDateLocal,
    parseAiText,
    parseCsv,
    snapshotToLines,
    mergeHistory,
    parseHistoryLine,
    computeDayTotals,
  };
}

