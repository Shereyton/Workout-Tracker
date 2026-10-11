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
  it('saves optional weight setup and keeps quick form and pain feedback specific to one set',async()=>{
    document.getElementById('customExercise').value='Bench Press'; document.getElementById('addExercise').click();
    document.getElementById('loadConvention').value='total_load';
    document.getElementById('equipmentStep').value='2.5';
    document.getElementById('saveWeightSetup').click();
    expect(window.workoutTracker.getState().activeExercise.progressionProfile).toMatchObject({loadConvention:'total_load',loadStep:2.5,loadStepConfirmed:true});
    document.getElementById('useTimer').checked=false;
    [...document.querySelectorAll('button')].find(b=>b.textContent==='Form felt controlled').click();
    [...document.querySelectorAll('button')].find(b=>b.textContent==='No pain').click();
    for(let i=0;i<2;i++){
      for(const [id,value] of [['weight','135'],['reps','5']]){document.getElementById(id).value=value;document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));}
      document.getElementById('logBtn').click(); await flush();
    }
    const sets=window.workoutTracker.getState().current.exercises[0].sets;
    expect(sets[0]).toMatchObject({technique:'good',pain:'none'});
    expect(sets[1]).toMatchObject({technique:'unknown',pain:'unknown'});
  });
  it('shows progress toward the required reps, not a heavier single',async()=>{
    document.getElementById('customExercise').value='Bench Press';
    document.getElementById('addExercise').click();
    document.getElementById('exerciseGoalToggle').click();
    document.getElementById('exerciseGoalValue').value='315';
    document.getElementById('saveExerciseGoal').click();
    document.getElementById('useTimer').checked=false;
    document.getElementById('setRole').value='working';
    for(const [weight,reps] of [[315,1],[300,5]]){
      document.getElementById('weight').value=String(weight);
      document.getElementById('reps').value=String(reps);
      document.getElementById('weight').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('reps').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('logBtn').click();
      await flush();
    }
    expect(window.workoutTracker.getState().current.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[315,1],[300,5]]);
    expect(window.workoutTracker.getState().goals['bench press'].currentBestPerformance).toBe(315);
    document.getElementById('exerciseGoalToggle').click();
    document.getElementById('exerciseGoalReps').value='5';
    document.getElementById('saveExerciseGoal').click();
    await flush();
    expect(window.workoutTracker.getState().goals['bench press'].currentBestPerformance).toBe(300);
    document.querySelector('[data-view="progress"]').click();
    const progress=document.getElementById('progressContent').textContent;
    expect(progress).toContain('toward 315 lbs × 5 reps');
    expect(progress).toContain('300 lbs');
    expect(progress).not.toContain('Target logged ✓');
  });
  it('shows top and back-off targets with their distinct rest times on the phone plan',async()=>{
    document.getElementById('customExercise').value='Bench Press';
    document.getElementById('addExercise').click();
    for(const [id,value] of [['weight','285'],['reps','1']]){
      document.getElementById(id).value=value;
      document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));
    }
    document.getElementById('useTimer').checked=false;
    document.getElementById('logBtn').click();await flush();
    window.WorkoutPlanner={buildNextWorkout:()=>({exercises:[{
      name:'Bench Press',type:'strength',actionLabel:'Make a small step',reason:'Keep the back-offs steady.',
      confidence:'HIGH',preparationSets:[],workingSets:[
        {role:'top_set',weight:290,reps:1,restSeconds:240},
        {role:'back_off',weight:255,reps:4,restSeconds:180},
      ],
    }]})};
    document.getElementById('planSource').dispatchEvent(new Event('change'));
    const card=document.querySelector('.plan-card');
    expect(card.textContent).toContain('Top set');
    expect(card.textContent).toContain('Back-off set');
    expect(card.textContent).toContain('top set 4 min · back-offs 3 min');
  });
});
