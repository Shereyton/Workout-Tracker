function toDayISO(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function dateFromISODay(dayISO){
  const [y,m,d] = dayISO.split('-').map(Number);
  return new Date(y, m-1, d);
}

function canonicalLift(name){
  const n = (name||'').toLowerCase();
  if(n.includes('flat bench')) return 'bench';
  if(n.includes('back squat')) return 'squat';
  if(n.includes('incline') && n.includes('bench')) return 'incline';
  if(n==='dl' || n==='dead') return 'deadlift';
  if(n.includes('bench')) return 'bench';
  if(n.includes('squat')) return 'squat';
  if(n.includes('incline')) return 'incline';
  if(n.includes('dead')) return 'deadlift';
  return n;
}

function normalizeWorkouts(raw){
  if(Array.isArray(raw)){
    return raw.map(r=>{
      const date = r.date ? toDayISO(r.date) : toDayISO(new Date());
      const liftName = r.lift || r.name;
      return {
        date,
        lift: canonicalLift(liftName),
        sets: Array.isArray(r.sets) ? r.sets.map(s=>({weight:+s.weight,reps:+s.reps})) : []
      };
    });
  }
  const workouts = [];
  for(const [date, entries] of Object.entries(raw||{})){
    const day = toDayISO(date);
    const lifts = {};
    (entries||[]).forEach(line=>{
      // Example: "Bench Press: 185 lbs × 5 reps"
      const m = String(line).match(/^(.*?):\s*(\d+(?:\.\d+)?)\s*lbs\s*[×x]\s*(\d+)\s*reps/i);
      if(!m) return;
      const name = canonicalLift(m[1].trim());
      const weight = +m[2];
      const reps = +m[3];
      if(!lifts[name]) lifts[name] = [];
      lifts[name].push({weight,reps});
    });
    for(const [lift, sets] of Object.entries(lifts)){
      workouts.push({ date: day, lift, sets });
    }
  }
  return workouts;
}

function computeDaily(workouts, lift, metric){
  const daily = {};
  workouts.filter(w=>w.lift===lift).forEach(w=>{
    const day = toDayISO(w.date);
    if(!daily[day]) daily[day] = { topSet:0, volume:0, e1rmMax:0, sets:0 };
    w.sets.forEach(set=>{
      const top = set.weight;
      const e = e1rm(set.weight, set.reps);
      if(top > daily[day].topSet) daily[day].topSet = top;
      if(e   > daily[day].e1rmMax) daily[day].e1rmMax = e;
      daily[day].volume += set.weight * set.reps;
      daily[day].sets++;
    });
  });
  const key = metric==='e1rm'? 'e1rmMax' : metric==='top'? 'topSet' : 'volume';
  return Object.entries(daily)
    .filter(([,v])=>v.sets>0)
    .map(([d,v])=>({ x: dateFromISODay(d), y: v[key] }))
    .sort((a,b)=>a.x-b.x);
}

function e1rm(weight, reps){
  if(!isFinite(weight) || !isFinite(reps) || weight<=0 || reps<=0) return 0;
  return Math.round(weight * (1 + reps/30));
}

// Sample fallback data if no storage
const SAMPLE_DATA = {
  "2024-01-10": [ "Bench Press: 135 lbs × 8 reps" ],
  "2024-01-17": [ "Bench Press: 145 lbs × 6 reps" ],
  "2024-02-05": [ "Squat: 185 lbs × 5 reps" ]
};

function makeLineChart(ctx, label, dataPoints){
  if(!ctx){
    console.warn('No canvas context for chart');
    return null;
  }
  if(typeof Chart === 'undefined'){
    alert('Chart library failed to load. Check your internet connection.');
    return null;
  }
  return new Chart(ctx, {
    type: 'line',
    data: { datasets:[{ label, data:dataPoints, tension:0.25, pointRadius:3 }] },
    options:{
      parsing:false,
      interaction:{mode:'index',intersect:false},
      scales:{x:{type:'time',time:{unit:'day'}}}
    }
  });
}

async function loadWorkouts(){
  let raw = null;
  try{
    const manual = localStorage.getItem('charts_manual');
    if(manual) raw = JSON.parse(manual);
  }catch{}
  if(!raw){
    try{
      const keys = ['wt_history','wt_lastWorkout','workouts'];
      for(const k of keys){
        const ls = localStorage.getItem(k);
        if(!ls) continue;
        const parsed = JSON.parse(ls);

        if(k === 'wt_history'){
          raw = parsed;          // {'YYYY-MM-DD': [ 'Bench: 185 lbs × 5 reps', ... ]}
          break;
        }
        if(k === 'wt_lastWorkout'){
          const day = toDayISO(new Date());
          const lines = [];
          (parsed||[]).forEach(ex => {
            if(ex.isSuperset && Array.isArray(ex.sets)){
              ex.sets.forEach(s=>{
                (s.exercises||[]).forEach(sub=>{
                  lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`);
                });
              });
            } else if(!ex.isCardio) {
              (ex.sets||[]).forEach(s=>{
                lines.push(`${ex.name}: ${s.weight} lbs × ${s.reps} reps`);
              });
            }
          });
          raw = { [day]: lines };
          break;
        }
        if(k === 'workouts'){
          raw = parsed;          // already array-shaped
          break;
        }
      }
    }catch{}
  }

  if(!raw){
    const note = document.getElementById('sample-note');
    if(note) note.style.display = 'block';
    return normalizeWorkouts(SAMPLE_DATA);
  }

  let workouts = normalizeWorkouts(raw);

  try {
    const manualEntries = JSON.parse(localStorage.getItem('manual_entries') || '[]');
    workouts = workouts.concat(normalizeWorkouts(manualEntries));
  } catch {}

  if(!workouts.length){
    const note = document.getElementById('sample-note');
    if(note) note.style.display = 'block';
    workouts = normalizeWorkouts(SAMPLE_DATA);
  }
  return workouts;
}

async function init(){
  let workouts = await loadWorkouts();

  const liftSelect   = document.getElementById('liftSelect');
  const metricSelect = document.getElementById('metricSelect');
  const refreshBtn   = document.getElementById('refreshBtn');
  const seedBtn      = document.getElementById('seedBtn');
  const mainCanvas   = document.getElementById('mainChart');
  const mainCtx      = mainCanvas.getContext('2d');
  const emptyMsg     = document.getElementById('empty-message');
  const manualData   = document.getElementById('manualData');
  const loadManualBtn= document.getElementById('loadManualBtn');
  const entryDate    = document.getElementById('entryDate');
  const entryLift    = document.getElementById('entryLift');
  const entryWeight  = document.getElementById('entryWeight');
  const entryReps    = document.getElementById('entryReps');
  const addEntryBtn  = document.getElementById('addEntryBtn');
  const statusMsg   = document.getElementById('statusMsg');

  // Small charts
  const benchCtx = document.getElementById('benchChart')?.getContext('2d');
  const squatCtx = document.getElementById('squatChart')?.getContext('2d');
  let benchChart = null, squatChart = null;

  // Persist user choice
  liftSelect.value   = localStorage.getItem('charts_lift')   || liftSelect.value;
  metricSelect.value = localStorage.getItem('charts_metric') || metricSelect.value;
  function savePrefs(){
    localStorage.setItem('charts_lift', liftSelect.value);
    localStorage.setItem('charts_metric', metricSelect.value);
  }
  liftSelect.addEventListener('change', ()=>{ savePrefs(); render(); });
  metricSelect.addEventListener('change', ()=>{ savePrefs(); render(); });

  let mainChart = null;
  function render(){
    const data = computeDaily(workouts, liftSelect.value, metricSelect.value);
    if(mainChart){ mainChart.destroy(); mainChart = null; }
    if(!data.length){
      if(statusMsg) statusMsg.textContent = 'No data for the current lift/metric. Try Refresh or Seed sample.';
      mainCanvas.style.display = 'none';
      if(emptyMsg) emptyMsg.style.display = 'block';
    }else{
      mainCanvas.style.display = 'block';
      if(emptyMsg) emptyMsg.style.display = 'none'; if(statusMsg) statusMsg.textContent = '';
      const liftLabel = liftSelect.options[liftSelect.selectedIndex].text;
      const metricLabel = metricSelect.options[metricSelect.selectedIndex].text;
      mainChart = makeLineChart(mainCtx, `${liftLabel} - ${metricLabel}`, data);
    }

    // small charts auto: bench, squat
    if(benchChart){ benchChart.destroy(); benchChart=null; }
    if(squatChart){ squatChart.destroy(); squatChart=null; }
    const benchData = computeDaily(workouts,'bench', metricSelect.value);
    const squatData = computeDaily(workouts,'squat', metricSelect.value);
    if(benchCtx && benchData.length) benchChart = makeLineChart(benchCtx,'Bench', benchData);
    if(squatCtx && squatData.length) squatChart = makeLineChart(squatCtx,'Squat', squatData);
  }

  // Manual JSON load
  if(loadManualBtn){
    loadManualBtn.addEventListener('click', async ()=>{
      if(!manualData?.value){
        alert('Paste JSON first');
        return;
      }
      try{
        const parsed = JSON.parse(manualData.value);
        localStorage.setItem('charts_manual', JSON.stringify(parsed));
        workouts = await loadWorkouts();
        render();
        alert('Manual data loaded into charts.');
      }catch{
        alert('Invalid JSON data');
      }
    });
  }

  if(entryDate) entryDate.value = toDayISO(new Date());
  if(addEntryBtn){
    addEntryBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const date = entryDate?.value || toDayISO(new Date());
      const lift = entryLift?.value || '';
      const weight = Number(entryWeight?.value);
      const reps = Number(entryReps?.value);
      if(!lift || !weight || !reps){
        alert('Please complete all fields');
        return;
      }
      let entries = [];
      try{ entries = JSON.parse(localStorage.getItem('manual_entries')) || []; }catch{}
      entries.push({ date, lift, sets:[{weight, reps}] });
      localStorage.setItem('manual_entries', JSON.stringify(entries));
      if(entryWeight) entryWeight.value = '';
      if(entryReps) entryReps.value = '';
      await refresh();
    });
  }

  // Make the Refresh button work everywhere (iOS Safari too)
  ['click','pointerup','touchend'].forEach(evt=>{
    if(refreshBtn){
      refreshBtn.addEventListener(evt, (e)=>{ e.preventDefault(); refresh(); }, {passive:false});
    }
  });

  async function refresh(){
    workouts = await loadWorkouts();
    render();
  }

  // Seed sample → MERGE (don’t wipe)
  if(seedBtn){
    seedBtn.addEventListener('click', async ()=>{
      const sample = {
        "2024-08-25": [
          "Bench Press: 185 lbs × 5 reps",
          "Squat: 225 lbs × 5 reps",
          "Incline Bench Press: 155 lbs × 8 reps"
        ],
        "2024-08-26": [
          "Bench Press: 190 lbs × 5 reps",
          "Squat: 235 lbs × 5 reps",
          "Incline Bench Press: 160 lbs × 8 reps"
        ]
      };
      let existing = {}
      try{ existing = JSON.parse(localStorage.getItem('wt_history')||'{}'); }catch{}
      const merged = {...existing};
      for(const [day, lines] of Object.entries(sample)){
        const curr = Array.isArray(merged[day]) ? merged[day] : [];
        merged[day] = Array.from(new Set([...curr, ...lines]));
      }
      localStorage.setItem('wt_history', JSON.stringify(merged));
      await refresh();
      alert('Seeded sample data (merged with existing). Charts updated.');
    });
  }

  // First render
  await refresh();
}

if (typeof window !== 'undefined' && typeof module === 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    // If the script loads after DOMContentLoaded, run now.
    init();
  }
}

if(typeof module !== 'undefined'){
  module.exports = { e1rm, computeDaily, normalizeWorkouts, toDayISO };
}
