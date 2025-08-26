/* charts.js — DIAGNOSTIC build: loads workout data, renders charts, shows debug info */

(function(){
  // ------------------ Helpers ------------------
  const $ = (id) => document.getElementById(id);

  function e1rm(weight, reps){
    if(!isFinite(weight) || !isFinite(reps) || weight<=0 || reps<=0) return 0;
    return Math.round(weight * (1 + reps/30));
  }

  function toDayISO(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2,'0');
    const day = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function dateFromISODay(dayISO){
    const [y,m,d] = String(dayISO).split('-').map(Number);
    return new Date(y, m-1, d);
  }

  function canonicalLift(name){
    const n = (name||'').toLowerCase();
    if(n.includes('flat bench')) return 'bench';
    if(n.includes('back squat')) return 'squat';
    if(n.includes('incline bench')) return 'incline';
    if(n==='dl' || n==='dead') return 'deadlift';
    if(n.includes('bench')) return 'bench';
    if(n.includes('squat')) return 'squat';
    if(n.includes('incline')) return 'incline';
    if(n.includes('dead')) return 'deadlift';
    return n;
  }

  function computeDaily(workouts, lift, metric){
    const daily = {};
    const target = canonicalLift(lift);
    workouts.forEach(w => {
      if(canonicalLift(w.lift) !== target) return;
      const day = toDayISO(w.date);
      if(!daily[day]) daily[day] = { e1rmMax:0, topSet:0, volume:0, sets:0 };
      w.sets.forEach(set=>{
        const e = e1rm(set.weight, set.reps);
        if(e > daily[day].e1rmMax) daily[day].e1rmMax = e;
        if(set.weight > daily[day].topSet) daily[day].topSet = set.weight;
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

  // ------------------ Sample & Debug ------------------
  const SAMPLE_DATA = [
    { date: '2024-08-25', lift: 'bench', sets: [ { weight: 185, reps: 5 } ] },
    { date: '2024-08-26', lift: 'bench', sets: [ { weight: 190, reps: 5 } ] },
    { date: '2024-08-25', lift: 'squat', sets: [ { weight: 225, reps: 5 } ] },
    { date: '2024-08-26', lift: 'squat', sets: [ { weight: 235, reps: 5 } ] },
  ];

  function ensureDebugUI(){
    if($('chart-debug')) return;
    const wrap = document.createElement('div');
    wrap.id = 'chart-debug';
    wrap.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:9999;background:rgba(0,0,0,.65);color:#fff;padding:10px;border-radius:10px;max-width:90vw;max-height:40vh;overflow:auto;font:12px/1.4 system-ui;';
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <strong>Charts Debug</strong>
        <button id="dbg-seed" style="padding:4px 8px;border:none;border-radius:6px;cursor:pointer">Seed Test Data</button>
        <button id="dbg-hide" style="padding:4px 8px;border:none;border-radius:6px;cursor:pointer">Hide</button>
      </div>
      <pre id="dbg-log" style="white-space:pre-wrap;margin:0;"></pre>
    `;
    document.body.appendChild(wrap);
    $('dbg-hide').onclick = ()=> wrap.remove();
    $('dbg-seed').onclick = ()=>{
      localStorage.setItem('wt_history', JSON.stringify({
        [toDayISO(new Date(Date.now()-86400000))]: [
          'Bench Press: Set 1 - 185 lbs × 5 reps',
          'Squat: 225 lbs × 5 reps'
        ],
        [toDayISO(new Date())]: [
          'Bench Press: Set 1 - 190 lbs × 5 reps',
          'Squat: 235 lbs × 5 reps'
        ]
      }));
      log('Seeded wt_history with 2 days. Click Refresh.');
    };
  }
  function log(...args){
    console.log('[charts]', ...args);
    ensureDebugUI();
    const pre = $('dbg-log');
    if(pre){ pre.textContent += args.map(a=> (typeof a==='string'? a : JSON.stringify(a,null,2))).join(' ') + '\n'; }
  }

  // ------------------ Normalize ------------------
  function normalizeWorkouts(raw){
    // Already array?
    if(Array.isArray(raw)){
      const out = raw.map(r=>{
        const date = r.date ? toDayISO(r.date) : toDayISO(new Date());
        const liftName = r.lift || r.name;
        return {
          date,
          lift: canonicalLift(liftName),
          sets: Array.isArray(r.sets) ? r.sets.map(s=>({weight:+s.weight,reps:+s.reps})) : []
        };
      });
      log('normalize: got array ->', {count: out.length});
      return out;
    }
    // Expect object map: { 'YYYY-MM-DD': ['Bench: 200 lbs × 5 reps', ...] }
    const workouts = [];
    const rx = /^(.*?):\s*(?:Set\s*\d+\s*-\s*)?(\d+(?:\.\d+)?)\s*lbs\s*[x×]\s*(\d+)\s*reps?/i;
    for(const [date, entries] of Object.entries(raw||{})){
      const day = toDayISO(date);
      const lifts = {};
      (entries||[]).forEach(line=>{
        const m = String(line).match(rx);
        if(!m) return;
        let [, name, w, r] = m;
        const lift = canonicalLift(name);
        if(!lifts[lift]) lifts[lift] = { date: day, lift, sets: [] };
        lifts[lift].sets.push({ weight:+w, reps:+r });
      });
      workouts.push(...Object.values(lifts));
    }
    log('normalize: parsed from object ->', {count: workouts.length});
    return workouts;
  }

  // ------------------ Load ------------------
  async function loadWorkouts(){
    let source = 'none';
    let raw = null;

    try{
      const order = ['wt_history','wt_lastWorkout','workouts'];
      for(const k of order){
        const ls = localStorage.getItem(k);
        if(!ls) continue;
        const parsed = JSON.parse(ls);
        if(k === 'wt_history'){
          raw = parsed;
          source = 'wt_history';
          break;
        }
        if(k === 'wt_lastWorkout'){
          const day = toDayISO(new Date());
          const lines = [];
          (parsed||[]).forEach(ex => {
            if(ex.isSuperset && Array.isArray(ex.sets)){
              ex.sets.forEach(s=> (s.exercises||[]).forEach(sub=>{
                lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`);
              }));
            } else if(!ex.isCardio){
              (ex.sets||[]).forEach(s=>{
                lines.push(`${ex.name}: ${s.weight} lbs × ${s.reps} reps`);
              });
            }
          });
          raw = { [day]: lines };
          source = 'wt_lastWorkout→lines';
          break;
        }
        if(k === 'workouts'){
          raw = parsed;
          source = 'workouts(array)';
          break;
        }
      }
    }catch(e){
      log('localStorage parse error', String(e));
    }

    if(!raw){
      try{
        const res = await fetch('data/workouts.json', {cache:'no-store'});
        if(res.ok){ raw = await res.json(); source = 'data/workouts.json'; }
      }catch(e){
        log('fetch data/workouts.json error', String(e));
      }
    }

    let workouts = normalizeWorkouts(raw);
    if(!workouts.length){
      $('sample-note') && ($('sample-note').style.display = 'block');
      workouts = normalizeWorkouts(SAMPLE_DATA);
      source = source + ' (fallback SAMPLE)';
    }

    // Summaries for debug
    const counts = workouts.reduce((acc,w)=>{
      const k = canonicalLift(w.lift);
      acc[k] = (acc[k]||0) + w.sets.length;
      return acc;
    }, {});
    log('Loaded from:', source);
    log('Sets per lift:', counts);
    return { workouts, source, counts };
  }

  // ------------------ Init ------------------
  async function init(){
    ensureDebugUI();
    log('Init charts page');

    // Elements
    const liftSelect   = $('liftSelect');
    const metricSelect = $('metricSelect');
    const refreshBtn   = $('refreshBtn');
    const mainCanvas   = $('mainChart');
    const emptyMsg     = $('empty-message');

    if(!window.Chart){
      log('ERROR: Chart.js not found on page. Check script order.');
      return;
    }
    if(!mainCanvas){
      log('ERROR: #mainChart canvas missing in HTML.');
      return;
    }

    // Persist user choice
    liftSelect.value = localStorage.getItem('charts_lift') || liftSelect.value;
    metricSelect.value = localStorage.getItem('charts_metric') || metricSelect.value;
    const savePrefs = () => {
      localStorage.setItem('charts_lift', liftSelect.value);
      localStorage.setItem('charts_metric', metricSelect.value);
    };
    liftSelect.addEventListener('change', savePrefs);
    metricSelect.addEventListener('change', savePrefs);

    // Load + render
    let { workouts, source } = await loadWorkouts();
    let mainChart = null;

    function render(){
      try{
        const data = computeDaily(workouts, liftSelect.value, metricSelect.value);
        log('Render main:', {lift: liftSelect.value, metric: metricSelect.value, points: data.length, source});
        if(mainChart){ mainChart.destroy(); mainChart = null; }
        if(!data.length){
          mainCanvas.style.display = 'none';
          if(emptyMsg) emptyMsg.style.display = 'block';
          return;
        }
        mainCanvas.style.display = 'block';
        if(emptyMsg) emptyMsg.style.display = 'none';
        const mainCtx = mainCanvas.getContext('2d');
        const label = `${liftSelect.options[liftSelect.selectedIndex].text} - ${metricSelect.options[metricSelect.selectedIndex].text}`;
        mainChart = makeLineChart(mainCtx, label, data);
      }catch(e){
        log('Render error:', String(e));
      }
    }

    async function refresh(){
      const loaded = await loadWorkouts();
      workouts = loaded.workouts;
      source = loaded.source;
      render();
      // Mini charts (if present)
      const benchCtx = $('benchChart')?.getContext('2d');
      const squatCtx = $('squatChart')?.getContext('2d');
      if(benchCtx) makeLineChart(benchCtx, 'Bench - E1RM', computeDaily(workouts, 'bench', 'e1rm'));
      if(squatCtx) makeLineChart(squatCtx, 'Squat - E1RM', computeDaily(workouts, 'squat', 'e1rm'));
    }

    refreshBtn.addEventListener('click', refresh);
    window.addEventListener('resize', render);
    window.addEventListener('orientationchange', render);

    // First paint
    render();
    // Optional mini charts
    const benchCtx = $('benchChart')?.getContext('2d');
    const squatCtx = $('squatChart')?.getContext('2d');
    if(benchCtx) makeLineChart(benchCtx, 'Bench - E1RM', computeDaily(workouts, 'bench', 'e1rm'));
    if(squatCtx) makeLineChart(squatCtx, 'Squat - E1RM', computeDaily(workouts, 'squat', 'e1rm'));
  }

  if(typeof window !== 'undefined'){
    window.addEventListener('DOMContentLoaded', init);
  }

  // expose for tests
  if(typeof module !== 'undefined'){
    module.exports = { e1rm, computeDaily, normalizeWorkouts, toDayISO };
  }
})();
