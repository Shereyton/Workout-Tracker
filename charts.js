function toDayISO(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function dateFromISODay(dayISO){
  const [y,m,d] = dayISO.split('-').map(Number);
  return new Date(y, m-1, d);
}
function canonicalLift(name){
  const n = (name||'').toLowerCase().trim();
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
    return raw.map(r=>({
      date: r.date ? toDayISO(r.date) : toDayISO(new Date()),
      lift: canonicalLift(r.lift || r.name),
      sets: Array.isArray(r.sets) ? r.sets.map(s=>({weight:+s.weight,reps:+s.reps})) : []
    }));
  }
  const workouts = [];
  for(const [date, entries] of Object.entries(raw||{})){
    const day = toDayISO(date);
    const lifts = {};
    (entries||[]).forEach(line=>{
      const m = String(line).match(/^(.*?):\s*(\d+(?:\.\d+)?)\s*lbs\s*[×x]\s*(\d+)\s*reps/i);
      if(!m) return;
      const name = canonicalLift(m[1].trim());
      const weight = +m[2];
      const reps = +m[3];
      (lifts[name] ||= []).push({weight,reps});
    });
    for(const [lift, sets] of Object.entries(lifts)){
      workouts.push({ date: day, lift, sets });
    }
  }
  return workouts;
}
function e1rm(weight, reps){
  if(!isFinite(weight) || !isFinite(reps) || weight<=0 || reps<=0) return 0;
  return Math.round(weight * (1 + reps/30));
}
function computeDaily(workouts, lift, metric){
  const daily = {};
  workouts.filter(w=>w.lift===lift).forEach(w=>{
    const day = toDayISO(w.date);
    (daily[day] ||= { topSet:0, volume:0, e1rmMax:0, sets:0 });
    w.sets.forEach(set=>{
      const top = +set.weight;
      const reps = +set.reps;
      const e = e1rm(top, reps);
      if(top > daily[day].topSet) daily[day].topSet = top;
      if(e   > daily[day].e1rmMax) daily[day].e1rmMax = e;
      daily[day].volume += top * reps;
      daily[day].sets++;
    });
  });
  const key = (metric==='e1rm' ? 'e1rmMax' : (metric==='top' ? 'topSet' : 'volume'));
  return Object.entries(daily)
    .filter(([,v])=>v.sets>0 && isFinite(v[key]))
    .map(([d,v])=>({ x: dateFromISODay(d), y: Number(v[key]) }))
    .filter(p=>p.x instanceof Date && !isNaN(p.x) && isFinite(p.y))
    .sort((a,b)=>a.x-b.x);
}

