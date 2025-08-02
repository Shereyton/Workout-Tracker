/* ------------------ STATE ------------------ */
let session = { exercises: [], startedAt: null };
let currentExercise = null;
if (typeof localStorage !== 'undefined') {
  session = JSON.parse(localStorage.getItem('wt_session')) || { exercises: [], startedAt: null };
  currentExercise = JSON.parse(localStorage.getItem('wt_currentExercise')) || null;
}

let restTimer = null;
let restSecondsRemaining = 0;
let restStartMs = 0;
let restSetIndex = null;

function canLogSet(w, r){
  return !Number.isNaN(w) && !Number.isNaN(r) && r > 0;
}

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== 'undefined' && document.getElementById('today')) {
const todayEl          = document.getElementById('today');
const darkToggle       = document.getElementById('darkToggle');
const themeIcon        = document.getElementById('themeIcon');
const themeLabel       = document.getElementById('themeLabel');
const exerciseSelect   = document.getElementById('exerciseSelect');
const interfaceBox     = document.getElementById('interface');
const exerciseNameEl   = document.getElementById('exerciseName');
const setCounterEl     = document.getElementById('setCounter');
const weightInput      = document.getElementById('weight');
const repsInput        = document.getElementById('reps');
const logBtn           = document.getElementById('logBtn');
const setsList         = document.getElementById('setsList');
const summaryText      = document.getElementById('summaryText');
const nextExerciseBtn  = document.getElementById('nextExerciseBtn');
const resetBtn         = document.getElementById('resetBtn');
const exportBtn        = document.getElementById('exportBtn');
const restBox          = document.getElementById('restBox');
const restDisplay      = document.getElementById('restDisplay');
const useTimerEl       = document.getElementById('useTimer');
const restSecsInput    = document.getElementById('restSecsInput');
const addExerciseBtn   = document.getElementById('addExercise');
const customExerciseInput = document.getElementById('customExercise');
const startSupersetBtn = document.getElementById('startSuperset');
const supersetInputs   = document.getElementById('supersetInputs');
const standardInputs   = document.getElementById('standardInputs');
const supersetBuilder  = document.getElementById('supersetBuilder');
const supersetSelect1  = document.getElementById('supersetSelect1');
const supersetSelect2  = document.getElementById('supersetSelect2');
const beginSupersetBtn = document.getElementById('beginSuperset');

/* ------------------ INIT ------------------ */
todayEl.textContent = new Date().toLocaleDateString('en-US',{
  weekday:'long',year:'numeric',month:'long',day:'numeric'
});

if (currentExercise) {
  showInterface();
  rebuildSetsList();
  updateSetCounter();
}
updateSummary();

/* ------------------ THEME ------------------ */
if(localStorage.getItem('wt_theme') === 'dark'){
  document.body.classList.add('dark');
  themeIcon.textContent = '☀️';
  themeLabel.textContent = 'Light';
}
darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  themeIcon.textContent = dark ? '☀️' : '🌙';
  themeLabel.textContent = dark ? 'Light' : 'Dark';
  localStorage.setItem('wt_theme', dark ? 'dark' : 'light');
});

/* ------------------ CUSTOM EXERCISE ------------------ */
addExerciseBtn.addEventListener('click', () => {
  const name = customExerciseInput.value.trim();
  if(!name) return;
  const opt = document.createElement('option');
  opt.textContent = name;
  exerciseSelect.appendChild(opt);
  exerciseSelect.value = name;
  customExerciseInput.value = '';
  startExercise(name);
});

/* ------------------ SUPERSET ------------------ */
function populateSupersetSelects(){
  [supersetSelect1,supersetSelect2].forEach(sel=>{
    sel.innerHTML = exerciseSelect.innerHTML;
    sel.value = '';
  });
}

startSupersetBtn.addEventListener('click', () => {
  supersetBuilder.classList.toggle('hidden');
  if(!supersetBuilder.classList.contains('hidden')){
    populateSupersetSelects();
  }
});

beginSupersetBtn.addEventListener('click', () => {
  const n1 = supersetSelect1.value;
  const n2 = supersetSelect2.value;
  if(!n1 || !n2){
    alert('Choose two exercises');
    return;
  }
  supersetBuilder.classList.add('hidden');
  startSuperset([n1,n2]);
});

/* ------------------ SELECT EXERCISE ------------------ */
exerciseSelect.addEventListener('change', e => {
  if(e.target.value) startExercise(e.target.value);
});

