const { buildSessionTiming, getWorkoutRecords, previousWorkoutRecords, parseDurationFields, wtStorage }=require('../script');
describe('session reliability regressions',()=>{
  beforeEach(()=>localStorage.clear());
  afterEach(()=>jest.restoreAllMocks());
  it('freezes finished timing instead of counting until export',()=>{
    expect(buildSessionTiming({startedAt:'2026-08-01T12:00:00Z',finishedAt:'2026-08-01T13:00:00Z'},[],Date.parse('2026-08-10T12:00:00Z')).sessionDurationSec).toBe(3600);
  });
  it('does not invent timing for an undated imported workout',()=>expect(buildSessionTiming({},[{sets:[{weight:100,reps:5}]}])).toBeNull());
  it('keeps distinct workouts on the same date while deduplicating the legacy copy',()=>{
    const a={date:'2026-08-01',timestamp:'2026-08-01T12:00:00Z',workoutId:'one',exercises:[{name:'Bench',sets:[{weight:100,reps:5}]}]};
    const b={...a,workoutId:'two',timestamp:'2026-08-01T16:00:00Z'};
    const records=getWorkoutRecords({one:a,two:b},{'2026-08-01':a});
    expect(records).toHaveLength(2);expect(previousWorkoutRecords(records,b).map(r=>r.workoutId)).toEqual(['one']);
  });
  it('saves primary data even when a redundant backup cannot fit',()=>{
    localStorage.setItem('wt_session',JSON.stringify({old:true}));
    const original=Storage.prototype.setItem;
    jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v){if(k.includes('.backup'))throw new DOMException('Full','QuotaExceededError');return original.call(this,k,v);});
    expect(wtStorage.set('wt_session',{new:true})).toBe(true);
    expect(JSON.parse(localStorage.getItem('wt_session'))).toEqual({new:true});
  });
  it('rolls back a partially saved transition',()=>{
    localStorage.setItem('wt_session',JSON.stringify({old:true}));localStorage.setItem('wt_currentExercise',JSON.stringify({old:true}));
    const original=Storage.prototype.setItem;
    jest.spyOn(console,'error').mockImplementation(()=>{});
    jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v){if(k==='wt_session'&&v.includes('new'))throw new Error('blocked');return original.call(this,k,v);});
    expect(wtStorage.setMany([['wt_currentExercise',{new:true}],['wt_session',{new:true}]])).toBe(false);
    expect(JSON.parse(localStorage.getItem('wt_currentExercise'))).toEqual({old:true});
  });
});
