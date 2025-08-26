// charts.js - renders progress charts from workout data

const SAMPLE_DATA = [
  { date: '2024-01-01', lift: 'bench', sets: [ { weight: 185, reps: 5 } ] },
  { date: '2024-01-08', lift: 'bench', sets: [ { weight: 190, reps: 5 } ] },
  { date: '2024-01-02', lift: 'squat', sets: [ { weight: 225, reps: 5 } ] },
  { date: '2024-01-09', lift: 'squat', sets: [ { weight: 235, reps: 5 } ] },
  { date: '2024-01-05', lift: 'bench', sets: [ { weight: 200, reps: 3 } ] },
  { date: '2024-01-12', lift: 'squat', sets: [ { weight: 245, reps: 3 } ] },
];

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

function e1rm(weight, reps){
  if(!isFinite(weight) || !isFinite(reps) || weight<=0 || reps<=0) return 0;
  return Math.round(weight * (1 + reps/30));
}

async function loadWorkouts(){
  let raw = null;

  try {
    const keys = ['workouts', 'wt_history', 'wt_lastWorkout'];
    for (const k of keys) {
      const ls = localStorage.getItem(k);
      if (ls) {
        raw = JSON.parse(ls);
        if (k === 'wt_lastWorkout' && Array.isArray(raw)) {
          const day = new Date().toISOString().slice(0,10);
          const lines = [];
          raw.forEach(ex => (ex.sets||[]).forEach(s => {
            if (ex.isCardio) return;
            lines.push(`${ex.name || ex.lift}: ${s.weight} lbs × ${s.reps} reps`);
          }));
          raw = { [day]: lines };
        }
        break;
      }
    }
  } catch(e){}

  if (!raw) {
    try {
      const res = await fetch('data/workouts.json', { cache: 'no-store' });
      if (res.ok) raw = await res.json();
    } catch(e){}
  }

  if (!raw) {
    raw = SAMPLE_DATA;
    const note = document.getElementById('sample-note');
    if (note) note.style.display = 'block';
  }

  return normalizeWorkouts(raw);
}

function normalizeWorkouts(raw){
  if (Array.isArray(raw)) {
    return raw.map(r => ({
      date: toDayISO(r.date),
      lift: canonicalLift(r.lift || r.name),
      sets: (r.sets || []).map(s => ({ weight:+s.weight, reps:+s.reps }))
    }));
  }

  const workouts = [];
  for (const [date, entries] of Object.entries(raw || {})) {
    const day = toDayISO(date);
    const lifts = {};
    (entries || []).forEach(line => {
      const m = line.match(/^(.*?):\s*(\d+)\s*lbs\s*[x×]\s*(\d+)\s*reps?/i);
      if (!m) return;
      const [, name, w, r] = m;
      const key = canonicalLift(name);
      if (!lifts[key]) lifts[key] = { date: day, lift: key, sets: [] };
      lifts[key].sets.push({ weight:+w, reps:+r });
    });
    workouts.push(...Object.values(lifts));
  }
  return workouts;
}

function canonicalLift(name=''){
  const n = String(name).toLowerCase();
  if(n.includes('bench')) return 'bench';
  if(n.includes('squat')) return 'squat';
  if(n.includes('incline')) return 'incline';
  if(n.includes('dead')) return 'deadlift';
  return n;
}

function computeDaily(workouts, lift, metric){
  const daily = {};
  const target = canonicalLift(lift);
  workouts.filter(w => canonicalLift(w.lift) === target).forEach(w=>{
    const day = toDayISO(w.date);
    if(!daily[day]) daily[day] = { e1rmMax:0, topSet:0, volume:0 };
    w.sets.forEach(set=>{
      const e = e1rm(set.weight, set.reps);
      if(e > daily[day].e1rmMax) daily[day].e1rmMax = e;
      if(set.weight > daily[day].topSet) daily[day].topSet = set.weight;
      daily[day].volume += set.weight * set.reps;
    });
  });
  const key = metric==='e1rm'? 'e1rmMax' : metric==='top'? 'topSet' : 'volume';
  return Object.entries(daily).map(([d,v])=>({ x: dateFromISODay(d), y: v[key] })).sort((a,b)=>a.x-b.x);
}

function makeLineChart(ctx, label, dataPoints){
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

async function init(){
  const workouts = await loadWorkouts();
  const liftSelect = document.getElementById('liftSelect');
  const metricSelect = document.getElementById('metricSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const mainCtx = document.getElementById('mainChart').getContext('2d');
  const benchCtx = document.getElementById('benchChart').getContext('2d');
  const squatCtx = document.getElementById('squatChart').getContext('2d');
  let mainChart = null;
  function renderMain(){
    const liftLabel = liftSelect.options[liftSelect.selectedIndex].text;
    const metricLabel = metricSelect.options[metricSelect.selectedIndex].text;
    const data = computeDaily(workouts, liftSelect.value, metricSelect.value);
    if(mainChart){
      mainChart.destroy();
      mainChart = null;
    }
    if(!data.length){
      document.getElementById('mainChart').style.display = 'none';
      document.getElementById('empty-message').style.display = 'block';
      return;
    }
    document.getElementById('mainChart').style.display = 'block';
    document.getElementById('empty-message').style.display = 'none';
    mainChart = makeLineChart(mainCtx, `${liftLabel} - ${metricLabel}`, data);
  }
  refreshBtn.addEventListener('click', renderMain);
  window.addEventListener('resize', renderMain);
  window.addEventListener('orientationchange', renderMain);
  renderMain();
  makeLineChart(benchCtx, 'Bench - E1RM', computeDaily(workouts, 'bench', 'e1rm'));
  makeLineChart(squatCtx, 'Squat - E1RM', computeDaily(workouts, 'squat', 'e1rm'));
}

if(typeof window !== 'undefined'){
  window.addEventListener('DOMContentLoaded', init);
}

if(typeof module !== 'undefined'){
  module.exports = { e1rm, computeDaily, normalizeWorkouts, toDayISO, dateFromISODay };
}
