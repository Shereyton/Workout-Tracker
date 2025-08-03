function parseDateLocal(str){
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

if (typeof document !== 'undefined' && document.getElementById('calendar')) {
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
    const pasteToggle = document.getElementById('pasteHistoryToggle');
    const pasteBox = document.getElementById('pasteHistoryBox');
    const pasteText = document.getElementById('pasteHistoryText');
    const pasteImport = document.getElementById('pasteHistoryImport');

  function formatDate(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function mergeHistory(obj){
    Object.keys(obj).forEach(date => {
      if(Array.isArray(obj[date])){
        if(!history[date]) history[date] = [];
        history[date].push(...obj[date]);
      }
    });
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
        selectedDate = formatDate(dateObj);
        current = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
        renderCalendar();
        renderDay();
      });
      calendarEl.appendChild(cell);
    }
  }

  function renderDay(){
    dayTitle.textContent = parseDateLocal(selectedDate).toDateString();
    entriesEl.innerHTML = '';
    const list = history[selectedDate] || [];
    list.forEach((text, idx) => {
      const li = document.createElement('li');
      li.textContent = text;
      li.addEventListener('click', () => {
        const updated = prompt('Edit entry', text);
        if(updated !== null){
          history[selectedDate][idx] = updated.trim();
          if(!history[selectedDate][idx]) history[selectedDate].splice(idx,1);
          if(history[selectedDate].length === 0) delete history[selectedDate];
          save();
          renderDay();
          renderCalendar();
        }
      });
      li.addEventListener('contextmenu', e => {
        e.preventDefault();
        if(confirm('Delete entry?')){
          history[selectedDate].splice(idx,1);
          if(history[selectedDate].length === 0) delete history[selectedDate];
          save();
          renderDay();
          renderCalendar();
        }
      });
      entriesEl.appendChild(li);
    });
  }

  addEntryBtn.addEventListener('click', () => {
    const val = entryInput.value.trim();
    if(!val) return;
    if(!history[selectedDate]) history[selectedDate] = [];
    history[selectedDate].push(val);
    entryInput.value='';
    save();
    renderDay();
    renderCalendar();
  });

  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'workout_history.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        if(typeof obj === 'object' && obj){
          history = obj;
          save();
          renderCalendar();
          renderDay();
          alert('History imported');
        }
      } catch(err){
        alert('Invalid file');
      }
    };
    reader.readAsText(file);
    importFile.value='';
  });

  pasteToggle.addEventListener('click', () => {
    pasteBox.classList.toggle('hidden');
  });

  pasteImport.addEventListener('click', () => {
    try {
      const obj = JSON.parse(pasteText.value);
      if(typeof obj === 'object' && obj){
        mergeHistory(obj);
        save();
        renderCalendar();
        renderDay();
        alert('History imported');
        pasteText.value='';
        pasteBox.classList.add('hidden');
      } else {
        alert('Invalid JSON');
      }
    } catch(err){
      alert('Invalid JSON');
    }
  });

  calPrev.addEventListener('click', () => {
    current.setMonth(current.getMonth()-1);
    selectedDate = formatDate(new Date(current.getFullYear(), current.getMonth(), 1));
    renderCalendar();
    renderDay();
  });

  calNext.addEventListener('click', () => {
    current.setMonth(current.getMonth()+1);
    selectedDate = formatDate(new Date(current.getFullYear(), current.getMonth(), 1));
    renderCalendar();
    renderDay();
  });

  saveTodayBtn.addEventListener('click', () => {
    if (typeof window.getSessionSnapshot !== 'function') {
      alert('Session not available');
      return;
    }
    const snapshot = window.getSessionSnapshot();
    if (!snapshot.length) {
      alert('No session data to save');
      return;
    }
    const lines = [];
    snapshot.forEach(ex => {
      if (ex.isSuperset) {
        ex.sets.forEach(set => {
          set.exercises.forEach(sub => {
            lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`);
          });
        });
      } else {
        ex.sets.forEach(set => {
          lines.push(`${ex.name}: ${set.weight} lbs × ${set.reps} reps`);
        });
      }
    });
    if (!history[selectedDate]) history[selectedDate] = [];
    history[selectedDate].push(...lines);
    save();
    renderDay();
    renderCalendar();
  });

  renderCalendar();
  renderDay();
}
if (typeof module !== 'undefined') {
  module.exports = { parseDateLocal };
}
