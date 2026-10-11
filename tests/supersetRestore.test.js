const fs=require('fs');
const path=require('path');
describe('restored superset startup',()=>{
  beforeEach(()=>{
    jest.resetModules(); jest.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
    document.documentElement.innerHTML=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
    window.matchMedia=jest.fn(()=>({matches:false,addEventListener(){}}));
    window.HTMLElement.prototype.scrollIntoView=jest.fn();
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>[]});
    localStorage.setItem('wt_schemaVersion','9');
    localStorage.setItem('wt_currentExercise',JSON.stringify({name:'Press + Row',isSuperset:true,exercises:['Press','Row'],sets:[]}));
  });
  afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
  it('restores inputs without crashing and saves setup separately for each member',()=>{
    expect(()=>require('../script')).not.toThrow();
    expect(window.workoutTracker).toBeDefined();
    expect(document.getElementById('weight0')).not.toBeNull();
    expect(document.getElementById('logBtn').disabled).toBe(true);
    document.getElementById('weightSetupExercise').value='Row';
    document.getElementById('weightSetupExercise').dispatchEvent(new Event('change'));
    document.getElementById('loadConvention').value='per_hand';
    document.getElementById('equipmentStep').value='5';
    document.getElementById('saveWeightSetup').click();
    const profiles=window.workoutTracker.getState().activeExercise.progressionProfiles;
    expect(profiles.row).toMatchObject({loadConvention:'per_hand',loadStep:5,loadStepConfirmed:true});
    expect(profiles.press).toBeUndefined();
    for(let i=0;i<2;i++){
      document.getElementById(`weight${i}`).value='50'; document.getElementById(`reps${i}`).value='8';
      document.getElementById(`reps${i}`).dispatchEvent(new Event('input',{bubbles:true}));
    }
    expect(document.getElementById('logBtn').disabled).toBe(false);
  });
});
