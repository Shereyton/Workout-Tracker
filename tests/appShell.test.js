const fs = require('fs');
const path = require('path');

describe('iPhone product shell integration', () => {
  beforeEach(() => {
    jest.resetModules(); jest.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
    document.documentElement.innerHTML=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
    document.body.className='';
    window.matchMedia=jest.fn(()=>({matches:false,addEventListener(){}}));
    window.scrollTo=jest.fn(); window.HTMLElement.prototype.scrollIntoView=jest.fn();
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>[{name:'Bench Press',category:'Chest'}]});
    localStorage.setItem('wt_schemaVersion','9');
    require('../script'); window.WorkoutPlanner=require('../progression-planner');
    require('../app-shell');
  });
  afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
  const flush=async()=>{await Promise.resolve();jest.runAllTicks();await Promise.resolve();};
  it('moves controls without detaching them and uses real screen navigation',()=>{
    expect(document.body.classList.contains('app-v2')).toBe(true);
    expect(document.getElementById('customExercise')).toBeTruthy();
    expect(document.getElementById('view-train').hidden).toBe(false);
    document.querySelector('[data-view="plan"]').click();
    expect(document.getElementById('view-train').hidden).toBe(true);
    expect(document.getElementById('view-plan').hidden).toBe(false);
    expect(document.getElementById('planContent').textContent).toContain('baseline');
  });
  it('logs, produces a current-only plan, and retains data after finish',async()=>{
    document.getElementById('customExercise').value='Bench Press';
    document.getElementById('addExercise').click();
    for(const [id,value] of [['weight','135'],['reps','8']]){
      document.getElementById(id).value=value;
      document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));
    }
    document.getElementById('useTimer').checked=false;
    document.getElementById('logBtn').click();await flush();
    expect(document.getElementById('planContent').textContent).toContain('Bench Press');
    expect(document.querySelectorAll('.plan-card')).toHaveLength(1);
    document.getElementById('finishBtn').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Save Workout').click();await flush();
    expect(window.workoutTracker.getState().current.exercises[0].sets[0].weight).toBe(135);
    expect(window.workoutTracker.getState().history).toHaveLength(1);
  });
  it('activates and persists the chosen plan for the next exercise session',async()=>{
    document.getElementById('customExercise').value='Bench Press';
    document.getElementById('addExercise').click();
    for(const [id,value] of [['weight','135'],['reps','8']]){
      document.getElementById(id).value=value;
      document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));
    }
    document.getElementById('useTimer').checked=false;
    document.getElementById('logBtn').click();await flush();
    document.getElementById('finishBtn').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Save Workout').click();await flush();
    document.querySelector('.plan-card button').click();await flush();
    const next=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Start New');
    expect(next).toBeTruthy();next.click();await flush();await flush();
    expect(sessionStorage.getItem('wt_guidedPlan')).not.toBeNull();
    expect(window.workoutTracker.getState().activeExercise.prescription).toMatchObject({
      source:'app_next_workout',type:'strength',workingSets:[{weight:135,reps:8}],
    });
    expect(document.getElementById('liveTarget').textContent).toContain('135 lb × 8');
  });
  it('labels the notes export honestly and keeps unknown goals blank',()=>{
    expect(document.querySelector('.data-fineprint').textContent).toContain('calendar notes only');
    expect(document.getElementById('progressContent').textContent).toContain('Give your training a direction');
    expect(document.body.textContent).not.toContain('NaN');
  });
});