function startExercise(name){
  if(!session.startedAt) session.startedAt = new Date().toISOString();
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  currentExercise = { name, sets: [], nextSet: 1 };
  supersetInputs.classList.add('hidden');
  standardInputs.classList.remove('hidden');
  supersetBuilder.classList.add('hidden');
  saveState();
  showInterface();
  rebuildSetsList();
  updateSetCounter();
  weightInput.focus();
}

function startSuperset(namesArr){
  if(!session.startedAt) session.startedAt = new Date().toISOString();
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  const clean = namesArr.filter(Boolean);
  currentExercise = { name: clean.join(' + '), isSuperset:true, exercises:[...clean], sets:[], nextSet:1 };
  setupSupersetInputs(clean);
  standardInputs.classList.add('hidden');
  supersetInputs.classList.remove('hidden');
  supersetBuilder.classList.add('hidden');
  saveState();
  showInterface();
  rebuildSetsList();
  updateSetCounter();
  document.querySelector('#weight0').focus();
}

function setupSupersetInputs(arr){
  supersetInputs.innerHTML='';
  arr.forEach((name,i)=>{
    const row=document.createElement('div');
    row.className='inline-row';
    row.innerHTML=`<input type="number" id="weight${i}" class="field superset-field" placeholder="${name} weight" min="0"><input type="number" id="reps${i}" class="field superset-field" placeholder="${name} reps" min="1">`;
    supersetInputs.appendChild(row);
  });
}

function showInterface(){
  interfaceBox.classList.remove('hidden');
  exerciseNameEl.textContent = currentExercise.name;
}

/* ------------------ LOG SET ------------------ */
logBtn.addEventListener('click', function(){
  if(currentExercise.isSuperset){
    const setGroup = currentExercise.exercises.map((ex,i)=>{
      const w=parseInt(document.getElementById(`weight${i}`).value,10);
      const r=parseInt(document.getElementById(`reps${i}`).value,10);
      return {name:ex, weight:w, reps:r};
    });
    if(setGroup.some(s=>!canLogSet(s.weight,s.reps))){
      alert('Enter weight & reps for all exercises');
      return;
    }
    const useTimer = useTimerEl.checked;
    const planned = useTimer ? (parseInt(restSecsInput.value,10) || 0) : null;
    currentExercise.sets.push({
      set: currentExercise.nextSet,
      exercises:setGroup,
      time:new Date().toLocaleTimeString(),
      restPlanned:planned,
      restActual:null
    });
    addSetElement(currentExercise.sets[currentExercise.sets.length-1], currentExercise.sets.length-1);
    currentExercise.nextSet++;
    updateSetCounter();
    currentExercise.exercises.forEach((_,i)=>{
      document.getElementById(`weight${i}`).value='';
      document.getElementById(`reps${i}`).value='';
    });
    if(useTimer && planned!=null){
      startRest(planned, currentExercise.sets.length-1);
    }
    updateSummary();
    saveState();
    return;
  }

  const w = parseInt(weightInput.value, 10);
  const r = parseInt(repsInput.value, 10);

  if (!canLogSet(w, r)) {
    alert('Enter weight & reps');
    return;
  }

  const useTimer = useTimerEl.checked;
  const planned = useTimer ? (parseInt(restSecsInput.value,10) || 0) : null;

  currentExercise.sets.push({
    set: currentExercise.nextSet,
    weight: w,
    reps: r,
    time: new Date().toLocaleTimeString(),
    restPlanned: planned,
    restActual: null
  });

  addSetElement(currentExercise.sets[currentExercise.sets.length - 1], currentExercise.sets.length - 1);
  currentExercise.nextSet++;
  updateSetCounter();

  weightInput.select();
  repsInput.value = '';
  repsInput.focus();

  if (useTimer && planned != null) {
    startRest(planned, currentExercise.sets.length - 1);
  }

  updateSummary();
  saveState();
});

function addSetElement(setObj,index){
  const item = document.createElement('div');
  item.className = 'set-item';
  item.dataset.index = index;

  const restInfo = setObj.restActual != null
    ? ` • Rest: ${formatSec(setObj.restActual)}`
    : (setObj.restPlanned != null ? ` • Rest planned: ${formatSec(setObj.restPlanned)}` : '');

  let meta = '';
  if(currentExercise.isSuperset){
    meta = setObj.exercises.map(e=>`${e.name}: ${e.weight}×${e.reps}`).join(' |');
  } else {
    meta = `${setObj.weight} lbs × ${setObj.reps} reps`;
  }

  item.innerHTML = `
    <div style="flex:1;min-width:150px;">
      <div class="set-label">${currentExercise.name} – Set ${setObj.set}</div>
      <div class="set-meta">${meta}${restInfo}</div>
    </div>
    <div class="set-actions">
      <button class="btn-mini edit" data-action="edit">Edit</button>
      <button class="btn-mini del"  data-action="del">Del</button>
    </div>
  `;
  setsList.appendChild(item);
}