// Fallback sample if nothing is found
const SAMPLE_DATA = {
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

async function loadWorkouts(){
  // Highest priority: manual override
  try{
    const manual = localStorage.getItem('charts_manual');
    if(manual) return normalizeWorkouts(JSON.parse(manual));
  }catch{}
  // From history / last workout / ad-hoc entries
  let raw = null;
  try{
    const hist = localStorage.getItem('wt_history');
    if(hist) raw = JSON.parse(hist);
  }catch{}
  if(!raw){
    try{
      const last = JSON.parse(localStorage.getItem('wt_lastWorkout') || 'null');
      if (Array.isArray(last) && last.length) {
        const day = toDayISO(new Date());
        const lines = [];
        last.forEach(ex=>{
          if(ex.isSuperset){
            (ex.sets||[]).forEach(s=>{
              (s.exercises||[]).forEach(sub=>{
                lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`);
              });
            });
          } else if(!ex.isCardio){
            (ex.sets||[]).forEach(s=>{
              lines.push(`${ex.name}: ${s.weight} lbs × ${s.reps} reps`);
            });
          }
        });
        raw = { [day]: lines };
      }
    }catch{}
  }
  let workouts = normalizeWorkouts(raw || {});
  try{
    const manualEntries = JSON.parse(localStorage.getItem('manual_entries') || '[]');
    workouts = workouts.concat(normalizeWorkouts(manualEntries));
  }catch{}
  if(!workouts.length){
    document.getElementById('sample-note')?.style && (document.getElementById('sample-note').style.display='block');
    return normalizeWorkouts(SAMPLE_DATA);
  }
  const note = document.getElementById('sample-note');
  if(note) note.style.display = 'none';
  return workouts;
}

function makeLineChart(ctx, label, dataPoints){
  if(typeof Chart === 'undefined' || !ctx) return null;
  const hasTime = !!(Chart?._adapters?._date);
  console.log('makeLineChart', label, 'first 5', dataPoints.slice(0,5), 'scale', hasTime ? 'time' : 'category');
  let config;
  if(hasTime){
    config = {
      type:'line',
      data:{ datasets:[{ label, data:dataPoints, tension:0.25, pointRadius:3 }] },
      options:{
        parsing:false,
        interaction:{mode:'index',intersect:false},
        scales:{ x:{ type:'time', time:{unit:'day'} } }
      }
    };
  } else {
    const labels = dataPoints.map(p=>toDayISO(p.x));
    const nums   = dataPoints.map(p=>p.y);
    config = {
      type:'line',
      data:{ labels, datasets:[{ label, data:nums, tension:0.25, pointRadius:3 }] },
      options:{
        parsing:false,
        interaction:{mode:'index',intersect:false},
        scales:{ x:{ type:'category' } }
      }
    };
  }
  return new Chart(ctx, config);
}

async function init(){
  const liftSelect    = document.getElementById('liftSelect');
  const metricSelect  = document.getElementById('metricSelect');
  const refreshBtn    = document.getElementById('refreshBtn');
  const seedBtn       = document.getElementById('seedBtn');
  const manualData    = document.getElementById('manualData');
  const loadManualBtn = document.getElementById('loadManualBtn');
  const entryDate     = document.getElementById('entryDate');
  const entryLift     = document.getElementById('entryLift');
  const entryWeight   = document.getElementById('entryWeight');
  const entryReps     = document.getElementById('entryReps');
  const addEntryBtn   = document.getElementById('addEntryBtn');
  const statusMsg     = document.getElementById('statusMsg');
  const mainCanvas    = document.getElementById('mainChart');
  const mainCtx       = mainCanvas?.getContext('2d');
  const benchCtx      = document.getElementById('benchChart')?.getContext('2d');
  const squatCtx      = document.getElementById('squatChart')?.getContext('2d');
  const emptyMsg      = document.getElementById('empty-message');

  // Persist choices
  if(liftSelect)   liftSelect.value   = localStorage.getItem('charts_lift')   || (liftSelect.value || 'bench');
  if(metricSelect) metricSelect.value = localStorage.getItem('charts_metric') || (metricSelect.value || 'e1rm');
  liftSelect?.addEventListener('change', ()=>{ localStorage.setItem('charts_lift', liftSelect.value); render(); });
  metricSelect?.addEventListener('change', ()=>{ localStorage.setItem('charts_metric', metricSelect.value); render(); });

  // Load + render
  let workouts = await loadWorkouts();
  let mainChart = null;
  let benchChart = null;
  let squatChart = null;

  function render(){
    const lift   = liftSelect?.value || 'bench';
    const metric = metricSelect?.value || 'e1rm';
    const data = computeDaily(workouts, lift, metric);
    const benchData = computeDaily(workouts, 'bench', metric);
    const squatData = computeDaily(workouts, 'squat', metric);
    // Debug: verify datasets contain points
    console.log('main first 5', data.slice(0,5));
    console.log('bench first 5', benchData.slice(0,5));
    console.log('squat first 5', squatData.slice(0,5));
    const metricLabel = (metricSelect?.selectedOptions?.[0]?.text) || metric;

    if(mainChart){ mainChart.destroy(); mainChart = null; }
    if(!data.length){
      if(statusMsg) statusMsg.textContent = 'No data for the current lift/metric. Try Refresh or Seed sample.';
      if(mainCanvas) mainCanvas.style.display = 'none';
      if(emptyMsg) emptyMsg.style.display = 'block';
    } else {
      if(mainCanvas) mainCanvas.style.display = 'block';
      if(emptyMsg) emptyMsg.style.display = 'none';
      if(statusMsg) statusMsg.textContent = '';
      const liftLabel   = (liftSelect?.selectedOptions?.[0]?.text) || lift;
      mainChart = makeLineChart(mainCtx, `${liftLabel} - ${metricLabel}`, data);
    }

    if(benchChart){ benchChart.destroy(); benchChart = null; }
    if(squatChart){ squatChart.destroy(); squatChart = null; }
    benchChart = makeLineChart(benchCtx, `Bench - ${metricLabel}`, benchData);
    squatChart = makeLineChart(squatCtx, `Squat - ${metricLabel}`, squatData);
  }

  // Manual JSON override
  loadManualBtn?.addEventListener('click', async ()=>{
    if(!manualData?.value){ alert('Paste JSON first'); return; }
    try{
      const parsed = JSON.parse(manualData.value);
      localStorage.setItem('charts_manual', JSON.stringify(parsed));
      workouts = await loadWorkouts();
      render();
      alert('Manual data loaded into charts.');
    }catch{ alert('Invalid JSON'); }
  });

  // Quick Add entry
  if(entryDate) entryDate.value = toDayISO(new Date());
  addEntryBtn?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const date   = entryDate?.value || toDayISO(new Date());
    const lift   = entryLift?.value || '';
    const weight = Number(entryWeight?.value);
    const reps   = Number(entryReps?.value);
    if(!lift || !weight || !reps){ alert('Please complete all fields'); return; }
    let entries = [];
    try{ entries = JSON.parse(localStorage.getItem('manual_entries')) || []; }catch{}
    entries.push({ date, lift, sets:[{weight, reps}] });
    localStorage.setItem('manual_entries', JSON.stringify(entries));
    if(entryWeight) entryWeight.value = '';
    if(entryReps) entryReps.value = '';
    await refresh();
  });

  // Refresh button
  ['click','pointerup','touchend'].forEach(evt=>{
    refreshBtn?.addEventListener(evt, (e)=>{ e.preventDefault(); refresh(); }, {passive:false});
  });
  async function refresh(){ workouts = await loadWorkouts(); render(); }

  // Seed (merge, don’t wipe)
  seedBtn?.addEventListener('click', async ()=>{
    let existing = {};
    try{ existing = JSON.parse(localStorage.getItem('wt_history')||'{}'); }catch{}
    const merged = {...existing};
    for(const [day, lines] of Object.entries(SAMPLE_DATA)){
      const curr = Array.isArray(merged[day]) ? merged[day] : [];
      merged[day] = Array.from(new Set([...curr, ...lines]));
    }
    localStorage.setItem('wt_history', JSON.stringify(merged));
    await refresh();
    alert('Seeded sample data (merged). Charts updated.');
  });

  // First render
  await refresh();
}

// Ensure init runs even if DOMContentLoaded already fired
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined') {
  module.exports = { e1rm, computeDaily, normalizeWorkouts, toDayISO };
}
