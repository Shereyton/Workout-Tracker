const fs=require('fs');const path=require('path');
describe('copy workout for AI flow',()=>{
  beforeEach(()=>{
    jest.resetModules();jest.useFakeTimers();localStorage.clear();
    document.documentElement.innerHTML=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
    window.matchMedia=jest.fn(()=>({matches:false,addEventListener(){}}));window.HTMLElement.prototype.scrollIntoView=jest.fn();
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>[{name:'Bench',category:'Chest'}]});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockResolvedValue()}});
    localStorage.setItem('wt_schemaVersion','9');
    localStorage.setItem('wt_session',JSON.stringify({workoutId:'current',workoutDate:'2026-08-03',exercises:[],startedAt:'2026-08-03T17:00:00Z'}));
    localStorage.setItem('wt_currentExercise',JSON.stringify({name:'Bench',sets:[{weight:135,reps:8}],nextSet:2}));
    localStorage.setItem('wt_history',JSON.stringify({'2026-08-03':['Bench: Set 1 - 135 lbs × 8 reps','Bench: Set 2 - Failed attempt at 185 lbs; shoulder hurt']}));
    window.WorkoutAIExport=require('../ai-export');require('../script');
  });
  afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
  it('copies immediately without an options modal or automatic downloads, preserving safety notes',async()=>{
    const original=localStorage.getItem('wt_currentExercise');
    document.getElementById('exportBtn').click();await Promise.resolve();await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const brief=navigator.clipboard.writeText.mock.calls[0][0];
    expect(brief).toContain('shoulder hurt');expect(brief).not.toContain('Bench: Set 1 - 135 lbs × 8 reps');
    expect(document.querySelector('[data-wt-modal]')).toBeNull();
    expect(document.getElementById('aiExportPreview').hidden).toBe(false);
    expect(localStorage.getItem('wt_currentExercise')).toBe(original);
  });
  it('provides selectable text when clipboard permission fails',async()=>{
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
    document.getElementById('exportBtn').click();await Promise.resolve();await Promise.resolve();
    expect(document.getElementById('aiExportStatus').textContent).toContain('use Copy');
    const text=document.getElementById('aiExportText');expect(text.selectionEnd).toBe(text.value.length);
  });
  it('adds the in-app draft after a finished workout without changing logged data',async()=>{
    window.WorkoutPlanner=require('../progression-planner');
    document.getElementById('finishBtn').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Save Workout').click();
    await Promise.resolve();await Promise.resolve();
    const original=localStorage.getItem('wt_currentExercise');
    document.getElementById('exportBtn').click();await Promise.resolve();await Promise.resolve();
    const brief=navigator.clipboard.writeText.mock.calls[0][0];
    expect(brief).toContain('APP NEXT-WORKOUT DRAFT');
    expect(brief).toContain('PROGRAMMING LENS');
    expect(brief).toContain('Bench');
    expect(localStorage.getItem('wt_currentExercise')).toBe(original);
  });
  it('exports an active snapshot with a provisional draft and keeps it after reset',async()=>{
    window.WorkoutPlanner=require('../progression-planner');
    document.querySelector('[data-value="Arms"].daytype-option').click();
    const sessionStatus=document.getElementById('sessionStatus');
    sessionStatus.value='time_limited';sessionStatus.dispatchEvent(new Event('change'));
    document.getElementById('exportBtn').click();await Promise.resolve();await Promise.resolve();
    const brief=navigator.clipboard.writeText.mock.calls[0][0];
    expect(brief).toContain('Record: active_not_finished');
    expect(brief).toContain('PROVISIONAL APP NEXT-WORKOUT DRAFT');
    const archive=JSON.parse(localStorage.getItem('wt_sessionArchive'));
    expect(archive.current).toBeDefined();
    document.getElementById('resetBtn').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Reset').click();
    await Promise.resolve();await Promise.resolve();
    expect(JSON.parse(localStorage.getItem('wt_sessionArchive')).current).toBeDefined();
    expect(localStorage.getItem('wt_dayType')).toBe('""');
    expect(sessionStatus.value).toBe('complete');
  });
  it('removes generated set transcripts from older saved notes but keeps real context',async()=>{
    localStorage.setItem('wt_completedWorkouts',JSON.stringify({older:{
      workoutId:'older',date:'2026-08-01',timestamp:'2026-08-01T17:00:00Z',
      exercises:[{name:'Bench',sets:[{weight:130,reps:8}]}],
      workoutNotes:['Bench: Set 1 - 130 lbs × 8 reps','Shoulder felt sore after training'],
    }}));
    document.getElementById('exportBtn').click();await Promise.resolve();await Promise.resolve();
    const brief=navigator.clipboard.writeText.mock.calls[0][0];
    expect(brief).toContain('Shoulder felt sore after training');
    expect(brief).not.toContain('Bench: Set 1 - 130 lbs × 8 reps');
  });
});