function rebuildSetsList(){
  setsList.innerHTML='';
  if(!currentExercise) return;
  currentExercise.sets.forEach((s,i)=> addSetElement(s,i));
}

/* ------------------ EDIT / DELETE ------------------ */
setsList.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if(!btn) return;
  const action = btn.dataset.action;
  const item = btn.closest('.set-item');
  const idx = parseInt(item.dataset.index, 10);
  if(action==='del') deleteSet(idx);
  else if(action==='edit') openEditForm(item, idx);
});

function deleteSet(idx){
  if (!confirm('Delete this set?')) return;
  currentExercise.sets.splice(idx, 1);
  renumberSets();
  rebuildSetsList();
  updateSetCounter();
  updateSummary();
  saveState();
}

/* === FIXED EDIT FORM === */
function openEditForm(item, idx){
  if(item.querySelector('.edit-form')) return;
  const s = currentExercise.sets[idx];

  const form = document.createElement('div');
  form.className = 'edit-form';
  if(currentExercise.isSuperset){
    let rows='';
    s.exercises.forEach((ex,i)=>{
      rows += `<div class="row"><span style="font-size:12px;flex-basis:100%;">${ex.name}</span><input type="number" class="editW${i}" value="${ex.weight}" min="0"><input type="number" class="editR${i}" value="${ex.reps}" min="1"></div>`;
    });
    form.innerHTML = `${rows}<div class="row2"><button type="button" class="btn-mini edit" data-edit-save>Save</button><button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button></div>`;
  } else {
    form.innerHTML = `
      <div class="row">
        <input type="number" class="editW" value="${s.weight}" min="0">
        <input type="number" class="editR" value="${s.reps}"   min="1">
      </div>
      <div class="row">
        <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ''}" min="0" placeholder="Rest planned (sec)">
        <input type="number" class="editRestActual"  value="${s.restActual  ?? ''}" min="0" placeholder="Rest actual (sec)">
      </div>
      <div class="row2">
        <button type="button" class="btn-mini edit" data-edit-save>Save</button>
        <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
      </div>
    `;
  }
  item.appendChild(form);

  form.addEventListener('click', ev => {
    if (ev.target.hasAttribute('data-edit-save')) {
      if(currentExercise.isSuperset){
        let bad=false;
        s.exercises.forEach((ex,i)=>{
          const w=parseInt(form.querySelector(`.editW${i}`).value,10);
          const r=parseInt(form.querySelector(`.editR${i}`).value,10);
          if(isNaN(w)||isNaN(r)) bad=true;
          ex.weight=w; ex.reps=r;
        });
        if(bad){
          alert('Enter valid numbers');
          return;
        }
      } else {
        const newW  = parseInt(form.querySelector('.editW').value, 10);
        const newR  = parseInt(form.querySelector('.editR').value, 10);
        const vPlanned = form.querySelector('.editRestPlanned').value;
        const vActual  = form.querySelector('.editRestActual').value;

        const newPlanned = vPlanned === '' ? null : parseInt(vPlanned, 10);
        const newActual  = vActual  === '' ? null : parseInt(vActual, 10);

        if (isNaN(newW) || isNaN(newR)) {
          alert('Enter valid weight & reps');
          return;
        }

        s.weight = newW;
        s.reps   = newR;
        s.restPlanned = newPlanned;
        s.restActual  = newActual;
      }

      saveState();
      rebuildSetsList();
      updateSummary();
      form.remove();
      return;
    }
    if (ev.target.hasAttribute('data-edit-cancel')) {
      form.remove();
      return;
    }
  });
}

function renumberSets(){
  currentExercise.sets.forEach((s,i)=> s.set = i + 1);
  currentExercise.nextSet = currentExercise.sets.length + 1;
}

function updateSetCounter(){
  if(!currentExercise) return;
  setCounterEl.textContent = currentExercise.nextSet;
  exerciseNameEl.textContent = currentExercise.name;
}

