const core=require('../script');
const {build,compactSets}=require('../ai-export');
const helpers={normalizePayload:core.normalizePayload,classifyExerciseSets:core.classifyExerciseSets,describeConstraintsLines:core.describeConstraintsLines};
const workout=(date,exercises,extra={})=>({date,timestamp:`${date}T18:00:00Z`,exercises,...extra});
const lift=(name,sets,extra={})=>({name,sets:sets.map(([weight,reps,context={}])=>({weight,reps,role:'working',roleSource:'manual',...context})),...extra});
const current=()=>workout('2026-08-03',[lift('Bench Press',[[135,8],[135,8],[135,6]])],{workoutId:'today',dayType:'Chest'});

describe('AI programming handoff',()=>{
  it('exports ordered results and only matching earlier movements across training categories',()=>{
    const history=[workout('2026-08-01',[lift(' bench   press ',[[135,7],[135,6]]),lift('Unrelated Squat',[[225,5]])],{dayType:'Upper'}),workout('2026-08-04',[lift('Bench Press',[[200,5]])]),current()];
    const result=build({current:current(),history,helpers});
    expect(result.packet.movements).toHaveLength(1);
    expect(result.packet.movements[0].history).toHaveLength(1);
    expect(result.packet.movements[0].comparison.sameLoadReps[0]).toEqual({weightLb:135,previous:[7,6],current:[8,8,6]});
    expect(result.text).not.toContain('Unrelated Squat');expect(result.text).not.toContain('200×5');
    expect(result.text).toContain('#1–2 135×8');expect(result.text).toContain('#3 135×6');
  });
  it('separates failures, preparation and unsafe work without fabricating favorable unknowns',()=>{
    const result=build({current:workout('2026-08-03',[lift('Bench',[[45,10,{role:'warmup'}],[200,0],[135,8],[135,8,{pain:'stopped'}],[135,8,{technique:'poor'}]])]),helpers});
    const m=result.packet.movements[0];
    expect(m.summary.qualifyingSets).toBe(1);expect(m.summary.qualifyingVolumeLb).toBe(1080);expect(m.summary.failedAttempts).toBe(1);
    expect(result.text).toContain('200×0; failed#; FAILED');expect(result.text).toContain('pain stopped');expect(result.text).toContain('form poor');
    expect(m.sets[2].rir).toBeNull();expect(m.sets[2].pain).toBe('unknown');
    expect(result.text).not.toMatch(/NaN|Infinity|New personal best/);
  });
  it('labels inferred roles without treating automatic defaults as user goals',()=>{
    const result=build({current:workout('2026-08-03',[{name:'Bench',sets:[{weight:100,reps:8},{weight:100,reps:6}]}]),helpers});
    expect(result.packet.movements[0].summary.inferredRoles).toBe(2);
    expect(result.text).toContain('work~moderate');expect(result.text).not.toContain('App defaults (not verified equipment)');
  });
  it('retains user-set exercise instructions as settings, not verified equipment',()=>{
    const profile={mode:'custom',purpose:'hypertrophy_compound',repMin:6,repMax:10,targetRir:2,loadStep:2.5};
    const result=build({current:workout('2026-08-03',[lift('Bench',[[100,8]],{progressionProfile:profile})]),helpers});
    expect(result.packet.movements[0].profile.source).toBe('user_settings');
    expect(result.text).toContain('User settings:');expect(result.text).toContain('load step 2.5 lb');
  });
  it('preserves goals while suppressing optional logged-best data in current and history',()=>{
    const goal={exerciseName:'Bench Press',goalType:'weight',goalValue:225,currentBestPerformance:180,goalPath:'strength'};
    const record=current();record.exercises[0].goal=goal;
    const off=build({current:record,history:[record],helpers});
    expect(off.packet.movements[0].goal.target).toBe(225);
    expect(JSON.stringify(off.packet)).not.toContain('appLoggedBest');expect(off.text).not.toContain('app-tracked best');
    expect(build({current:record,helpers,includeProgress:true}).packet.movements[0].goal.appLoggedBest).toBe(180);
  });
  it('uses the current saved goal and next-session constraints after a finished workout',()=>{
    const record=current();record.exercises[0].goal={exerciseName:'Bench Press',goalType:'weight',goalValue:225};
    const active={"bench press":{exerciseName:'Bench Press',goalType:'weight',goalValue:245,unit:'lbs'}};
    const result=build({current:record,helpers,currentExerciseGoals:active,currentGoals:['Build strength'],currentConstraints:{scheduleNotes:['Travel Thursday'],avoidAreas:[]},nextWorkoutMinutes:60});
    expect(result.packet.movements[0].goal.target).toBe(245);
    expect(result.packet.movements[0].goalAtWorkout.target).toBe(225);
    expect(result.packet.goals).toEqual(['Build strength']);expect(result.packet.nextWorkoutMinutes).toBe(60);
    expect(result.text).toContain('Travel Thursday');expect(result.text).toContain('At-workout goal (historical only)');
    expect(build({current:record,helpers,currentExerciseGoals:{}}).packet.movements[0].goal).toBeNull();
  });
  it('counts superset rounds separately from movement entries and preserves cardio units',()=>{
    const record=workout('2026-08-03',[{name:'Superset',isSuperset:true,sets:[1,2].map(set=>({set,role:'working',roleSource:'manual',restActual:90,exercises:[{name:'Press',weight:100,reps:5},{name:'Row',weight:80,reps:8}]}))},{name:'Running',isCardio:true,sets:[{distance:2,duration:1200}]}]);
    const result=build({current:record,helpers});
    expect(result.packet.counts).toEqual({loggedEntries:3,movementEntries:5,strengthEntries:4,cardioEntries:1});
    expect(result.packet.groups[0].exercises).toEqual(['Press','Row']);expect(result.text).toContain('S1 round 2');expect(result.text).toContain('2 mi / 1200 sec');
  });
  it('does not lose differing rest/effort data when compressing repeated sets',()=>{
    const record=current();record.exercises[0].sets[1].restActual=120;record.exercises[0].sets[1].rir=0;
    const result=build({current:record,helpers});
    expect(result.text).toContain('#2 135×8; work!; RIR 0; rest ?/120s');expect(result.text).not.toContain('#1–2 135×8');
  });
  it('shows assigned targets once and separates numeric misses from unlogged sets',()=>{
    const record=current();record.exercises[0].prescription={source:'app_next_workout',type:'strength',sourceDate:'2026-08-01',workingSets:[1,2,3,4].map(()=>({role:'working',weight:135,reps:8})),preparationSets:[]};
    const result=build({current:record,helpers});
    expect(result.packet.movements[0].prescription.workingSets).toHaveLength(4);
    expect(result.text).toContain('Assigned main target (from 2026-08-01): 4×135×8');
    expect(result.text).toContain('Numeric targets met 2/4; 3 qualifying main entries logged');
    expect(result.text).toContain('Missing entries are not automatically failed sets');
  });
  it('preserves and compares a distance-only cardio assignment without inventing a time target',()=>{
    const record=workout('2026-08-03',[{name:'Walk',isCardio:true,sets:[{distance:1,duration:600}],prescription:{source:'app_next_workout',type:'cardio',workingSets:[{distance:1.05,duration:null}]}}]);
    const result=build({current:record,helpers});
    expect(result.packet.movements[0].prescription.workingSets[0]).toEqual({durationSeconds:null,distanceMiles:1.05});
    expect(result.text).toContain('Assigned main target: 1×1.05 mi. Numeric targets met 0/1');
  });
  it('includes historical notes once and honors bounded history and timing preferences',()=>{
    const record=workout('2026-08-03',[lift('Bench',[[135,5]]),lift('Row',[[100,5]])],{sessionContext:{status:'time_limited',nextWorkoutMinutes:45},session:{sessionStart:'2026-08-03T17:00:00Z',sessionEnd:'2026-08-03T18:00:00Z'}});
    const history=[workout('2026-08-01',record.exercises,{workoutNotes:['Shoulder discomfort; stopped early.']})];
    const result=build({current:record,history,helpers,notes:['Current note','Current note']});
    expect(result.text.match(/Shoulder discomfort; stopped early\./g)).toHaveLength(1);
    expect(result.packet.notes).toEqual(['Current note']);expect(result.packet.sessionTiming).toBeUndefined();
    expect(result.text).toContain('priority portion ≤40 min');
    expect(build({current:record,history,helpers,historyLimit:0}).packet.movements[0].history).toHaveLength(0);
    expect(build({current:record,helpers,includeSessionTime:true}).packet.sessionTiming.sessionDurationSec).toBe(3600);
  });
});
