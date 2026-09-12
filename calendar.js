function parseDateLocal(str){
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
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
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
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
  const distanceNumber = Number(distance);
  const distanceText = distance !== '' && distance !== null && distance !== undefined && Number.isFinite(distanceNumber)
    ? `${distanceNumber} mi in `
    : '';
  return `${name}: Set ${setNumber} - ${distanceText}${formatDuration(duration)}`;
}

// Parse AI formatted text or exported AI text into history object
function parseAiText(text, selectedDate){
  const lines = text.split(/\r?\n/);
  let target = selectedDate;
  const header = lines[0].match(/WORKOUT DATA - (\d{4}-\d{2}-\d{2})/i);
  if(header) target = header[1];
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
    const lineSet = Number((trimmed.match(/^Set\s+(\d+)/i) || [])[1]) || out.length + 1;
    const segments = trimmed.split(/\s*\|\s*/);
    let parsedSegment = false;
    segments.forEach(segment => {
      const cleaned = segment.replace(/^Set\s+\d+\s*[-–:]?\s*/i, '').trim();
      const failedMatch = cleaned.match(/^(?:([^:]+):\s*)?Failed attempt at\s+(\d+(?:\.\d+)?)\s*(lbs|kg)/i);
      if(failedMatch){
        const name = String(failedMatch[1] || currentExercise || '').trim();
        if(name){
          out.push(`${name}: Set ${lineSet} - Failed attempt at ${failedMatch[2]} ${failedMatch[3].toLowerCase()}`);
          parsedSegment = true;
        }
        return;
      }
      const setMatch = cleaned.match(/^(?:([^:]+):\s*)?(\d+(?:\.\d+)?)\s*(lbs|kg)\s*[×xX]\s*(\d+)\s*reps/i);
      if(setMatch){
        const name = String(setMatch[1] || currentExercise || '').trim();
        if(name){
          out.push(`${name}: Set ${lineSet} - ${setMatch[2]} ${setMatch[3].toLowerCase()} × ${setMatch[4]} reps`);
          parsedSegment = true;
        }
        return;
      }
      const cardioMatch = cleaned.match(/^(?:([^:]+):\s*)?(?:(\d+(?:\.\d+)?)\s*mi(?:\s+in)?\s*)?((?:\d+\s*h(?:\s+\d+\s*m)?(?:\s+\d+\s*s)?)|(?:\d+\s*m(?:\s+\d+\s*s)?)|(?:\d+\s*s))/i);
      if(cardioMatch){
        const name = String(cardioMatch[1] || currentExercise || '').trim();
        if(name){
          out.push(cardioHistoryLine(name, lineSet, cardioMatch[2] ?? null, parseDurationText(cardioMatch[3])));
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
  if(!/Exercise\s*,\s*Set\s*,\s*Weight\s*,\s*Reps/i.test(text)) return null;
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex(line => /Exercise\s*,\s*Set\s*,\s*Weight\s*,\s*Reps/i.test(line));
  if(headerIndex === -1) return null;
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
  const out = [];
  lines.slice(headerIndex + 1).forEach(l=>{
    const cols = parseCsvRow(l);
    const name = String(cols[exerciseIndex] || '').trim();
    if(!name) return;
    const setNumber = Number(cols[setIndex]) || out.length + 1;
    const weight = weightIndex >= 0 ? String(cols[weightIndex] || '').trim() : '';
    const reps = repsIndex >= 0 ? String(cols[repsIndex] || '').trim() : '';
    const distance = distanceIndex >= 0 ? String(cols[distanceIndex] || '').trim() : '';
    const duration = durationIndex >= 0 ? String(cols[durationIndex] || '').trim() : '';
    const role = roleIndex >= 0 ? String(cols[roleIndex] || '').trim().toLowerCase() : '';
    const outcome = outcomeIndex >= 0 ? String(cols[outcomeIndex] || '').trim().toLowerCase() : '';
    if(weight !== '' && (role === 'failed_attempt' || outcome === 'failed' || reps === '0')){
      out.push(`${name}: Set ${setNumber} - Failed attempt at ${weight} lbs`);
    } else if(weight !== '' && reps !== ''){
      out.push(`${name}: Set ${setNumber} - ${weight} lbs × ${reps} reps`);
    } else if(duration !== ''){
      out.push(cardioHistoryLine(name, setNumber, distance, Number(duration)));
    }
  });
  if(out.length){
    return {[selectedDate]: out};
  }
  return null;
}

// Convert a session snapshot into history lines with set numbers
function snapshotToLines(snapshot){
  const lines = [];
  snapshot.forEach(ex => {
    if(ex.isSuperset){
      ex.sets.forEach((set, setIdx) => {
        set.exercises.forEach(sub => {
          const setNumber = set.set || setIdx + 1;
          const failed = (sub.role || set.role) === 'failed_attempt'
            || (sub.outcome || set.outcome) === 'failed';
          lines.push(failed
            ? `${sub.name}: Set ${setNumber} - Failed attempt at ${sub.weight} lbs`
            : `${sub.name}: Set ${setNumber} - ${sub.weight} lbs × ${sub.reps} reps`);
        });
      });
    } else if(ex.isCardio){
      ex.sets.forEach((set, setIdx) => {
        lines.push(cardioHistoryLine(ex.name, set.set || setIdx + 1, set.distance, set.duration));
      });
    } else {
      ex.sets.forEach((set, setIdx) => {
        const setNumber = set.set || setIdx + 1;
        const failed = set.role === 'failed_attempt' || set.outcome === 'failed';
        lines.push(failed
          ? `${ex.name}: Set ${setNumber} - Failed attempt at ${set.weight} lbs`
          : `${ex.name}: Set ${setNumber} - ${set.weight} lbs × ${set.reps} reps`);
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
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      }catch(err){
        console.warn('Failed to read history titles from storage', err);
        return {};
      }
    }

    function saveTitles(){
      try{
        const filtered = {};
        Object.keys(titles).forEach(date => {
          const label = titles[date];
          if(typeof label === 'string' && label.trim()){
            filtered[date] = label.trim();
          }
        });
        titles = filtered;
        if (window.wtStorage) return window.wtStorage.set(TITLE_KEY, filtered);
        localStorage.setItem(TITLE_KEY, JSON.stringify(filtered));
        return true;
      }catch(err){
        console.error('Failed to save history titles', err);
        alert('Unable to save history titles. Storage may be full or disabled.');
        return false;
      }
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
      calGo.disabled = !calGoto.value;
    }
    updateDateInput();

    function formatDate(d){
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function save(){
      try{
        if (window.wtStorage) return window.wtStorage.set(STORAGE_KEY, history);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        return true;
      }catch(err){
        console.error('Failed to save workout history', err);
        if(!storageErrorShown){
          alert('Unable to save workout history. Storage may be full or disabled.');
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
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? raw.date : selectedDate;
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
      if(incomingHistory && typeof incomingHistory === 'object'){
        Object.keys(incomingHistory).forEach(date => {
          const payload = incomingHistory[date];
          let entries = [];
          let label = '';
          if(Array.isArray(payload)){
            entries = payload;
          } else if(payload && typeof payload === 'object'){
            if(Array.isArray(payload.entries)) entries = payload.entries;
            if(typeof payload.title === 'string') label = payload.title.trim();
          }
          if(!history[date]) history[date] = [];
          entries.forEach(line => {
            const match = String(line || '').match(/^(.+?):\s*Set\s+(\d+)\s*-/i);
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
          }
        });
      }

      if(incomingTitles){
        Object.keys(incomingTitles).forEach(date => {
          const label = incomingTitles[date];
          if(typeof label === 'string' && label.trim()){
            titles[date] = label.trim();
          } else if(!label){
            delete titles[date];
          }
        });
      }

      const titlesSaved = saveTitles();
      updateTitleSelect();
      return {dates:[...dates], added, skipped, titlesSaved};
    }

    function renderCalendar(){
      calendarEl.innerHTML='';
      const year = current.getFullYear();
      const month = current.getMonth();
      calTitle.textContent = current.toLocaleString('default',{month:'long',year:'numeric'});

      const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      weekDays.forEach(d => {
        const head = document.createElement('div');
        head.textContent = d;
        head.className = 'cal-header';
        head.setAttribute('role', 'columnheader');
        calendarEl.appendChild(head);
      });

      const first = new Date(year, month, 1);
      const start = first.getDay();
      const days = new Date(year, month+1, 0).getDate();
      const prevDays = new Date(year, month, 0).getDate();
      const totalCells = 42;
      for(let i=0;i<totalCells;i++){
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
        cell.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        cell.setAttribute(
          'aria-label',
          `${dateObj.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}${label ? `, ${label}` : ''}, ${hasWorkout ? 'workout logged' : 'no workout logged'}`,
        );
        cell.addEventListener('click', () => {
          selectedDate = dateStr;
          current = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
          renderCalendar();
          renderDay();
        });
        calendarEl.appendChild(cell);
      }
    }

    function renderDay(){
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
          form.addEventListener('click', ev => {
            const action = ev.target.getAttribute('data-action');
            if (action === 'save') {
              const updated = input.value.trim();
              if (updated) {
                history[selectedDate][idx] = updated;
              } else {
                history[selectedDate].splice(idx,1);
                if (history[selectedDate].length === 0) delete history[selectedDate];
              }
              save();
              renderDay();
              renderCalendar();
            }
            if (action === 'cancel') {
              form.remove();
              editBtn.focus();
            }
          });
        });
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.textContent = 'Del';
        delBtn.className = 'btn-mini del';
        delBtn.addEventListener('click', async () => {
          const ok = await confirmModal('Delete entry?', { yesText: 'Delete', noText: 'Cancel', title: 'Delete Entry' });
          if(!ok) return;
          history[selectedDate].splice(idx,1);
          if(history[selectedDate].length === 0) delete history[selectedDate];
          save();
          renderDay();
          renderCalendar();
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
      entryInput.value='';
      save();
      renderDay();
      renderCalendar();
      updateTitleSelect();
    });

    if(resetDayBtn){
      resetDayBtn.addEventListener('click', async () => {
        const ok = await confirmModal('Clear all entries for this day?', { yesText: 'Clear', noText: 'Cancel', title: 'Clear Day' });
        if(!ok) return;
        delete history[selectedDate];
        delete titles[selectedDate];
        save();
        saveTitles();
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
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const obj = safeParseJson(reader.result);
        if(obj){
          const res = mergeHistory(obj);
          if(res.dates.length) selectedDate = res.dates[0];
          if (!save() || !res.titlesSaved) return;
          renderCalendar();
          renderDay();
          updateTitleSelect();
          alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        } else {
          alert('Invalid file');
        }
      };
      reader.readAsText(file);
      importFile.value='';
    });

    importFromPaste.addEventListener('click', () => {
      const text = pasteJson.value;
      if(!text.trim()) return;
      if(handlePaste(text)) pasteJson.value='';
    });

    function handlePaste(text){
      const jsonObj = safeParseJson(text);
      if(jsonObj && typeof jsonObj === 'object'){
        const res = mergeHistory(jsonObj);
        if(res.dates.length) selectedDate = res.dates[0];
        if (!save() || !res.titlesSaved) return false;
        renderCalendar(); renderDay(); updateTitleSelect();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      const ai = parseAiText(text, selectedDate);
      if(ai){
        const res = mergeHistory(ai);
        if(res.dates.length) selectedDate = res.dates[0];
        if (!save() || !res.titlesSaved) return false;
        renderCalendar(); renderDay(); updateTitleSelect();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      const csv = parseCsv(text, selectedDate);
      if(csv){
        const res = mergeHistory(csv);
        if(res.dates.length) selectedDate = res.dates[0];
        if (!save() || !res.titlesSaved) return false;
        renderCalendar(); renderDay(); updateTitleSelect();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      alert('Could not parse input. Supported: JSON, AI text, CSV. Input: '+text.slice(0,120));
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
      calGo.disabled = !calGoto.value;
    });

    calGo.addEventListener('click', () => {
      if(!calGoto.value) return;
      const [y,m,d] = calGoto.value.split('-').map(Number);
      selectedDate = formatDate(new Date(y,m-1,d));
      current = new Date(y,m-1,1);
      renderCalendar();
      renderDay();
    });

    saveTodayBtn.addEventListener('click', () => {
      // Wait for session to be available
      const waitForSession = () => {
        if (typeof window.getSessionSnapshot !== 'function') {
          setTimeout(waitForSession, 100);
          return;
        }
        const snapshot = window.getSessionSnapshot();
        if (!snapshot.length) {
          alert('No session data to save');
          return;
        }
        const lines = snapshotToLines(snapshot);
        if(!lines.length){
          alert('No logged sets to save');
          return;
        }
        const today = formatDate(new Date());
        selectedDate = today;
        current = new Date();
        current.setDate(1);
        const res = mergeHistory({[today]: lines});
        if (!save() || !res.titlesSaved) return;
        renderDay();
        renderCalendar();
        updateTitleSelect();
        alert(`Saved ${res.added} lines, ${res.skipped} duplicates`);
      };
      waitForSession();
    });

    window.addEventListener('wt-history-updated', () => {
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
  module.exports = { parseDateLocal, parseAiText, parseCsv, snapshotToLines, formatDuration, cardioHistoryLine };
}