/* ------------------ NEXT EXERCISE ------------------ */
nextExerciseBtn.addEventListener('click', () => {
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  currentExercise = null;
  exerciseSelect.value = '';
  interfaceBox.classList.add('hidden');
  weightInput.value = '';
  repsInput.value = '';

  if (restTimer) {
    clearInterval(restTimer);
    restBox.classList.add('hidden');
  }

  updateSummary();
  saveState();
});

function pushOrMergeExercise(ex){
  const existing = session.exercises.find(e => e.name === ex.name);
  if(existing){
    ex.sets.forEach(s=>{
      existing.sets.push(JSON.parse(JSON.stringify({...s, set: existing.sets.length + 1})));
    });
  } else {
    session.exercises.push({
      name: ex.name,
      isSuperset: ex.isSuperset || false,
      exercises: ex.exercises ? [...ex.exercises] : undefined,
      sets: ex.sets.map(s=> ({...s}))
    });
  }
}

/* ------------------ REST TIMER ------------------ */
function startRest(seconds,setIndex){
  stopRest();
  restSecondsRemaining = seconds;
  restStartMs = Date.now();
  restSetIndex = setIndex;
  updateRestDisplay();
  restBox.classList.remove('hidden');
  restTimer = setInterval(() => {
    restSecondsRemaining--;
    updateRestDisplay();
    if(restSecondsRemaining <= 0){
      finishRest();
      restDisplay.textContent = 'Ready!';
      setTimeout(() => restBox.classList.add('hidden'), 1500);
    }
  }, 1000);
}

function stopRest(){
  if (restTimer) {
    clearInterval(restTimer);
    restTimer = null;
  }
}

function finishRest(){
  stopRest();
  const elapsed = Math.round((Date.now() - restStartMs)/1000);
  if(currentExercise && restSetIndex!=null && currentExercise.sets[restSetIndex]){
    currentExercise.sets[restSetIndex].restActual = elapsed;
    saveState();
    rebuildSetsList();
  }
  restSetIndex = null;
}

