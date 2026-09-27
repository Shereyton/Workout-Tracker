function parseDateLocal(str){
  if(typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(NaN);
  const [y,m,d] = str.split('-').map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date : new Date(NaN);
}

function isValidHistoryDate(value){
  return Number.isFinite(parseDateLocal(value).getTime());
}

function sanitizeHistory(raw){
  const result = {};
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  Object.entries(raw).forEach(([date, entries]) => {
    if(!isValidHistoryDate(date) || !Array.isArray(entries)) return;
    const clean = entries.filter(line => typeof line === 'string' && line.trim()).map(line => line.trim());
    if(clean.length) result[date] = [...new Set(clean)];
  });
  return result;
}

function sanitizeHistoryTitles(raw){
  const result = {};
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  Object.entries(raw).forEach(([date, label]) => {
    if(isValidHistoryDate(date) && typeof label === 'string' && label.trim()) result[date] = label.trim();
  });
  return result;
}

function historyNumber(value, { min = 0, max = Infinity, integer = false } = {}){
  if(value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string')) return null;
  const text = String(value).trim();
  if(!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number)) ? number : null;
}

function parseCsvRow(row){
  const cols = [];
  let current = '';
  let inQuotes = false;
  for(let i = 0; i < row.length; i += 1){
    const char = row[i];
    const next = row[i + 1];
    if(char === '"' && inQuotes && next === '"'){
      current += '"';
      i += 1;
    } else if(char === '"'){
      inQuotes = !inQuotes;
    } else if(char === ',' && !inQuotes){
      cols.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cols.push(current);
  return cols;
}

function formatDuration(seconds){
  const total = Math.floor(historyNumber(seconds, { max: 604800 }) ?? 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if(hours) return `${hours}h ${minutes}m ${secs}s`;
  if(minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function parseDurationText(value){
  const text = String(value || '').toLowerCase();
  const hours = Number((text.match(/(\d+)\s*h/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+)\s*m/) || [])[1] || 0);
  const seconds = Number((text.match(/(\d+)\s*s/) || [])[1] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function cardioHistoryLine(name, setNumber, distance, duration){
  const distanceNumber = historyNumber(distance, { max: 100000 });
  const distanceText = distanceNumber !== null
    ? `${distanceNumber} mi in `
    : '';
  return `${name}: Set ${setNumber} - ${distanceText}${formatDuration(duration)}`;
}

// Parse AI formatted text or exported AI text into history object
function parseAiText(text, selectedDate){
  if(typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  let target = selectedDate;
  const header = text.match(/WORKOUT DATA - (\d{4}-\d{2}-\d{2})/i);
  if(header) target = header[1];
  if(!isValidHistoryDate(target)) return null;
  const out = [];
  let currentExercise = null;
  lines.forEach(l => {
    const trimmed = l.trim();
    if(!trimmed) return;
    const exHeader = trimmed.match(/^([^:]+):\s*$/);
    if(exHeader){
      currentExercise = exHeader[1].trim();
      return;
    }
    if(!/^Set\s+\d+/i.test(trimmed)) return;
    const lineSet = historyNumber((trimmed.match(/^Set\s+(\d+)(?=\s|[-–:])/i) || [])[1], { min: 1, max: 9999, integer: true });
    if(lineSet === null) return;
    const segments = trimmed.split(/\s*\|\s*/);
    let parsedSegment = false;
    segments.forEach(segment => {
      const cleaned = segment.replace(/^Set\s+\d+\s*[-–:]?\s*/i, '').trim();
      const failedMatch = cleaned.match(/^(?:([^:]+):\s*)?Failed attempt at\s+(\d+(?:\.\d+)?)\s*(lbs|kg)/i);
      if(failedMatch){
        const name = String(failedMatch[1] || currentExercise || '').trim();
        if(name && historyNumber(failedMatch[2], { max: 9999 }) !== null){
          out.push(`${name}: Set ${lineSet} - Failed attempt at ${failedMatch[2]} ${failedMatch[3].toLowerCase()}`);
          parsedSegment = true;
        }
        return;
      }
      const setMatch = cleaned.match(/^(?:([^:]+):\s*)?(\d+(?:\.\d+)?)\s*(lbs|kg)\s*[×xX]\s*(\d+)\s*reps\b/i);
      if(setMatch){
        const name = String(setMatch[1] || currentExercise || '').trim();
        if(name && historyNumber(setMatch[2], { max: 9999 }) !== null && historyNumber(setMatch[4], { min: 1, max: 999, integer: true }) !== null){
          out.push(`${name}: Set ${lineSet} - ${setMatch[2]} ${setMatch[3].toLowerCase()} × ${setMatch[4]} reps`);
          parsedSegment = true;
        }
        return;
      }
      const cardioMatch = cleaned.match(/^(?:([^:]+):\s*)?(?:(\d+(?:\.\d+)?)\s*mi(?:\s+in)?\s*)?((?:\d+\s*h(?:\s+\d+\s*m)?(?:\s+\d+\s*s)?)|(?:\d+\s*m(?:\s+\d+\s*s)?)|(?:\d+\s*s))/i);
      if(cardioMatch){
        const name = String(cardioMatch[1] || currentExercise || '').trim();
        const duration = parseDurationText(cardioMatch[3]);
        const distanceValid = cardioMatch[2] == null || historyNumber(cardioMatch[2], { max: 100000 }) !== null;
        if(name && duration > 0 && duration <= 604800 && distanceValid){
          out.push(cardioHistoryLine(name, lineSet, cardioMatch[2] ?? null, duration));
          parsedSegment = true;
        }
      }
    });
    if(parsedSegment) return;
  });
  if(out.length){
    return {[target]: out};
  }
  return null;
}

// Parse CSV (export format) into history object
function parseCsv(text, selectedDate){
  if(typeof text !== 'string') return null;
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex(line => {
    const values = parseCsvRow(line).map(value => value.trim().toLowerCase());
    return ['exercise', 'set', 'weight', 'reps'].every(column => values.includes(column));
  });
  if(headerIndex === -1) return null;
  const dateMetadata = lines.slice(0, headerIndex).map(parseCsvRow).find(cols => /^(date|workoutdate|sessiondate)$/i.test(cols[0]?.trim()));
  const target = dateMetadata ? dateMetadata[1]?.trim() : selectedDate;
  if(!isValidHistoryDate(target)) return null;
  const headers = parseCsvRow(lines[headerIndex]).map(value => value.trim().toLowerCase());
  const indexOf = name => headers.indexOf(name.toLowerCase());
  const exerciseIndex = indexOf('Exercise');
  const setIndex = indexOf('Set');
  const weightIndex = indexOf('Weight');
  const repsIndex = indexOf('Reps');
  const distanceIndex = indexOf('Distance');
  const durationIndex = indexOf('Duration');
  const roleIndex = indexOf('SetRole');
  const outcomeIndex = indexOf('Outcome');
  const unitIndex = indexOf('Unit') >= 0 ? indexOf('Unit') : indexOf('WeightUnit');
  const out = [];
  lines.slice(headerIndex + 1).forEach(l=>{
    const cols = parseCsvRow(l);
    const name = String(cols[exerciseIndex] || '').trim();
    if(!name) return;
    const setNumber = historyNumber(cols[setIndex], { min: 1, max: 9999, integer: true });
    if(setNumber === null) return;
    const weight = weightIndex >= 0 ? String(cols[weightIndex] || '').trim() : '';
    const reps = repsIndex >= 0 ? String(cols[repsIndex] || '').trim() : '';
    const distance = distanceIndex >= 0 ? String(cols[distanceIndex] || '').trim() : '';
    const duration = durationIndex >= 0 ? String(cols[durationIndex] || '').trim() : '';
    const role = roleIndex >= 0 ? String(cols[roleIndex] || '').trim().toLowerCase() : '';
    const outcome = outcomeIndex >= 0 ? String(cols[outcomeIndex] || '').trim().toLowerCase() : '';
    const unit = unitIndex >= 0 ? String(cols[unitIndex] || '').trim().toLowerCase() : 'lbs';
    if(!['lbs', 'kg', ''].includes(unit)) return;
    if(weight !== '' && historyNumber(weight, { max: 9999 }) === null) return;
    if(weight !== '' && (role === 'failed_attempt' || outcome === 'failed' || reps === '0')){
      out.push(`${name}: Set ${setNumber} - Failed attempt at ${weight} ${unit || 'lbs'}`);
    } else if(weight !== '' && historyNumber(reps, { min: 1, max: 999, integer: true }) !== null){
      out.push(`${name}: Set ${setNumber} - ${weight} ${unit || 'lbs'} × ${reps} reps`);
    } else if(duration !== ''){
      const durationNumber = historyNumber(duration, { min: 1, max: 604800, integer: true });
      if(durationNumber !== null && (distance === '' || historyNumber(distance, { max: 100000 }) !== null)){
        out.push(cardioHistoryLine(name, setNumber, distance, durationNumber));
      }
    }
  });
  if(out.length){
    return {[target]: out};
  }
  return null;
}

// Convert a session snapshot into history lines with set numbers
function snapshotToLines(snapshot){
  const lines = [];
  if(!Array.isArray(snapshot)) return lines;
  const strengthLine = (name, set, setNumber, context = {}) => {
    if(typeof name !== 'string' || !name.trim() || !set || typeof set !== 'object') return;
    const weight = historyNumber(set.weight, { max: 9999 });
    const reps = historyNumber(set.reps, { max: 999, integer: true });
    const failed = (set.role || context.role) === 'failed_attempt' || (set.outcome || context.outcome) === 'failed' || reps === 0;
    if(weight === null || (!failed && (reps === null || reps < 1))) return;
    lines.push(failed ? `${name.trim()}: Set ${setNumber} - Failed attempt at ${weight} lbs`
      : `${name.trim()}: Set ${setNumber} - ${weight} lbs × ${reps} reps`);
  };
  snapshot.forEach(ex => {
    if(!ex || typeof ex !== 'object' || !Array.isArray(ex.sets)) return;
    if(ex.isSuperset){
      ex.sets.forEach((set, setIdx) => {
        if(!set || !Array.isArray(set.exercises)) return;
        set.exercises.forEach(sub => {
          const setNumber = historyNumber(set.set, { min: 1, max: 9999, integer: true }) ?? setIdx + 1;
          strengthLine(sub?.name, sub, setNumber, set);
        });
      });
    } else if(ex.isCardio){
      ex.sets.forEach((set, setIdx) => {
        if(!set || typeof ex.name !== 'string' || !ex.name.trim()) return;
        const duration = historyNumber(set.duration, { min: 1, max: 604800, integer: true });
        const distance = historyNumber(set.distance, { max: 100000 });
        if(duration === null || (set.distance != null && set.distance !== '' && distance === null)) return;
        const setNumber = historyNumber(set.set, { min: 1, max: 9999, integer: true }) ?? setIdx + 1;
        lines.push(cardioHistoryLine(ex.name.trim(), setNumber, distance, duration));
      });
    } else {
      ex.sets.forEach((set, setIdx) => {
        const setNumber = historyNumber(set?.set, { min: 1, max: 9999, integer: true }) ?? setIdx + 1;
        strengthLine(ex.name, set, setNumber);
      });
    }
  });
  return lines;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if(!document.getElementById('calendar')) return;
    const STORAGE_KEY = 'wt_history';
    const TITLE_KEY = 'wt_history_titles';
    let storageErrorShown = false;

    function extractJsonFromText(text){
      let cleaned = text.replace(/^\uFEFF/, '');
      cleaned = cleaned.replace(/```(?:json)?|```/gi,'');
      cleaned = cleaned.replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
      const match = cleaned.match(/({[\s\S]*}|\[[\s\S]*\])/);
      if(match){
        return match[0].replace(/,\s*([}\]])/g,'$1');
      }
      return null;
    }

    function safeParseJson(text){
      try{ return JSON.parse(text); }catch(e){}
      const extracted = extractJsonFromText(text);
      if(!extracted) return null;
      try{ return JSON.parse(extracted); }catch(e){}
      return null;
    }

    function loadStoredHistory(){
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return {};
        const parsed = safeParseJson(raw);
        return sanitizeHistory(parsed);
      }catch(err){
        console.warn('Failed to read workout history from storage', err);
        return {};
      }
    }

    function loadStoredTitles(){
      try{
        const raw = localStorage.getItem(TITLE_KEY);
        if(!raw) return {};
        const parsed = safeParseJson(raw);
        return sanitizeHistoryTitles(parsed);
      }catch(err){
        console.warn('Failed to read history titles from storage', err);
        return {};
      }
    }

    function saveTitles(){
      return save();
    }

    let history = loadStoredHistory();
    let titles = loadStoredTitles();
    let current = new Date();
    current.setDate(1);
    let selectedDate = formatDate(new Date());

    const calendarEl = document.getElementById('calendar');
    const dayTitle = document.getElementById('dayTitle');
    const entriesEl = document.getElementById('entries');
    const entryInput = document.getElementById('entryInput');
    const addEntryBtn = document.getElementById('addEntry');
    const exportBtn = document.getElementById('exportHistory');
    const importBtn = document.getElementById('importHistory');
    const importFile = document.getElementById('importHistoryFile');
    const saveTodayBtn = document.getElementById('saveTodaySession');
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const calTitle = document.getElementById('calTitle');
    const calToday = document.getElementById('calToday');
    const calGoto = document.getElementById('calGoto');
    const calGo = document.getElementById('calGo');
    const pasteJson = document.getElementById('pasteJson');
    const importFromPaste = document.getElementById('importFromPaste');
    const resetDayBtn = document.getElementById('resetDay');
    const dayLabelInput = document.getElementById('dayLabelInput');
    const saveDayLabelBtn = document.getElementById('saveDayLabel');
    const clearDayLabelBtn = document.getElementById('clearDayLabel');
    const titleExportSelect = document.getElementById('titleExportSelect');
    const exportTitleHistoryBtn = document.getElementById('exportTitleHistory');
    // Avoid one incomplete page/old cached markup taking down the workout app.
    if(![calendarEl, dayTitle, entriesEl, entryInput, addEntryBtn, exportBtn, importBtn, importFile,
      saveTodayBtn, calPrev, calNext, calTitle, calToday, calGoto, calGo, pasteJson, importFromPaste].every(Boolean)) return;

    const statusEl = document.createElement('p');
    statusEl.className = 'calendar-status';
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.hidden = true;
    dayTitle.insertAdjacentElement('afterend', statusEl);
    const entryHelp = document.createElement('p');
    entryHelp.className = 'calendar-entry-help';
    entryHelp.textContent = 'Calendar notes and imported logs. Editing these entries does not change your saved workout records.';
    entriesEl.insertAdjacentElement('beforebegin', entryHelp);
    entryInput.setAttribute('aria-label', 'Add a note for the selected day');
    pasteJson.setAttribute('aria-label', 'Workout history to import');
    if(dayLabelInput) dayLabelInput.setAttribute('aria-label', 'Workout day title');
    if(resetDayBtn) resetDayBtn.textContent = 'Clear day notes';
    exportBtn.textContent = 'Export calendar notes';
    importBtn.textContent = 'Import history';
    calPrev.setAttribute('aria-label', 'Previous month');
    calNext.setAttribute('aria-label', 'Next month');
    calTitle.setAttribute('aria-live', 'polite');

    function reportStatus(message, isError = false){
      statusEl.hidden = false;
      statusEl.textContent = message;
      statusEl.dataset.error = String(isError);
    }

    const confirmModal =
      (typeof window !== 'undefined' && typeof window.wtConfirmModal === 'function')
        ? window.wtConfirmModal
        : (message, options = {}) => {
            const title = options.title ? `${options.title}\n\n` : '';
            const result = window.confirm(`${title}${message}`);
            return Promise.resolve(!!result);
          };

    function getDayLabel(date){
      const label = titles[date];
      return typeof label === 'string' ? label : '';
    }

    function updateTitleSelect(){
      if(!titleExportSelect) return;
      const previous = titleExportSelect.value;
      titleExportSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Export by title…';
      titleExportSelect.appendChild(placeholder);
      const unique = new Set();
      Object.values(titles).forEach(label => {
        if(typeof label === 'string' && label.trim()){
          unique.add(label.trim());
        }
      });
      const sorted = Array.from(unique).sort((a,b) => a.localeCompare(b));
      sorted.forEach(label => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        titleExportSelect.appendChild(option);
      });
      if(previous && sorted.includes(previous)) {
        titleExportSelect.value = previous;
      }
    }

    function updateDateInput(){
      calGoto.value = selectedDate;
      calGo.disabled = !isValidHistoryDate(calGoto.value);
    }
    updateDateInput();

    function formatDate(d){
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function save(){
      let previousHistory;
      let previousTitles;
      try{
        previousHistory = localStorage.getItem(STORAGE_KEY);
        previousTitles = localStorage.getItem(TITLE_KEY);
        history = sanitizeHistory(history);
        titles = sanitizeHistoryTitles(titles);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        localStorage.setItem(TITLE_KEY, JSON.stringify(titles));
        storageErrorShown = false;
        window.dispatchEvent(new Event('wt-history-updated'));
        return true;
      }catch(err){
        console.error('Failed to save workout history', err);
        // Keep the old view and stored records together if either write fails.
        try{
          if(previousHistory !== undefined){
            if(previousHistory === null) localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, previousHistory);
          }
          if(previousTitles !== undefined){
            if(previousTitles === null) localStorage.removeItem(TITLE_KEY);
            else localStorage.setItem(TITLE_KEY, previousTitles);
          }
        }catch(restoreError){ console.warn('Unable to restore calendar storage', restoreError); }
        history = loadStoredHistory();
        titles = loadStoredTitles();
        reportStatus('Changes could not be saved. Your previous calendar entries are still shown. Export a backup, then try again.', true);
        if(!storageErrorShown){
          storageErrorShown = true;
        }
        return false;
      }
    }

    function mergeHistory(raw){
      let incomingHistory;
      if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.history && typeof raw.history === 'object'){
        incomingHistory = raw.history;
      } else if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.dates && typeof raw.dates === 'object'){
        incomingHistory = raw.dates;
      } else if(raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.exercises)){
        const date = raw.date == null ? selectedDate : raw.date;
        incomingHistory = {[date]: snapshotToLines(raw.exercises)};
      } else {
        incomingHistory = raw;
      }
      const incomingTitles = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.titles && typeof raw.titles === 'object'
        ? raw.titles
        : null;
      const dates = new Set();
      let added = 0;
      let skipped = 0;
      let rejected = 0;
      if(incomingHistory && typeof incomingHistory === 'object' && !Array.isArray(incomingHistory)){
        Object.keys(incomingHistory).forEach(date => {
          if(!isValidHistoryDate(date)){ rejected++; return; }
          const payload = incomingHistory[date];
          let entries = [];
          let label = '';
          if(Array.isArray(payload)){
            entries = payload;
          } else if(payload && typeof payload === 'object'){
            if(Array.isArray(payload.entries)) entries = payload.entries;
            if(typeof payload.title === 'string') label = payload.title.trim();
          }
          entries.forEach(line => {
            if(typeof line !== 'string' || !line.trim()){ rejected++; return; }
            line = line.trim();
            if(!Array.isArray(history[date])) history[date] = [];
            const match = line.match(/^(.+?):\s*Set\s+(\d+)\s*-/i);
            const identity = match ? `${match[1].trim().toLowerCase().replace(/\s+/g,' ')}::${Number(match[2])}` : null;
            const existingIndex = identity
              ? history[date].findIndex(existingLine => {
                const existingMatch = String(existingLine || '').match(/^(.+?):\s*Set\s+(\d+)\s*-/i);
                if(!existingMatch) return false;
                return `${existingMatch[1].trim().toLowerCase().replace(/\s+/g,' ')}::${Number(existingMatch[2])}` === identity;
              })
              : history[date].indexOf(line);
            if(existingIndex === -1){
              history[date].push(line);
              added++;
              dates.add(date);
            } else if(history[date][existingIndex] === line){
              skipped++;
            } else {
              history[date][existingIndex] = line;
              added++;
              dates.add(date);
            }
          });
          if(label){
            titles[date] = label;
            dates.add(date);
          }
        });
      }

      if(incomingTitles){
        Object.keys(incomingTitles).forEach(date => {
          if(!isValidHistoryDate(date)){ rejected++; return; }
          const label = incomingTitles[date];
          if(typeof label === 'string' && label.trim()){
            titles[date] = label.trim();
            dates.add(date);
          } else if(!label){
            delete titles[date];
            dates.add(date);
          }
        });
      }

      return {dates:[...dates], added, skipped, rejected};
    }

    function renderCalendar(){
      calendarEl.innerHTML='';
      const year = current.getFullYear();
      const month = current.getMonth();
      calTitle.textContent = current.toLocaleString('default',{month:'long',year:'numeric'});

      const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const headerRow = document.createElement('div');
      headerRow.setAttribute('role', 'row');
      headerRow.style.display = 'contents';
      weekDays.forEach(d => {
        const head = document.createElement('div');
        head.textContent = d;
        head.className = 'cal-header';
        head.setAttribute('role', 'columnheader');
        headerRow.appendChild(head);
      });
      calendarEl.appendChild(headerRow);

      const first = new Date(year, month, 1);
      const start = first.getDay();
      const days = new Date(year, month+1, 0).getDate();
      const prevDays = new Date(year, month, 0).getDate();
      const totalCells = 42;
      let row;
      for(let i=0;i<totalCells;i++){
        if(i % 7 === 0){
          row = document.createElement('div');
          row.setAttribute('role', 'row');
          row.style.display = 'contents';
          calendarEl.appendChild(row);
        }
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'calendar-day';
        cell.setAttribute('role', 'gridcell');
        let dayNum; let dateObj;
        if(i < start){
          dayNum = prevDays - start + 1 + i;
          dateObj = new Date(year, month-1, dayNum);
          cell.classList.add('muted');
        } else if(i >= start + days){
          dayNum = i - start - days + 1;
          dateObj = new Date(year, month+1, dayNum);
          cell.classList.add('muted');
        } else {
          dayNum = i - start + 1;
          dateObj = new Date(year, month, dayNum);
        }
        const dateStr = formatDate(dateObj);
        cell.dataset.date = dateStr;
        cell.textContent = dayNum;
        const hasWorkout = !!(history[dateStr] && history[dateStr].length);
        if(hasWorkout){
          cell.classList.add('has-data');
        }
        const label = getDayLabel(dateStr);
        if(label){
          cell.classList.add('has-label');
          cell.setAttribute('title', `${dateStr} • ${label}`);
        }
        const isSelected = dateStr === selectedDate;
        if(isSelected) cell.classList.add('selected');
        cell.tabIndex = isSelected ? 0 : -1;
        cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if(dateStr === formatDate(new Date())) cell.setAttribute('aria-current', 'date');
        cell.setAttribute(
          'aria-label',
          `${dateObj.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}${label ? `, ${label}` : ''}, ${hasWorkout ? 'workout logged' : 'no workout logged'}`,
        );
        cell.addEventListener('click', () => {
          selectDate(dateStr, true);
        });
        row.appendChild(cell);
      }
    }

    function selectDate(dateStr, focusDay = false){
      if(!isValidHistoryDate(dateStr)) return;
      const dateObj = parseDateLocal(dateStr);
      selectedDate = dateStr;
      current = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      renderCalendar();
      renderDay();
      if(focusDay) calendarEl.querySelector(`[data-date="${dateStr}"]`)?.focus();
    }

    calendarEl.addEventListener('keydown', event => {
      if(!event.target.closest('[data-date]')) return;
      const date = parseDateLocal(event.target.dataset.date);
      if(!Number.isFinite(date.getTime())) return;
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if(Object.prototype.hasOwnProperty.call(offsets, event.key)) date.setDate(date.getDate() + offsets[event.key]);
      else if(event.key === 'Home') date.setDate(date.getDate() - date.getDay());
      else if(event.key === 'End') date.setDate(date.getDate() + 6 - date.getDay());
      else if(event.key === 'PageUp' || event.key === 'PageDown'){
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + (event.key === 'PageUp' ? -1 : 1));
        date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      } else return;
      event.preventDefault();
      selectDate(formatDate(date), true);
    });

    function renderDay(){
      const entryDate = selectedDate;
      const dateObj = parseDateLocal(selectedDate);
      const label = getDayLabel(selectedDate);
      dayTitle.textContent = label ? `${dateObj.toDateString()} • ${label}` : dateObj.toDateString();
      if(dayLabelInput){
        dayLabelInput.value = label;
      }
      if(clearDayLabelBtn){
        clearDayLabelBtn.disabled = !label;
      }
      entriesEl.innerHTML = '';
      const list = history[selectedDate] || [];
      if(!list.length){
        const empty = document.createElement('li');
        empty.className = 'calendar-empty';
        empty.textContent = 'No notes or logged sets for this day yet.';
        entriesEl.appendChild(empty);
      }
      list.forEach((text, idx) => {
        const li = document.createElement('li');
        li.className = 'entry-item';

        const span = document.createElement('span');
        span.textContent = text;
        li.appendChild(span);

        const actions = document.createElement('div');
        actions.className = 'entry-actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.className = 'btn-mini edit';
        editBtn.type = 'button';
        editBtn.setAttribute('aria-label', `Edit ${text}`);
        editBtn.addEventListener('click', () => {
          if (li.querySelector('.edit-form')) return;
          const form = document.createElement('div');
          form.className = 'edit-form';
          const row = document.createElement('div');
          row.className = 'row';
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'editEntryInput';
          input.value = text;
          input.setAttribute('aria-label', 'Edit calendar entry');
          row.appendChild(input);
          const actionsRow = document.createElement('div');
          actionsRow.className = 'row2';
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'btn-mini edit';
          saveBtn.dataset.action = 'save';
          saveBtn.textContent = 'Save';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'btn-mini del';
          cancelBtn.dataset.action = 'cancel';
          cancelBtn.textContent = 'Cancel';
          actionsRow.appendChild(saveBtn);
          actionsRow.appendChild(cancelBtn);
          form.appendChild(row);
          form.appendChild(actionsRow);
          li.appendChild(form);
          input.focus();
          form.addEventListener('keydown', ev => {
            if(ev.key === 'Enter'){ ev.preventDefault(); saveBtn.click(); }
            if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); cancelBtn.click(); }
          });
          form.addEventListener('click', ev => {
            const action = ev.target.getAttribute('data-action');
            if (action === 'save') {
              const updated = input.value.trim();
              if (updated) {
                history[entryDate][idx] = updated;
              } else {
                history[entryDate].splice(idx,1);
                if (history[entryDate].length === 0) delete history[entryDate];
              }
              const saved = save();
              renderDay();
              renderCalendar();
              if(saved) reportStatus('Calendar entry updated. Saved workout records are unchanged.');
            }
            if (action === 'cancel') {
              form.remove();
              editBtn.focus();
            }
          });
        });
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'btn-mini del';
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', `Delete ${text}`);
        delBtn.addEventListener('click', async () => {
          const ok = await confirmModal('Delete entry?', { yesText: 'Delete', noText: 'Cancel', title: 'Delete Entry' });
          if(!ok) return;
          if(!Array.isArray(history[entryDate])) return;
          // Find the original entry again: another tab may have updated the day during confirmation.
          const entryIndex = history[entryDate].indexOf(text);
          if(entryIndex < 0) return;
          history[entryDate].splice(entryIndex,1);
          if(history[entryDate].length === 0) delete history[entryDate];
          const saved = save();
          renderDay();
          renderCalendar();
          if(saved) reportStatus('Calendar entry removed. Saved workout records are unchanged.');
        });
        actions.appendChild(delBtn);

        li.appendChild(actions);
        entriesEl.appendChild(li);
      });
      if(resetDayBtn){
        resetDayBtn.disabled = list.length === 0 && !getDayLabel(selectedDate);
      }
      updateDateInput();
    }
    addEntryBtn.addEventListener('click', () => {
      const val = entryInput.value.trim();
      if(!val) return;
      if(!history[selectedDate]) history[selectedDate] = [];
      if(!history[selectedDate].includes(val)) history[selectedDate].push(val);
      if(save()) { entryInput.value=''; reportStatus('Note saved.'); }
      renderDay();
      renderCalendar();
      updateTitleSelect();
    });
    entryInput.addEventListener('keydown', event => {
      if(event.key === 'Enter'){ event.preventDefault(); addEntryBtn.click(); }
    });

    if(resetDayBtn){
      resetDayBtn.addEventListener('click', async () => {
        const dateToClear = selectedDate;
        const ok = await confirmModal('Clear calendar notes, imported logs, and the title for this day? Your saved workout records will stay available.', { yesText: 'Clear Notes', noText: 'Cancel', title: 'Clear Day Notes' });
        if(!ok) return;
        delete history[dateToClear];
        delete titles[dateToClear];
        if(save()) reportStatus('Day notes cleared. Saved workout records are unchanged.');
        renderDay();
        renderCalendar();
        updateTitleSelect();
      });
    }

    function buildHistoryExportPayload(){
      const payload = { history: {}, titles: {} };
      Object.keys(history).forEach(date => {
        const list = history[date];
        if(Array.isArray(list)){
          payload.history[date] = [...list];
        }
      });
      Object.keys(titles).forEach(date => {
        const label = titles[date];
        if(typeof label === 'string' && label.trim()){
          payload.titles[date] = label.trim();
        }
      });
      if(Object.keys(payload.titles).length === 0) delete payload.titles;
      return payload;
    }

    function triggerDownload(blob, filename){
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function slugifyLabel(label){
      return label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'labeled-days';
    }

    function buildTitleExport(label){
      const dates = Object.keys(titles).filter(date => titles[date] === label);
      const result = { label, dates: {} };
      dates.forEach(date => {
        result.dates[date] = {
          title: label,
          entries: Array.isArray(history[date]) ? [...history[date]] : []
        };
      });
      return result;
    }

    if(saveDayLabelBtn){
      saveDayLabelBtn.addEventListener('click', () => {
        if(!dayLabelInput) return;
        const value = dayLabelInput.value.trim();
        if(value){
          titles[selectedDate] = value;
        } else {
          delete titles[selectedDate];
        }
        saveTitles();
        updateTitleSelect();
        renderCalendar();
        renderDay();
      });
    }

    if(clearDayLabelBtn){
      clearDayLabelBtn.addEventListener('click', () => {
        delete titles[selectedDate];
        saveTitles();
        if(dayLabelInput) dayLabelInput.value = '';
        updateTitleSelect();
        renderCalendar();
        renderDay();
      });
    }

    if(dayLabelInput){
      dayLabelInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
          e.preventDefault();
          if(saveDayLabelBtn) saveDayLabelBtn.click();
        }
      });
    }

    if(exportTitleHistoryBtn){
      exportTitleHistoryBtn.addEventListener('click', () => {
        if(!titleExportSelect) return;
        const label = titleExportSelect.value;
        if(!label){
          alert('Select a title to export.');
          return;
        }
        const payload = buildTitleExport(label);
        if(!Object.keys(payload.dates).length){
          alert(`No days found with title "${label}".`);
          return;
        }
        const data = JSON.stringify(payload, null, 2);
        const blob = new Blob([data], {type:'application/json'});
        const filename = `workout_history_${slugifyLabel(label)}.json`;
        triggerDownload(blob, filename);
        if(navigator.clipboard){
          navigator.clipboard.writeText(data).then(()=>{
            alert(`History for "${label}" exported and copied to clipboard ✅`);
          }).catch(()=> alert(`History for "${label}" exported (clipboard copy failed)`));
        } else {
          alert(`History for "${label}" exported. Copy manually:\n\n${data}`);
        }
      });
    }

    exportBtn.addEventListener('click', () => {
      const payload = buildHistoryExportPayload();
      const data = JSON.stringify(payload, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      triggerDownload(blob, 'workout_history.json');
      if(navigator.clipboard){
        navigator.clipboard.writeText(data).then(()=>{
          alert('History exported and copied to clipboard ✅');
        }).catch(()=> alert('History exported (clipboard copy failed)'));
      } else {
        alert('History exported. Copy manually:\n\n' + data);
      }
    });

    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if(!file) return;
      if(file.size > 10 * 1024 * 1024){
        reportStatus('This file is too large. Import a workout or history file under 10 MB.', true);
        importFile.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        handlePaste(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => reportStatus('This file could not be read. Your existing history is unchanged.', true);
      reader.readAsText(file);
      importFile.value='';
    });

    importFromPaste.addEventListener('click', () => {
      const text = pasteJson.value;
      if(!text.trim()) return;
      if(handlePaste(text)) pasteJson.value='';
    });

    function handlePaste(text){
      try{
        const incoming = safeParseJson(text) || parseAiText(text, selectedDate) || parseCsv(text, selectedDate);
        if(incoming && typeof incoming === 'object'){
          const res = mergeHistory(incoming);
          if(!res.dates.length && !res.skipped){
            reportStatus('No valid dated workout entries were found. Your existing history is unchanged.', true);
            return false;
          }
          if(!save()){ renderCalendar(); renderDay(); return false; }
          if(res.dates.length) selectDate(res.dates.sort().at(-1));
          else { renderCalendar(); renderDay(); }
          updateTitleSelect();
          reportStatus(`Imported ${res.added} entries. ${res.skipped} duplicates skipped.${res.rejected ? ` ${res.rejected} invalid entries ignored.` : ''}`);
          return true;
        }
      }catch(error){
        console.warn('Unable to import calendar history', error);
      }
      reportStatus('Could not read that workout. Paste exported workout JSON, AI text, or CSV. Your existing history is unchanged.', true);
      return false;
    }

    calPrev.addEventListener('click', () => {
      current.setMonth(current.getMonth()-1);
      selectedDate = formatDate(new Date(current.getFullYear(), current.getMonth(),1));
      renderCalendar();
      renderDay();
    });

    calNext.addEventListener('click', () => {
      current.setMonth(current.getMonth()+1);
      selectedDate = formatDate(new Date(current.getFullYear(), current.getMonth(),1));
      renderCalendar();
      renderDay();
    });

    calToday.addEventListener('click', () => {
      const now = new Date();
      selectedDate = formatDate(now);
      current = new Date(now.getFullYear(), now.getMonth(),1);
      renderCalendar();
      renderDay();
    });

    calGoto.addEventListener('input', () => {
      calGo.disabled = !isValidHistoryDate(calGoto.value);
    });

    calGo.addEventListener('click', () => {
      selectDate(calGoto.value, true);
    });

    saveTodayBtn.addEventListener('click', () => {
      try{
        if (typeof window.getSessionSnapshot !== 'function') {
          reportStatus('Workout data is not ready yet. Reopen the Train tab and try again.', true);
          return;
        }
        const snapshot = window.getSessionSnapshot();
        const lines = snapshotToLines(snapshot);
        if(!lines.length){
          reportStatus('Log a set in Train before saving it to the calendar.');
          return;
        }
        const today = formatDate(new Date());
        selectedDate = today;
        current = new Date();
        current.setDate(1);
        const res = mergeHistory({[today]: lines});
        if(!save()){ renderDay(); renderCalendar(); return; }
        renderDay();
        renderCalendar();
        updateTitleSelect();
        reportStatus(`Saved ${res.added} entries. ${res.skipped} duplicates skipped.`);
      }catch(error){
        console.warn('Unable to save the visible session to the calendar', error);
        reportStatus('The session could not be copied to the calendar. Your logged workout is unchanged.', true);
      }
    });

    window.addEventListener('wt-history-updated', () => {
      history = loadStoredHistory();
      titles = loadStoredTitles();
      renderCalendar();
      renderDay();
      updateTitleSelect();
    });
    window.addEventListener('storage', event => {
      if(event.key !== STORAGE_KEY && event.key !== TITLE_KEY && event.key !== null) return;
      history = loadStoredHistory();
      titles = loadStoredTitles();
      renderCalendar();
      renderDay();
      updateTitleSelect();
    });

    renderCalendar();
    renderDay();
    updateTitleSelect();
  });
}
if (typeof module !== 'undefined') {
  module.exports = { parseDateLocal, parseAiText, parseCsv, snapshotToLines, formatDuration, cardioHistoryLine, sanitizeHistory, sanitizeHistoryTitles, isValidHistoryDate };
}
