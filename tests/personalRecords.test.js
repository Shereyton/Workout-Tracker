const core=require('../script');
const {buildPersonalRecords}=require('../ai-export');
const helpers={normalizePayload:core.normalizePayload,classifyExerciseSets:core.classifyExerciseSets};
const lift=(name,weight,reps,extra={})=>({name,sets:[{weight,reps,role:'working',roleSource:'manual',...extra}]});
const workout=(date,exercises,extra={})=>({date,exercises,...extra});
describe('personal-record export',()=>{
  it('exports all exercises with real weight–rep pairs and resolves ties by reps/date',()=>{
    const history=[workout('2026-10-01',[lift('Bench',300,1),lift('Squat',345,1)]),workout('2026-10-05',[lift('Bench',300,2)]),workout('2026-10-08',[lift('Bench',300,2)])];
    const result=buildPersonalRecords({history,current:workout('2026-10-12',[lift('Bench',275,8)]),helpers});
    expect(result.packet.exerciseCount).toBe(2);
    expect(result.packet.records[0]).toMatchObject({exercise:'Bench',weightLb:300,reps:2,date:'2026-10-08'});
    expect(result.text).toContain('"Squat": 345 lb × 1 rep');
    expect(result.text).not.toContain('300 lb × 8');
  });
  it('ignores failures, unsafe/stopped sets and cardio while supporting bodyweight and supersets',()=>{
    const current=workout('2026-10-12',[lift('Bench',315,0),lift('Bench',310,1,{technique:'poor'}),lift('Bench',305,1,{pain:'stopped'}),lift('Bench',300,1),lift('Pull Up',0,12),{name:'Run',isCardio:true,sets:[{distance:1,duration:600}]},{name:'Curl + Press',isSuperset:true,exercises:['Curl','Press'],sets:[{exercises:[{name:'Curl',weight:30,reps:10},{name:'Press',weight:50,reps:8}]}]}]);
    const records=buildPersonalRecords({current,helpers}).packet.records;
    expect(records.find(r=>r.exercise==='Bench').weightLb).toBe(300);
    expect(records.find(r=>r.exercise==='Pull Up')).toMatchObject({weightLb:0,reps:12});
    expect(records.map(r=>r.exercise)).toEqual(['Bench','Curl','Press','Pull Up']);
  });
  it('keeps known machine contexts distinct and replaces an edited active snapshot',()=>{
    const a={...lift('Press',200,5),progressionProfile:{loadConvention:'machine_stack',equipmentLabel:'A'}};
    const b={...lift('Press',150,8),progressionProfile:{loadConvention:'machine_stack',equipmentLabel:'B'}};
    const history=[workout('2026-10-01',[a,b]),workout('2026-10-12',[lift('Bench',315,1)],{workoutId:'active'})];
    const result=buildPersonalRecords({history,current:workout('2026-10-12',[lift('Bench',300,1)],{workoutId:'active'}),helpers});
    expect(result.packet.records.filter(r=>r.exercise==='Press')).toHaveLength(2);
    expect(result.packet.records.find(r=>r.exercise==='Bench').weightLb).toBe(300);
    expect(result.text).not.toMatch(/NaN|Infinity/);
  });
  it('provides an honest empty export',()=>{
    expect(buildPersonalRecords({history:[],helpers}).text).toContain('No successful strength sets');
  });
});
