/* charts.js – renders progress charts from workout data (localStorage or fallback) */

const SAMPLE_DATA = [
  { date: '2024-01-01', lift: 'bench',  sets: [{ weight: 185, reps: 5 }] },
  { date: '2024-01-02', lift: 'squat',  sets: [{ weight: 225, reps: 5 }] },
  { date: '2024-01-05', lift: 'bench',  sets: [{ weight: 200, reps: 3 }] },
  { date: '2024-01-08', lift: 'bench',  sets: [{ weight: 190, reps: 5 }] },
  { date: '2024-01-09', lift: 'squat',  sets: [{ weight: 235, reps: 5 }] },
  { date: '2024-01-12', lift: 'squat',  sets: [{ weight: 245, reps: 3 }] },
];

/* ---------- helpers ---------- */
function e1rm (w, r) { return (isFinite(w) && isFinite(r) && w>0 && r>0) ? Math.round(w * (1+r/30)) : 0; }

function toDayISO(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function dateFromISO(dayISO){ const [y,m,d] = dayISO.split('-').map(Number); return new Date(y, m-1, d); }

function canonicalLift(name=''){
  const n = name.toLowerCase();
  if(n.includes('bench'))   return n.includes('incline') ? 'incline' : 'bench';
  if(n.includes('squat'))   return 'squat';
  if(n.includes('dead'))    return 'deadlift';
  return n;
}

/* ---------- storage load + normalise ---------- */
async function loadWorkouts(){
  let raw = null;

  /* 1️⃣  localStorage – in priority order */
  try{
    for(const k of ['wt_history','wt_lastWorkout','workouts']){
      const v = localStorage.getItem(k);
      if(!v) continue;
      const json = JSON.parse(v);

      if(k === 'wt_history'){ raw = json; break; }

      if(k === 'wt_lastWorkout'){
        const day = toDayISO(new Date());
        const lines = [];
        (json||[]).forEach(ex=>{
          if(ex.isCardio) return;          // skip cardio for strength charts
          if(ex.isSuperset){
            (ex.sets||[]).forEach(s=> (s.exercises||[])
              .forEach(sub => lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`)));
          } else {
            (ex.sets||[]).forEach(s => lines.push(`${ex.name}: ${s.weight} lbs × ${s.reps} reps`));
          }
        });
        raw = { [day]: lines };
        break;
      }

      if(k === 'workouts'){ raw = json; break; }
    }
  }catch{/* ignore JSON errors */}

  /* 2️⃣  static JSON file (optional) */
  if(!raw){
    try{
      const r = await fetch('data/workouts.json',{cache:'no-store'});
      if(r.ok) raw = await r.json();
    }catch{/* offline/no file */}
  }

  /* 3️⃣  sample fallback so page is never blank */
  let workouts = normalizeWorkouts(raw);
  if(!workouts.length){
    document.getElementById('sample-note')?.style.setProperty('display','block');
    workouts = normalizeWorkouts(SAMPLE_DATA);
  }
  return workouts;
}

function normalizeWorkouts(raw){
  if(Array.isArray(raw)){   // already array form
    return raw.map(r=>({
      date : toDayISO(r.date||new Date()),
      lift : canonicalLift(r.lift||r.name),
      sets : (r.sets||[]).map(s=>({ weight:+s.weight, reps:+s.reps }))
    }));
  }

  /* calendar object form { 'YYYY-MM-DD': ['Bench: 185 lbs × 5 reps', …] } */
  const workouts = [];
  Object.entries(raw||{}).forEach(([date,lines])=>{
    const day = toDayISO(date);
    const byLift = {};
    (lines||[]).forEach(line=>{
      const m = line.match(/^(.*?):\s*(?:Set\s*\d+\s*-\s*)?(\d+(?:\.\d+)?)\s*lbs\s*[x×]\s*(\d+)\s*reps?/i);
      if(!m) return;
      const [, name, w, r] = m;
      const lift = canonicalLift(name);
      byLift[lift] ??= { date:day, lift, sets:[] };
      byLift[lift].sets.push({ weight:+w, reps:+r });
    });
    workouts.push(...Object.values(byLift));
  });
  return workouts;
}

/* ---------- metrics ---------- */
function computeDaily(arr, lift, metric){
  const daily={}; const tgt=canonicalLift(lift);
  arr.filter(w=>canonicalLift(w.lift)===tgt).forEach(w=>{
    const day = toDayISO(w.date);
    daily[day] ??= { e1:0, top:0, vol:0 };
    w.sets.forEach(s=>{
      daily[day].e1  = Math.max(daily[day].e1,  e1rm(s.weight,s.reps));
      daily[day].top = Math.max(daily[day].top, s.weight);
      daily[day].vol+= s.weight*s.reps;
    });
  });
  const key = metric==='e1rm' ? 'e1' : metric==='top' ? 'top' : 'vol';
  return Object.entries(daily)
    .map(([d,v])=>({ x:dateFromISO(d), y:v[key] }))
    .sort((a,b)=>a.x-b.x);
}

/* ---------- chart helpers ---------- */
function makeLineChart(ctx,label,data){
  return new Chart(ctx,{
    type:'line',
    data:{ datasets:[{ label, data, tension:0.25, pointRadius:3 }] },
    options:{
      parsing:false,
      interaction:{ mode:'index', intersect:false },
      scales:{ x:{ type:'time', time:{ unit:'day' } } }
    }
  });
}

/* ---------- page boot ---------- */
async function init(){
  let workouts = await loadWorkouts();

  const els = {
    lift   : document.getElementById('liftSelect'),
    metric : document.getElementById('metricSelect'),
    btn    : document.getElementById('refreshBtn'),
    main   : document.getElementById('mainChart'),
    empty  : document.getElementById('empty-message'),
    bench  : document.getElementById('benchChart')?.getContext('2d'),
    squat  : document.getElementById('squatChart')?.getContext('2d'),
  };
  const ctxMain = els.main.getContext('2d');

  /* remember last selection */
  els.lift.value   = localStorage.getItem('charts_lift')   || els.lift.value;
  els.metric.value = localStorage.getItem('charts_metric') || els.metric.value;
  ['lift','metric'].forEach(k=> els[k].addEventListener('change',()=>{
    localStorage.setItem(`charts_${k}`, els[k].value);
  }));

  let mainChart=null, benchChart=null, squatChart=null;
  function render(){
    /* main chart */
    const data = computeDaily(workouts, els.lift.value, els.metric.value);
    if(mainChart){ mainChart.destroy(); mainChart=null; }
    if(!data.length){ els.main.style.display='none'; els.empty.style.display='block'; }
    else{
      els.main.style.display='block'; els.empty.style.display='none';
      mainChart = makeLineChart(
        ctxMain,
        `${els.lift.options[els.lift.selectedIndex].text} – ${els.metric.options[els.metric.selectedIndex].text}`,
        data
      );
    }
    /* side minis */
    if(benchChart){ benchChart.destroy(); benchChart=null; }
    if(squatChart){ squatChart.destroy(); squatChart=null; }
    if(els.bench) benchChart = makeLineChart(els.bench,'Bench – E1RM',computeDaily(workouts,'bench','e1rm'));
    if(els.squat) squatChart = makeLineChart(els.squat,'Squat – E1RM',computeDaily(workouts,'squat','e1rm'));
  }

  async function refresh(){
    workouts = await loadWorkouts();
    render();
  }

  els.btn.addEventListener('click', refresh);
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);

  render();
}

if(typeof window!=='undefined') window.addEventListener('DOMContentLoaded',init);
if(typeof module!=='undefined') module.exports = { e1rm, computeDaily, normalizeWorkouts, toDayISO };
