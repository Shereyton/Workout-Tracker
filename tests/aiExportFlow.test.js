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
});
