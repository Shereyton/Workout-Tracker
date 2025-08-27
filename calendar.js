function parseDateLocal(str){
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
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
    const setMatch = trimmed.match(/^(?:Set\s+\d+\s*[-–:]?\s*)?(.*?):\s*(\d+(?:\.\d+)?)\s*(?:lbs|kg)\s*[×xX]\s*(\d+)\s*reps/i);
    if(setMatch){
      let name = setMatch[1].trim();
      if(!name && currentExercise) name = currentExercise;
      if(name){
        out.push(`${name}: ${setMatch[2]} lbs × ${setMatch[3]} reps`);
      }
    }
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
  lines.shift();
  const out = [];
  lines.forEach(l=>{
    const cols = l.split(',');
    if(cols.length >=4){
      out.push(`${cols[0].trim()}: ${cols[2].trim()} lbs × ${cols[3].trim()} reps`);
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
          lines.push(`${sub.name}: Set ${setIdx+1} - ${sub.weight} lbs × ${sub.reps} reps`);
        });
      });
    } else {
      ex.sets.forEach((set, setIdx) => {
        lines.push(`${ex.name}: Set ${setIdx+1} - ${set.weight} lbs × ${set.reps} reps`);
      });
    }
  });
  return lines;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if(!document.getElementById('calendar')) return;
    const STORAGE_KEY = 'wt_history';
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
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

    function updateDateInput(){
      calGoto.value = selectedDate;
      calGo.disabled = !calGoto.value;
    }
    updateDateInput();

    function formatDate(d){
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function save(){
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    function mergeHistory(obj){
      const dates = new Set();
      let added = 0;
      let skipped = 0;
      Object.keys(obj).forEach(date => {
        if(Array.isArray(obj[date])){
          if(!history[date]) history[date] = [];
          obj[date].forEach(line => {
            if(!history[date].includes(line)){
              history[date].push(line);
              added++; dates.add(date);
            } else {
              skipped++;
            }
          });
        }
      });
      return {dates:[...dates], added, skipped};
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
        calendarEl.appendChild(head);
      });

      const first = new Date(year, month, 1);
      const start = first.getDay();
      const days = new Date(year, month+1, 0).getDate();
      const prevDays = new Date(year, month, 0).getDate();
      const totalCells = 42;
      for(let i=0;i<totalCells;i++){
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
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
        if(history[dateStr] && history[dateStr].length){
          cell.classList.add('has-data');
        }
        if(dateStr === selectedDate) cell.classList.add('selected');
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
      dayTitle.textContent = dateObj.toDateString();
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
          form.innerHTML = `
            <div class="row">
              <input type="text" class="editEntryInput" value="${text}">
            </div>
            <div class="row2">
              <button type="button" class="btn-mini edit" data-action="save">Save</button>
              <button type="button" class="btn-mini del" data-action="cancel">Cancel</button>
            </div>
          `;
          li.appendChild(form);
          const input = form.querySelector('.editEntryInput');
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
        delBtn.addEventListener('click', () => {
          if(confirm('Delete entry?')){
            history[selectedDate].splice(idx,1);
            if(history[selectedDate].length === 0) delete history[selectedDate];
            save();
            renderDay();
            renderCalendar();
          }
        });
        actions.appendChild(delBtn);

        li.appendChild(actions);
        entriesEl.appendChild(li);
      });
      if(resetDayBtn){
        resetDayBtn.disabled = list.length === 0;
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
    });

    if(resetDayBtn){
      resetDayBtn.addEventListener('click', () => {
        if(confirm('Clear all entries for this day?')){
          delete history[selectedDate];
          save();
          renderDay();
          renderCalendar();
        }
      });
    }

    exportBtn.addEventListener('click', () => {
      const data = JSON.stringify(history, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'workout_history.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
          save();
          renderCalendar();
          renderDay();
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
        save(); renderCalendar(); renderDay();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      const ai = parseAiText(text, selectedDate);
      if(ai){
        const res = mergeHistory(ai);
        if(res.dates.length) selectedDate = res.dates[0];
        save(); renderCalendar(); renderDay();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      const csv = parseCsv(text, selectedDate);
      if(csv){
        const res = mergeHistory(csv);
        if(res.dates.length) selectedDate = res.dates[0];
        save(); renderCalendar(); renderDay();
        alert(`History imported: ${res.dates.length} dates, ${res.added} lines, ${res.skipped} duplicates`);
        return true;
      }
      alert('Could not parse input. Supported: JSON, AI text, CSV. Input: '+text.slice(0,120));
      return false;
    }

    function safeParseJson(text){
      try{ return JSON.parse(text); }catch(e){}
      const extracted = extractJsonFromText(text);
      if(!extracted) return null;
      try{ return JSON.parse(extracted); }catch(e){}
      return null;
    }

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
        const res = mergeHistory({[selectedDate]: lines});
        save();
        renderDay();
        renderCalendar();
        alert(`Saved ${res.added} lines, ${res.skipped} duplicates`);
      };
      waitForSession();
    });

    window.addEventListener('wt-history-updated', () => {
      renderCalendar();
      renderDay();
    });

    renderCalendar();
    renderDay();
  });
}
if (typeof module !== 'undefined') {
  module.exports = { parseDateLocal, parseAiText, parseCsv, snapshotToLines };
}
