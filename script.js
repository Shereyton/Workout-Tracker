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
  currentExercise = { name, sets: [], isSuperset: false };
  showInterface();
  exerciseNameEl.textContent = name;
  weightInput.value='';
  repsInput.value='';
  updateSetCounter();
  restBox.classList.add('hidden');
  restTimer = null;
  restSecondsRemaining = 0;
  saveState();
}

/* ------------------ SUPERSET MODE ------------------ */
function startSuperset(names){
  if(!session.startedAt) session.startedAt = new Date().toISOString();
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  currentExercise = {
    name: `${names[0]} + ${names[1]}`,
    sets: [],
    isSuperset: true,
    exercises: names.map(n => ({name:n}))
  };
  showInterface();
  exerciseNameEl.textContent = currentExercise.name;
  standardInputs.classList.add('hidden');
  supersetInputs.classList.remove('hidden');
  supersetInputs.innerHTML = currentExercise.exercises.map(ex=>{
    return `<input type="number" class="field superset-field" data-name="${ex.name}" placeholder="${ex.name} weight (lbs)">
            <input type="number" class="field superset-field" data-name="${ex.name}" placeholder="${ex.name} reps">`;
  }).join('');
  updateSetCounter();
  restBox.classList.add('hidden');
  restTimer = null;
  restSecondsRemaining = 0;
  saveState();
}

/* ------------------ INTERFACE ------------------ */
function showInterface(){
  interfaceBox.classList.remove('hidden');
  exerciseSelect.classList.add('hidden');
}

function updateSetCounter(){
  const count = currentExercise.sets.length + 1;
  setCounterEl.textContent = count;
}

logBtn.addEventListener('click', () => {
  if(currentExercise.isSuperset){
    const fields = [...supersetInputs.querySelectorAll('.superset-field')];
    const inputs = [];
    for(let i=0;i<fields.length;i+=2){
      const w = parseFloat(fields[i].value);
      const r = parseInt(fields[i+1].value,10);
      inputs.push({weight:w,reps:r,name:fields[i].dataset.name});
    }
    if(inputs.some(inp => !canLogSet(inp.weight, inp.reps))) {
      alert('Invalid inputs');
      return;
    }
    const set = {
      set: currentExercise.sets.length + 1,
      time: new Date().toISOString(),
      restPlanned: useTimerEl.checked ? parseInt(restSecsInput.value,10) : null,
      exercises: inputs.map(i => ({name:i.name,weight:i.weight,reps:i.reps}))
    };
    currentExercise.sets.push(set);
    fields.forEach(f => f.value='');
    if(useTimerEl.checked){
      startRestTimer(set);
    }
  } else {
    const w = parseFloat(weightInput.value);
    const r = parseInt(repsInput.value,10);
    if(!canLogSet(w,r)){
      alert('Enter valid weight and reps');
      return;
    }
    const set = {
      set: currentExercise.sets.length + 1,
      weight:w,reps:r,
      time:new Date().toISOString(),
      restPlanned: useTimerEl.checked ? parseInt(restSecsInput.value,10) : null
    };
    currentExercise.sets.push(set);
    weightInput.value=''; repsInput.value='';
    if(useTimerEl.checked){
      startRestTimer(set);
    }
  }
  rebuildSetsList();
  updateSetCounter();
  saveState();
});

function rebuildSetsList(){
  setsList.innerHTML='';
  session.exercises.forEach(ex => {
    ex.sets.forEach(set => addSetRow(ex.name,set));
  });
  if(currentExercise){
    currentExercise.sets.forEach(set => addSetRow(currentExercise.name,set));
  }
}

function addSetRow(name,set){
  const div = document.createElement('div');
  div.className='set-item';
  const label = document.createElement('div');
  label.className='set-label';
  label.textContent = `${name} - Set ${set.set}`;
  const meta = document.createElement('div');
  meta.className='set-meta';
  if(set.exercises){
    meta.textContent = set.exercises.map(s=>`${s.name}: ${s.weight}×${s.reps}`).join('; ');
  } else {
    meta.textContent = `${set.weight} lbs × ${set.reps}`;
  }
  div.appendChild(label); div.appendChild(meta);
  setsList.appendChild(div);
}