function updateRestDisplay(){
  const m = Math.floor(restSecondsRemaining/60);
  const s = restSecondsRemaining % 60;
  restDisplay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

restBox.addEventListener('click', function(){
  finishRest();
  restBox.classList.add('hidden');
});

/* ------------------ RESET WORKOUT ------------------ */
resetBtn.addEventListener('click', ()=>{
  if(!confirm('Reset entire workout?')) return;
  stopRest();
  session = { exercises: [], startedAt:null };
  currentExercise = null;
  exerciseSelect.value='';
  interfaceBox.classList.add('hidden');
  setsList.innerHTML='';
  weightInput.value=''; repsInput.value='';
  updateSummary();
  saveState();
});

/* ------------------ SUMMARY ------------------ */
function updateSummary(){
  let totalSets = 0;
  const lines = [];
  session.exercises.forEach((ex,i)=>{
    totalSets += ex.sets.length;
    lines.push(`<div class="summary-item">${ex.name}: ${ex.sets.length} sets <button class="btn-mini edit" data-summary-edit="${i}">Edit</button></div>`);
  });
  if (currentExercise && currentExercise.sets.length){
    totalSets += currentExercise.sets.length;
    lines.push(`<div class="summary-item">${currentExercise.name}: ${currentExercise.sets.length} sets (in progress)</div>`);
  }

  if(totalSets === 0){
    summaryText.textContent = 'Start your first exercise to begin tracking.';
  } else {
    summaryText.innerHTML = `<strong>Total Sets: ${totalSets}</strong><br>${lines.join('')}`;
  }
}

summaryText.addEventListener('click', e => {
  const btn = e.target.closest('button[data-summary-edit]');
  if(!btn) return;
  const idx = parseInt(btn.dataset.summaryEdit,10);
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  currentExercise = session.exercises.splice(idx,1)[0];
  showInterface();
  if(currentExercise.isSuperset){
    setupSupersetInputs(currentExercise.exercises);
    standardInputs.classList.add('hidden');
    supersetInputs.classList.remove('hidden');
  } else {
    supersetInputs.classList.add('hidden');
    standardInputs.classList.remove('hidden');
  }
  rebuildSetsList();
  updateSetCounter();
  updateSummary();
});

/* ------------------ EXPORT ------------------ */
exportBtn.addEventListener('click', () => {
  const exportExercises = session.exercises.map(e => ({...e, sets:[...e.sets]}));
  if(currentExercise && currentExercise.sets.length){
    const exExisting = exportExercises.find(e=> e.name===currentExercise.name);
    if(exExisting){
      currentExercise.sets.forEach(s=>{
        exExisting.sets.push({
          set: exExisting.sets.length+1,
          weight:s.weight, reps:s.reps, time:s.time,
          restPlanned:s.restPlanned, restActual:s.restActual
        });
      });
    } else {
      exportExercises.push({ name: currentExercise.name, sets: currentExercise.sets.map(s=>({...s})) });
    }
  }
  if(!exportExercises.length){
    alert('No workout data yet.');
    return;
  }
  const totalSets = exportExercises.reduce((sum,e)=> sum+e.sets.length,0);
  const payload = {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    totalExercises: exportExercises.length,
    totalSets,
    exercises: exportExercises
  };

  // JSON
  const jsonStr = JSON.stringify(payload,null,2);
  triggerDownload(new Blob([jsonStr], {type:'application/json'}), `workout_${payload.date}.json`);

  // CSV (with rest columns)
  let csv = 'Exercise,Set,Weight,Reps,Time,RestPlanned(sec),RestActual(sec)\n';
  exportExercises.forEach(ex => {
    ex.sets.forEach(s => {
      if(ex.isSuperset){
        s.exercises.forEach(sub=>{
          csv += `${sub.name},${s.set},${sub.weight},${sub.reps},${s.time},${s.restPlanned ?? ''},${s.restActual ?? ''}\n`;
        });
      } else {
        csv += `${ex.name},${s.set},${s.weight},${s.reps},${s.time},${s.restPlanned ?? ''},${s.restActual ?? ''}\n`;
      }
    });
  });
  triggerDownload(new Blob([csv], {type:'text/csv'}), `workout_${payload.date}.csv`);

  // AI text
  let aiText = `WORKOUT DATA - ${payload.date}\n\n`;
  exportExercises.forEach(ex=>{
    if(ex.isSuperset){
      aiText += `${ex.name}:\n`;
      ex.sets.forEach(s=>{
        const rp = s.restPlanned!=null ? ` (planned ${formatSec(s.restPlanned)}` : '';
        const ra = s.restActual !=null ? `${rp?'; ': ' ('}actual ${formatSec(s.restActual)})` : (rp?')':'');
        s.exercises.forEach(sub=>{
          aiText += `  Set ${s.set} - ${sub.name}: ${sub.weight} lbs × ${sub.reps} reps${rp||ra? (rp?rp:'')+(ra?ra:''):''}\n`;
        });
      });
    } else {
      aiText += `${ex.name}:\n`;
      ex.sets.forEach(s=>{
        const rp = s.restPlanned!=null ? ` (planned ${formatSec(s.restPlanned)}` : '';
        const ra = s.restActual !=null ? `${rp?'; ': ' ('}actual ${formatSec(s.restActual)})` : (rp?')':'');
        aiText += `  Set ${s.set}: ${s.weight} lbs × ${s.reps} reps${rp||ra? (rp?rp:'')+(ra?ra:''):''}\n`;
      });
    }
    aiText += '\n';
  });
  aiText += `Summary: ${payload.totalExercises} exercises, ${payload.totalSets}total sets.\n\n`;
  aiText += `Please analyze progress vs previous sessions, suggest next targets, identify weak points, and recommend optimal weight/rep progressions.`;

  if(navigator.clipboard){
    navigator.clipboard.writeText(aiText).then(()=>{
      alert('Exported JSON + CSV. AI summary copied to clipboard ✅');
    }).catch(()=> alert('Exported files. (Clipboard copy failed)'));
  } else {
    alert('Exported JSON + CSV. Copy this manually:\n\n' + aiText);
  }
});

function triggerDownload(blob, filename){
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ------------------ SAVE / LOAD ------------------ */
function saveState(){
  localStorage.setItem('wt_session', JSON.stringify(session));
  localStorage.setItem('wt_currentExercise', JSON.stringify(currentExercise));
}

/* ------------------ UTILS ------------------ */
function formatSec(sec){
  const m=Math.floor(sec/60), s=sec%60;
  return `${m}m ${s}s`;
}

/* ------------------ SHORTCUTS ------------------ */
repsInput.addEventListener('keydown', e => {
  if(e.key==='Enter') logBtn.click();
});
weightInput.addEventListener('keydown', e => {
  if(e.key==='Enter') repsInput.focus();
});
}

if (typeof module !== 'undefined') {
  module.exports = { canLogSet };
}
