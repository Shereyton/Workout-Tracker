// charts.js - renders progress charts from workout data
const SAMPLE_DATA = [
  { date: '2024-01-01', lift: 'Bench Press', sets:[{ weight:185, reps:5 }] },
  { date: '2024-01-08', lift: 'Bench Press', sets:[{ weight:190, reps:5 }] },
  { date: '2024-01-15', lift: 'Bench Press', sets:[{ weight:200, reps:3 }] },
  { date: '2024-01-02', lift: 'Squat', sets:[{ weight:225, reps:5 }] },
  { date: '2024-01-12', lift: 'Squat', sets:[{ weight:245, reps:3 }] }
];
function e1rm(weight,reps){
  if(!isFinite(weight)||!isFinite(reps)||weight<=0||reps<=0) return 0;
  return Math.round(weight*(1+reps/30));
}
function toDayISO(d){
  const dt=(d instanceof Date)?d:new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function dateFromISODay(dayISO){
  const [y,m,d]=dayISO.split('-').map(Number);
  return new Date(y,m-1,d);
}
async function loadWorkouts(){
  let raw=null;
  try{
    const keys=['workouts','wt_history','wt_lastWorkout'];
    for(const k of keys){
      const ls=localStorage.getItem(k);
      if(ls){
        raw=JSON.parse(ls);
        if(k==='wt_lastWorkout' && Array.isArray(raw)){
          const day=toDayISO(new Date());
          const lines=[];
          raw.forEach(ex=>(ex.sets||[]).forEach(s=>{
            if(ex.isCardio) return;
            lines.push(`${ex.name||ex.lift}: ${s.weight} lbs × ${s.reps} reps`);
          }));
          raw={ [day]: lines };
        }
        break;
      }
    }
  }catch(e){}
  if(!raw){
    try{
      const res=await fetch('data/workouts.json',{cache:'no-store'});
      if(res.ok) raw=await res.json();
    }catch(e){}
  }
  if(!raw){
    raw=SAMPLE_DATA;
    const note=document.getElementById('sample-note');
    if(note) note.style.display='block';
  }
  return normalizeWorkouts(raw);
}
function normalizeWorkouts(raw){
  if(Array.isArray(raw)){
    return raw.map(r=>({
      date:toDayISO(r.date||new Date()),
      lift:canonicalLift(r.lift||r.name),
      sets:(r.sets||[]).map(s=>({weight:+s.weight,reps:+s.reps}))
    }));
  }
  const out=[];
  for(const [date,lines] of Object.entries(raw||{})){
    const day=toDayISO(date);
    const lifts={};
    (lines||[]).forEach(line=>{
      const m=line.match(/^(.*?):\s*(\d+)\s*lbs\s*[x×]\s*(\d+)\s*reps?/i);
      if(!m) return;
      const [,name,w,r]=m;
      const key=canonicalLift(name);
      if(!lifts[key]) lifts[key]={date:day,lift:key,sets:[]};
      lifts[key].sets.push({weight:+w,reps:+r});
    });
    out.push(...Object.values(lifts));
  }
  return out;
}
function canonicalLift(name=''){
  const n=String(name).toLowerCase();
  if(n.includes('bench')) return 'bench';
  if(n.includes('squat')) return 'squat';
  if(n.includes('incline')) return 'incline';
  if(n.includes('dead')) return 'deadlift';
  return n;
}
function computeDaily(workouts,lift,metric){
  const daily={};
  const target=canonicalLift(lift);
  workouts.forEach(w=>{
    if(canonicalLift(w.lift||w.name)!==target) return;
    const day=toDayISO(w.date);
    if(!daily[day]) daily[day]={e1rmMax:0,topSet:0,volume:0,sets:0};
    w.sets.forEach(set=>{
      const e=e1rm(set.weight,set.reps);
      if(e>daily[day].e1rmMax) daily[day].e1rmMax=e;
      if(set.weight>daily[day].topSet) daily[day].topSet=set.weight;
      daily[day].volume+=set.weight*set.reps;
      daily[day].sets++;
    });
  });
  const key=metric==='e1rm'?'e1rmMax':(metric==='top'?'topSet':'volume');
  return Object.entries(daily)
    .filter(([,v])=>v.sets>0)
    .map(([d,v])=>({x:dateFromISODay(d),y:v[key]}))
    .sort((a,b)=>a.x-b.x);
}
function makeLineChart(ctx,label,dataPoints){
  return new Chart(ctx,{
    type:'line',
    data:{datasets:[{label,data:dataPoints,tension:0.25,pointRadius:3}]},
    options:{
      parsing:false,
      interaction:{mode:'index',intersect:false},
      scales:{x:{type:'time',time:{unit:'day'}}}
    }
  });
}
async function init(){
  const workouts=await loadWorkouts();
  const liftSelect=document.getElementById('liftSelect');
  const metricSelect=document.getElementById('metricSelect');
  const refreshBtn=document.getElementById('refreshBtn');
  const mainCanvas=document.getElementById('mainChart');
  const mainCtx=mainCanvas.getContext('2d');
  const benchCtx=document.getElementById('benchChart').getContext('2d');
  const squatCtx=document.getElementById('squatChart').getContext('2d');
  const emptyMsg=document.getElementById('empty-message');
  liftSelect.value=localStorage.getItem('charts_lift')||liftSelect.value;
  metricSelect.value=localStorage.getItem('charts_metric')||metricSelect.value;
  function savePrefs(){
    localStorage.setItem('charts_lift',liftSelect.value);
    localStorage.setItem('charts_metric',metricSelect.value);
  }
  liftSelect.addEventListener('change',savePrefs);
  metricSelect.addEventListener('change',savePrefs);
  let mainChart=null;
  function renderMain(){
    const data=computeDaily(workouts,liftSelect.value,metricSelect.value);
    if(mainChart){mainChart.destroy();mainChart=null;}
    if(!data.length){
      mainCanvas.style.display='none';
      if(emptyMsg) emptyMsg.style.display='block';
      return;
    }
    mainCanvas.style.display='block';
    if(emptyMsg) emptyMsg.style.display='none';
    mainChart=makeLineChart(
      mainCtx,
      `${liftSelect.options[liftSelect.selectedIndex].text} - ${metricSelect.options[metricSelect.selectedIndex].text}`,
      data
    );
  }
  refreshBtn.addEventListener('click',()=>{savePrefs();renderMain();});
  window.addEventListener('resize',renderMain);
  window.addEventListener('orientationchange',renderMain);
  renderMain();
  makeLineChart(benchCtx,'Bench - E1RM',computeDaily(workouts,'bench','e1rm'));
  makeLineChart(squatCtx,'Squat - E1RM',computeDaily(workouts,'squat','e1rm'));
}
if(typeof window!=='undefined'){
  window.addEventListener('DOMContentLoaded',init);
}
if(typeof module!=='undefined'){
  module.exports={e1rm,computeDaily,normalizeWorkouts,toDayISO};
}