/* ------------------ REST TIMER ------------------ */
function startRestTimer(set){
  restSecondsRemaining = set.restPlanned;
  restSetIndex = set.set;
  restStartMs = Date.now();
  restDisplay.textContent = formatTime(restSecondsRemaining);
  restBox.classList.remove('hidden');
  restTimer = setInterval(()=>{
    restSecondsRemaining--;
    restDisplay.textContent = formatTime(restSecondsRemaining);
    if(restSecondsRemaining <= 0){
      clearInterval(restTimer);
      restTimer = null;
      alert('Rest over!');
      restBox.classList.add('hidden');
    }
  },1000);
}

restBox.addEventListener('click', () => {
  if(restTimer){
    clearInterval(restTimer);
    restTimer = null;
    const actual = Math.round((Date.now()-restStartMs)/1000);
    const exercise = currentExercise;
    const set = exercise.sets.find(s=>s.set===restSetIndex);
    if(set) set.restActual = actual;
    restBox.classList.add('hidden');
  }
});

/* ------------------ NAVIGATION ------------------ */
nextExerciseBtn.addEventListener('click', () => {
  if(currentExercise && currentExercise.sets.length){
    pushOrMergeExercise(currentExercise);
  }
  currentExercise = null;
  interfaceBox.classList.add('hidden');
  exerciseSelect.classList.remove('hidden');
  summaryText.textContent = buildSummaryText();
  saveState();
});

resetBtn.addEventListener('click', () => {
  if(confirm('Reset session?')){
    session = { exercises: [], startedAt: null };
    currentExercise = null;
    interfaceBox.classList.add('hidden');
    exerciseSelect.classList.remove('hidden');
    setsList.innerHTML='';
    summaryText.textContent = 'Start your first exercise to begin tracking.';
    restBox.classList.add('hidden');
    restTimer = null;
    restSecondsRemaining = 0;
    saveState();
  }
});

/* ------------------ EXPORT ------------------ */
exportBtn.addEventListener('click', () => {
  const exportExercises = [...session.exercises];
  if(currentExercise && currentExercise.sets.length){
    exportExercises.push(currentExercise);
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

function formatTime(sec){
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${m}:${s}`;
}

function pushOrMergeExercise(ex){
  const existing = session.exercises.find(e => e.name === ex.name && e.isSuperset === ex.isSuperset);
  if(existing){
    existing.sets.push(...ex.sets.map(s => ({...s, set: existing.sets.length + s.set})));
  } else {
    session.exercises.push(ex);
  }
  summaryText.textContent = buildSummaryText();
}

function buildSummaryText(){
  return session.exercises.map(ex => {
    const total = ex.sets.length;
    return `${ex.name} (${total} set${total!==1?'s':''})`;
  }).join(', ') || 'Start your first exercise to begin tracking.';
}

/* ------------------ EXPORT UTIL ------------------ */
function formatSecOrBlank(sec){
  return sec != null ? sec : '';
}

/* ------------------ SHORTCUTS ------------------ */
repsInput.addEventListener('keydown', e => {
  if(e.key==='Enter') logBtn.click();
});
weightInput.addEventListener('keydown', e => {
  if(e.key==='Enter') repsInput.focus();
});
}

/* ------------------ SNAPSHOT ------------------ */
function getSessionSnapshot(){
  const snapshot = session.exercises.map(ex => ({
    name: ex.name,
    isSuperset: ex.isSuperset || false,
    exercises: ex.exercises ? [...ex.exercises] : undefined,
    sets: ex.sets.map(s => ({...s}))
  }));
  if(currentExercise){
    snapshot.push({
      name: currentExercise.name,
      isSuperset: currentExercise.isSuperset || false,
      exercises: currentExercise.exercises ? [...currentExercise.exercises] : undefined,
      sets: currentExercise.sets.map(s => ({...s}))
    });
  }
  return snapshot;
}

if (typeof window !== 'undefined') {
  window.getSessionSnapshot = getSessionSnapshot;
}

if (typeof module !== 'undefined') {
  module.exports = { canLogSet };
}
