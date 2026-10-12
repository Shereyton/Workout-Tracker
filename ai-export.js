/* A fact-first coaching handoff. App targets are labelled drafts, never observations. */
(function (root) {
  'use strict';
  const VERSION = 'ai-workout/3';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = value => clean(value).toLowerCase();
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const n = value => numeric(value) ? Number(value) : null;
  const fmt = value => n(value) === null ? '?' : String(Number(Number(value).toFixed(2)));
  const mainRoles = new Set(['working', 'top_set', 'back_off']);
  const roleNames = {working:'work',top_set:'top',back_off:'backoff',warmup:'warmup',ramp:'ramp',technique:'practice',failed_attempt:'failed',unknown:'unknown',auto:'unknown'};
  const loadLabels = {total_load:'total external weight (bar included if used)',per_hand:'weight per hand / dumbbell',machine_stack:'displayed machine weight',added_load:'added external weight; body weight excluded',unknown:'unknown'};
  function equipmentFact(profile) {
    const convention=loadLabels[profile?.loadConvention]?profile.loadConvention:'unknown';
    return {loadConvention:convention,label:clean(profile?.equipmentLabel)||null,savedIncrementLb:n(profile?.loadStep),
      incrementLb:profile?.loadStepConfirmed===true?n(profile.loadStep):null};
  }
  function equipmentMatch(a,b) {
    if(!a||!b||a.loadConvention==='unknown'||b.loadConvention==='unknown')return 'unverified';
    if(a.loadConvention==='machine_stack'&&(!a.label||!b.label))return 'unverified';
    if(a.loadConvention!==b.loadConvention)return 'different';
    if(!!a.label!==!!b.label)return 'unverified';
    return key(a.label)===key(b.label)?'matched':'different';
  }
  function goalFact(goal, includeProgress) {
    if (!goal || !(Number(goal.goalValue) > 0)) return null;
    const result = {type:clean(goal.goalType),target:Number(goal.goalValue),unit:clean(goal.unit),focus:clean(goal.goalPathLabel || goal.goalPath)};
    if(result.type==='weight')result.targetReps=Number.isInteger(Number(goal.targetReps))&&Number(goal.targetReps)>0?Number(goal.targetReps):1;
    if (includeProgress && numeric(goal.currentBestPerformance)) result.appLoggedBest=Number(goal.currentBestPerformance);
    return result;
  }
  function profileFact(profile) {
    if(!profile) return null;
    return {source:profile.mode==='custom'?'user_settings':'automatic_app_settings',purpose:clean(profile.purposeLabel||profile.purpose),repMin:n(profile.repMin),repMax:n(profile.repMax),targetRir:n(profile.targetRir),loadStep:n(profile.loadStep),loadStepConfirmed:profile.loadStepConfirmed===true};
  }
  function prescribedFact(value, cardio) {
    if(value?.source!=='app_next_workout'||value.type!==(cardio?'cardio':'strength')||!Array.isArray(value.workingSets))return null;
    const sets=value.workingSets.slice(0,40).map(s=>cardio
      ? {durationSeconds:n(s?.duration),distanceMiles:n(s?.distance)}
      : {role:mainRoles.has(s?.role)?s.role:'working',weightLb:n(s?.weight),reps:n(s?.reps)});
    if(!sets.length||sets.some(s=>cardio?!(s.durationSeconds>0)&&!(s.distanceMiles>0):s.weightLb===null||!(s.reps>0)))return null;
    return {sourceDate:clean(value.sourceDate)||null,workingSets:sets};
  }
  function setFact(raw, cardio, group, round) {
    const s = {set:n(raw.set),...(group?{group,round}:{} )};
    if(cardio){s.distanceMiles=n(raw.distance);s.durationSeconds=n(raw.duration);}
    else {
      s.weightLb=n(raw.weight);s.reps=n(raw.reps);
      s.role=roleNames[raw.role]?raw.role:'unknown';
      s.roleSource=['auto','legacy_default'].includes(raw.roleSource)?'inferred':raw.roleSource==='system'?'outcome':raw.roleSource==='manual'?'user':'unknown';
      if(s.roleSource==='inferred')s.roleConfidence=clean(raw.roleConfidence)||'unknown';
      s.completed=raw.completed!==false&&raw.outcome!=='failed'&&s.role!=='failed_attempt';
      s.rir=n(raw.rir);s.technique=clean(raw.technique)||'unknown';s.pain=clean(raw.pain)||'unknown';
    }
    if(n(raw.restPlanned)!==null)s.restPlannedSeconds=n(raw.restPlanned);
    if(n(raw.restActual)!==null)s.restTimerSeconds=n(raw.restActual);
    return s;
  }
  function flatten(payload, helpers, includeProgress=false) {
    const movements=[];const groups=[];const byName=new Map();
    function entry(name,cardio,goal,profile,prescription){
      const id=`${key(name)}|${cardio?'cardio':'strength'}`;
      if(!byName.has(id)){const e={name:clean(name),type:cardio?'cardio':'strength',goal:goalFact(goal,includeProgress),profile:cardio?null:profileFact(profile),equipment:cardio?null:equipmentFact(profile),prescription:prescribedFact(prescription,cardio),sets:[]};byName.set(id,e);movements.push(e);}
      return byName.get(id);
    }
    (payload.exercises||[]).forEach(raw=>{
      if(!raw||!Array.isArray(raw.sets)||!raw.sets.length)return;
      const ex=helpers.classifyExerciseSets?helpers.classifyExerciseSets(raw):raw;
      if(ex.isSuperset){
        const group=`S${groups.length+1}`;
        const members=[];
        ex.sets.forEach((s,i)=>(s.exercises||[]).forEach(sub=>{
          const name=clean(sub.name);if(!name)return;
          if(!members.includes(name))members.push(name);
          const goal=(ex.exerciseGoals||[]).find(g=>key(g.exerciseName)===key(name));
          const profile=ex.progressionProfiles?.[key(name)]||ex.progressionProfile;
          entry(name,false,goal,profile).sets.push(setFact({...s,...sub,exercises:undefined},false,group,i+1));
        }));
        groups.push({id:group,exercises:members,rounds:ex.sets.length});
      }else{
        const m=entry(ex.name,ex.isCardio,ex.goal,ex.progressionProfile,ex.prescription);
        ex.sets.forEach(s=>m.sets.push(setFact(s,ex.isCardio)));
      }
    });
    return {movements,groups};
  }
  function eligible(s){return s.completed&&mainRoles.has(s.role)&&s.reps>0&&s.weightLb!==null&&s.pain!=='stopped'&&s.technique!=='poor';}
  function summarize(movement){
    if(movement.type==='cardio')return {entries:movement.sets.length,durationSeconds:movement.sets.reduce((a,s)=>a+(s.durationSeconds||0),0),distanceMiles:movement.sets.some(s=>s.distanceMiles!==null)?Number(movement.sets.reduce((a,s)=>a+(s.distanceMiles||0),0).toFixed(3)):null};
    const accepted=movement.sets.filter(eligible);
    const best=accepted.slice().sort((a,b)=>b.weightLb-a.weightLb||b.reps-a.reps)[0];
    return {entries:movement.sets.length,qualifyingSets:accepted.length,qualifyingReps:accepted.reduce((a,s)=>a+s.reps,0),qualifyingVolumeLb:Number(accepted.reduce((a,s)=>a+s.weightLb*s.reps,0).toFixed(2)),heaviestQualifyingSet:best?{weightLb:best.weightLb,reps:best.reps}:null,failedAttempts:movement.sets.filter(s=>!s.completed).length,inferredRoles:movement.sets.filter(s=>s.roleSource==='inferred').length,unknownRir:movement.sets.filter(s=>s.completed&&s.rir===null).length,unknownTechnique:movement.sets.filter(s=>s.technique==='unknown').length,unknownPain:movement.sets.filter(s=>s.pain==='unknown').length};
  }
  function earlier(history,current){
    const cutoff=Date.parse(current.timestamp);const seen=new Set();
    return (Array.isArray(history)?history:[]).filter(p=>{
      if(!p||!Array.isArray(p.exercises)||!p.date)return false;
      if(current.workoutId&&p.workoutId===current.workoutId)return false;
      const time=Date.parse(p.timestamp);
      if(p.date>current.date||p.date===current.date&&!(Number.isFinite(cutoff)&&Number.isFinite(time)&&time<cutoff))return false;
      if(Number.isFinite(cutoff)&&Number.isFinite(time)&&time>=cutoff)return false;
      const id=p.workoutId||`${p.timestamp||p.date}:${JSON.stringify(p.exercises)}`;
      if(seen.has(id))return false;seen.add(id);return true;
    }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.timestamp||'').localeCompare(String(a.timestamp||'')));
  }
  function calendarGap(a,b){const x=Date.parse(`${a}T12:00:00Z`),y=Date.parse(`${b}T12:00:00Z`);return Number.isFinite(x)&&Number.isFinite(y)?Math.round((x-y)/86400000):null;}
  function deltaSummary(current,previous){
    if(current.type!=='strength'||!previous?.summary||previous.equipmentComparison==='different')return null;
    const a=current.summary,b=previous.summary;
    const result={contextId:previous.contextId,equipmentComparison:previous.equipmentComparison,qualifyingSetsDelta:a.qualifyingSets-b.qualifyingSets};
    if(a.qualifyingVolumeLb>0&&b.qualifyingVolumeLb>0)result.qualifyingVolumeChangePercent=Number(((a.qualifyingVolumeLb/b.qualifyingVolumeLb-1)*100).toFixed(1));
    const oldReps=new Map();
    previous.sets.filter(eligible).forEach(s=>{if(!oldReps.has(s.weightLb))oldReps.set(s.weightLb,[]);oldReps.get(s.weightLb).push(s.reps);});
    result.sameLoadReps=[];
    const loads=new Set(current.sets.filter(eligible).map(s=>s.weightLb));
    loads.forEach(load=>{if(oldReps.has(load))result.sameLoadReps.push({weightLb:load,previous:oldReps.get(load),current:current.sets.filter(s=>eligible(s)&&s.weightLb===load).map(s=>s.reps)});});
    return result;
  }
  function setDescription(s,type){
    const parts=[];
    if(type==='cardio')parts.push(`${s.distanceMiles===null?'distance ?':`${fmt(s.distanceMiles)} mi`} / ${fmt(s.durationSeconds)} sec`);
    else{
      parts.push(`${fmt(s.weightLb)}×${fmt(s.reps)}`);
      parts.push(`${roleNames[s.role]||'unknown'}${s.roleSource==='inferred'?`~${s.roleConfidence}`:s.roleSource==='user'?'!':s.roleSource==='outcome'?'#':'?'}`);
      if(!s.completed)parts.push('FAILED');
      if(s.rir!==null)parts.push(`RIR ${fmt(s.rir)}`);
      if(s.technique!=='unknown')parts.push(`form ${s.technique}`);
      if(s.pain!=='unknown')parts.push(`pain ${s.pain}`);
    }
    if(s.restPlannedSeconds!==undefined||s.restTimerSeconds!==undefined)parts.push(`rest ${fmt(s.restPlannedSeconds)}/${fmt(s.restTimerSeconds)}s`);
    if(s.group)parts.push(`${s.group} round ${s.round}`);
    return parts.join('; ');
  }
  function compactSets(sets,type){
    const runs=[];
    sets.forEach((s,i)=>{const description=setDescription(s,type);const last=runs[runs.length-1];if(last&&last.description===description){last.end=i+1;}else runs.push({start:i+1,end:i+1,description});});
    return runs.map(r=>`${r.start===r.end?`#${r.start}`:`#${r.start}–${r.end}`} ${r.description}`).join(' | ');
  }
  function assignedLine(m){
    const target=m.prescription;if(!target)return null;
    const formatted=target.workingSets.map(s=>m.type==='cardio'
      ? [s.distanceMiles!==null?`${fmt(s.distanceMiles)} mi`:null,s.durationSeconds!==null?`${fmt(s.durationSeconds)} sec`:null].filter(Boolean).join(' / ')
      : `${s.role==='top_set'?'top ':s.role==='back_off'?'backoff ':''}${fmt(s.weightLb)}×${fmt(s.reps)}`);
    const runs=[];formatted.forEach(value=>{const last=runs[runs.length-1];if(last&&last.value===value)last.count++;else runs.push({value,count:1});});
    const actual=m.type==='cardio'?m.sets:m.sets.filter(s=>mainRoles.has(s.role)&&s.completed);
    const met=target.workingSets.reduce((count,s,i)=>{
      const logged=actual[i];if(!logged)return count;
      return count+(m.type==='cardio'
        ? (s.durationSeconds===null||logged.durationSeconds!==null&&logged.durationSeconds>=s.durationSeconds)&&(s.distanceMiles===null||logged.distanceMiles!==null&&logged.distanceMiles>=s.distanceMiles)
        : logged.weightLb===s.weightLb&&logged.reps>=s.reps
          &&(s.role==='working'||logged.role===s.role)
          &&logged.pain!=='stopped'&&logged.technique!=='poor');
    },0);
    const outdatedAutoTarget=m.type==='strength'&&m.profile?.source==='automatic_app_settings'
      &&target.workingSets.some(s=>s.reps<m.profile.repMin);
    return `Assigned main target${target.sourceDate?` (from ${target.sourceDate})`:''}: ${runs.map(r=>`${r.count}×${r.value}`).join(' | ')}. Numeric targets met ${met}/${target.workingSets.length}; ${actual.length} qualifying main entries logged. Missing entries are not automatically failed sets.${outdatedAutoTarget?' This older app target is below the current automatic rep range; review it instead of treating it as mandatory.':''}`;
  }
  function profileText(p){
    if(!p)return '';
    return `${p.source==='user_settings'?'User settings':'App defaults (not verified equipment)'}: ${p.purpose}; reps ${fmt(p.repMin)}–${fmt(p.repMax)}, target RIR ${fmt(p.targetRir)}, load step ${fmt(p.loadStep)} lb${p.loadStepConfirmed?' (confirmed)':' (unconfirmed)'}.`;
  }
  const rounded=value=>Number(value.toFixed(2));
  function weightedMedian(entries){
    const sorted=entries.slice().sort((a,b)=>a.value-b.value);
    const half=sorted.reduce((sum,e)=>sum+e.weight,0)/2;
    let total=0;
    for(const entry of sorted){total+=entry.weight;if(total>=half)return entry.value;}
    return null;
  }
  function sessionModel(sets){
    const candidates=sets.map((s,index)=>{
      if(!eligible(s)||s.weightLb<=0||s.pain==='discomfort')return null;
      const effortKnown=s.rir!==null&&s.rir>=0&&s.rir<=3;
      // High reported reserve is context, not a useful near-limit observation.
      if(s.rir!==null&&!effortKnown)return null;
      const effectiveReps=s.reps+(effortKnown?s.rir:0);
      if(effectiveReps<2||effectiveReps>10)return null;
      const formulas={epley:s.weightLb*(1+effectiveReps/30),brzycki:s.weightLb*36/(37-effectiveReps),oconnor:s.weightLb*(1+0.025*effectiveReps)};
      const values=Object.values(formulas).sort((a,b)=>a-b);
      return {set:index+1,loadLb:s.weightLb,reps:s.reps,rir:s.rir,effectiveReps,effortKnown,qualityReported:s.technique==='good'&&s.pain==='none'&&!(s.roleSource==='inferred'&&s.roleConfidence==='low'),
        formulas,center:values[1],low:values[0],high:values[2],
        weight:(effortKnown?1:0.5)*(effectiveReps<=5?1:0.75)/(1+index*0.1)};
    }).filter(Boolean).sort((a,b)=>b.weight-a.weight).slice(0,3);
    if(!candidates.length)return null;
    return {estimate:weightedMedian(candidates.map(c=>({value:c.center,weight:c.weight}))),
      modelLow:candidates[0].low,modelHigh:candidates[0].high,
      candidates};
  }
  function quantitativeSummary(m){
    if(m.type!=='strength')return null;
    const work=m.sets.filter(eligible);
    const heaviest=work.length?Math.max(...work.map(s=>s.weightLb)):null;
    const step=m.equipment?.incrementLb??(m.equipment?.savedIncrementLb>0?m.equipment.savedIncrementLb:m.profile?.loadStep>0?m.profile.loadStep:5);
    const blocks=[];
    [...new Set(work.map(s=>s.weightLb))].forEach(load=>{
      const group=work.filter(s=>s.weightLb===load);
      if(group.length>1&&group[0].reps>0)blocks.push({loadLb:load,sets:group.length,firstReps:group[0].reps,lastReps:group.at(-1).reps,repDropPercent:rounded(100*(group[0].reps-group.at(-1).reps)/group[0].reps)});
    });
    const result={loadStepLb:step,loadStepAssumed:m.equipment?.incrementLb===null,
      jumpPercent:heaviest>0?rounded(step/heaviest*100):null,blocks};
    const assigned=m.prescription?.workingSets;
    if(assigned?.length){
      const attempted=m.sets.filter(s=>mainRoles.has(s.role)||s.role==='failed_attempt');
      const paired=Math.min(attempted.length,assigned.length);
      const sameLoads=attempted.length<=assigned.length&&attempted.slice(0,paired).every((s,i)=>s.weightLb===assigned[i].weightLb);
      result.assignedOutcome={loadsComparable:sameLoads,loggedMainAttempts:attempted.length,targetSets:assigned.length,
        failedAttempts:attempted.filter(s=>!s.completed).length,
        unloggedTargets:Math.max(0,assigned.length-attempted.length),
        repDeficit:sameLoads?attempted.slice(0,paired).reduce((sum,s,i)=>sum+Math.max(0,assigned[i].reps-s.reps),0):null,
        shortfallSetNumbers:sameLoads?attempted.slice(0,paired).flatMap((s,i)=>(!s.completed||s.reps<assigned[i].reps)?[i+1]:[]):[]};
    }
    const observations=[{date:null,days:0,model:sessionModel(m.sets)}];
    m.history.filter(h=>h.equipmentComparison!=='different').slice(0,4).forEach(h=>observations.push({date:h.date,days:h.calendarDaysBefore??0,model:sessionModel(h.sets)}));
    const usable=observations.filter(o=>o.model);
    if(usable.length){
      const modelCenter=weightedMedian(usable.map(o=>({value:o.model.estimate,weight:1/(1+Math.max(0,o.days)/14)})));
      const latest=usable[0];
      const reference=Math.max(modelCenter,heaviest??0);
      result.capacity={referenceLb:rounded(reference),modelCenterLb:rounded(modelCenter),
        confidence:latest.days<=14&&usable.every(o=>o.model.candidates.every(c=>c.effortKnown&&c.qualityReported))&&m.equipment?.loadConvention!=='unknown'?'MODERATE':'LOW',
        latestModelEnvelopeLb:[rounded(latest.model.modelLow),rounded(latest.model.modelHigh)],
        latestEvidenceDate:latest.date,sessionCount:usable.length,
        latestSessionCenterLb:rounded(latest.model.estimate),
        sessionCenterRangeLb:[rounded(Math.min(...usable.map(o=>o.model.estimate))),rounded(Math.max(...usable.map(o=>o.model.estimate)))],
        effortBasis:usable.every(o=>o.model.candidates.every(c=>c.effortKnown))?'reported_RIR_adjusted':'includes_unknown_effort_rep_assumptions',
        raisedToLoggedPerformance:reference>modelCenter,
        method:'weighted session medians of Epley/Brzycki/OConnor; at most 3 sets/session; recency weight 1/(1+days/14); coaching model',
        latestInputs:latest.model.candidates.map(c=>({set:c.set,loadLb:c.loadLb,reps:c.reps,rir:c.rir,effectiveReps:c.effectiveReps,
          formulaEstimatesLb:Object.fromEntries(Object.entries(c.formulas).map(([k,v])=>[k,rounded(v)]))})),
        mainLoadPercentages:[...new Set(work.map(s=>s.weightLb))].sort((a,b)=>b-a).slice(0,4).map(load=>({loadLb:load,percentOfEstimatedReference:rounded(load/reference*100)}))};
    }else result.capacity=null;
    return result;
  }
  function quantitativeLines(m){
    const q=m.quantitative;if(!q)return [];
    const lines=[`NUMERIC BRIEF: saved load step +${fmt(q.loadStepLb)} lb${q.jumpPercent!==null?` = ${fmt(q.jumpPercent)}% of the heaviest completed main load`:''}${q.loadStepAssumed?' (assumed increment; keep prescribing on the entered scale)':''}.`];
    if(q.blocks.length)lines.push(`Same-load blocks: ${q.blocks.map(b=>`${fmt(b.loadLb)} lb, ${b.firstReps}→${b.lastReps} reps across ${b.sets} sets (${fmt(b.repDropPercent)}% observed rep drop)`).join('; ')}. Check intended reps/rest before attributing fatigue.`);
    if(q.assignedOutcome){const a=q.assignedOutcome;lines.push(`Target accounting: ${a.loadsComparable?`${a.repDeficit} missing reps in attempted matched-load targets; shortfall set positions ${a.shortfallSetNumbers.join(',')||'none'}`:'loads/structure changed; no numerical pass/fail claim'}; ${a.failedAttempts} failed attempts; ${a.unloggedTargets} targets unlogged (not failed).`);}
    if(q.capacity){
      const c=q.capacity;
      lines.push(`Capacity reference: ${fmt(c.referenceLb)} lb [${c.confidence} estimate confidence], from ${c.sessionCount} logged session(s); ${c.effortBasis==='reported_RIR_adjusted'?'uses reported reps + RIR':'includes unknown-effort rep assumptions'}. Latest anchor formula envelope ${c.latestModelEnvelopeLb.map(fmt).join('–')} lb${c.latestEvidenceDate?` from ${c.latestEvidenceDate}`:' from today'}; model disagreement, not a statistical interval.${c.sessionCount>1?` Session-center range separately ${c.sessionCenterRangeLb.map(fmt).join('–')} lb.`:''}${c.raisedToLoggedPerformance?' Reference raised to the heavier lift actually logged; models and performance disagree.':''}`);
      const s=c.latestInputs[0];
      lines.push(`Model anchor #${s.set}: ${fmt(s.loadLb)}×${s.reps}${s.rir===null?' (reserve unknown)':` +${s.rir} RIR`} → Epley ${fmt(s.formulaEstimatesLb.epley)}, Brzycki ${fmt(s.formulaEstimatesLb.brzycki)}, OConnor ${fmt(s.formulaEstimatesLb.oconnor)} lb. Latest session median ${fmt(c.latestSessionCenterLb)} lb uses sets ${c.latestInputs.map(input=>input.set).join(',')}.`);
      if(c.mainLoadPercentages.length)lines.push(`Working intensity against that estimated reference: ${c.mainLoadPercentages.map(p=>`${fmt(p.loadLb)} lb = ${fmt(p.percentOfEstimatedReference)}%`).join('; ')}. This is a model reference; reconcile any explicitly stated tested/training max in user notes.`);
    }else lines.push('Capacity: no suitable low-rep model observation; prescribe from completed load/reps directly. A logged single alone is not a tested max.');
    return lines;
  }
  function appPlanFact(value,movements,date){
    if(value?.selectionRule!=='current_session_only'||value.sourceDate!==date
      ||!Array.isArray(value.exercises)||value.exercises.length!==movements.length
      ||value.exercises.some((ex,i)=>key(ex?.name)!==key(movements[i].name)
        ||ex.type!==movements[i].type))return null;
    const sets=(entries,type)=>Array.isArray(entries)&&entries.length<=40?entries.map(s=>type==='cardio'
      ?{durationSeconds:n(s?.duration),distanceMiles:n(s?.distance),restSeconds:n(s?.restSeconds)}
      :{role:roleNames[s?.role]?s.role:'working',weightLb:n(s?.weight),reps:n(s?.reps),restSeconds:n(s?.restSeconds)}):[];
    return {source:'app_draft_not_performed',sourceDate:date,exercises:value.exercises.map(ex=>({
      name:clean(ex.name),type:ex.type,action:clean(ex.action),confidence:clean(ex.confidence),
      reason:clean(ex.reason),trigger:clean(ex.progressionTrigger),effortCue:clean(ex.effortCue),
      warmups:sets(ex.preparationSets,ex.type),main:sets(ex.workingSets,ex.type),
      reviewRequired:!!ex.needsReview,
    }))};
  }
  function planSetText(set,type){
    const label=type==='cardio'?'cardio':roleNames[set.role]||'work';
    const target=type==='cardio'
      ?[set.distanceMiles!==null?`${fmt(set.distanceMiles)} mi`:null,set.durationSeconds!==null?`${fmt(set.durationSeconds)} sec`:null].filter(Boolean).join('/')
      :`${fmt(set.weightLb)} lb×${fmt(set.reps)}`;
    return `${label} ${target}${set.restSeconds>0?` (rest ${fmt(set.restSeconds)}s)`:''}`;
  }
  function compactPlanSets(sets,type){
    const runs=[];
    sets.forEach(set=>{const value=planSetText(set,type),last=runs[runs.length-1];if(last?.value===value)last.count++;else runs.push({value,count:1});});
    return runs.map(run=>`${run.count}× ${run.value}`).join(' | ');
  }
  function build(options){
    const {helpers={},includeProgress=false,recordState='unknown'}=options;
    const current=helpers.normalizePayload?helpers.normalizePayload(options.current):options.current;
    const limit=[0,3,7].includes(Number(options.historyLimit))?Number(options.historyLimit):3;
    const flat=flatten(current,helpers,includeProgress);
    const priors=earlier(options.history,current).map((p,i)=>({id:`H${i+1}`,payload:p,...flatten(p,helpers)}));
    const notes=Array.from(new Set((options.notes||current.workoutNotes||[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim())));
    const movements=flat.movements.map(m=>{
      if(options.currentExerciseGoals&&typeof options.currentExerciseGoals==='object'){
        const savedAtWorkout=m.goal;
        const active=goalFact(options.currentExerciseGoals[key(m.name)],includeProgress);
        m.goal=active;
        if(savedAtWorkout&&JSON.stringify(savedAtWorkout)!==JSON.stringify(active)){
          m.goalAtWorkout=savedAtWorkout;
          if(m.profile?.source==='automatic_app_settings')m.profile=null;
        }
      }
      if(m.profile?.source==='automatic_app_settings'&&!m.goal)m.profile=null;
      m.summary=summarize(m);m.history=[];
      if(limit)for(const old of priors){
        const match=old.movements.find(x=>key(x.name)===key(m.name)&&x.type===m.type);if(!match)continue;
        m.history.push({contextId:old.id,date:old.payload.date,timestamp:old.payload.timestamp,calendarDaysBefore:calendarGap(current.date,old.payload.date),profile:match.profile,equipment:match.equipment,equipmentComparison:m.type==='strength'?equipmentMatch(m.equipment,match.equipment):'matched',sets:match.sets,summary:summarize(match)});
        if(m.history.length>=limit)break;
      }
      m.comparison=deltaSummary(m,m.history.find(h=>h.equipmentComparison!=='different'));
      if(limit){
        const exposures=priors.filter(p=>p.movements.some(old=>key(old.name)===key(m.name)&&old.type===m.type
          &&(m.type==='cardio'?old.sets.length>0:old.sets.some(eligible))));
        const dates=[...new Set(exposures.map(p=>p.payload.date))].sort().reverse();
        const intervals=dates.slice(1).map((date,i)=>calendarGap(dates[i],date)).filter(x=>x>0).slice(0,6).sort((a,b)=>a-b);
        const median=intervals.length?(intervals[Math.floor((intervals.length-1)/2)]+intervals[Math.floor(intervals.length/2)])/2:null;
        m.cadence={loggedSessionsLast28Days:exposures.filter(p=>{const d=calendarGap(current.date,p.payload.date);return d>=0&&d<28;}).length+(m.type==='cardio'||m.sets.some(eligible)?1:0),daysSincePrevious:exposures.length?calendarGap(current.date,exposures[0].payload.date):null,medianRecentGapDays:median};
      }
      m.quantitative=quantitativeSummary(m);
      return m;
    });
    const nextMinutes=Object.prototype.hasOwnProperty.call(options,'nextWorkoutMinutes')?options.nextWorkoutMinutes:current.sessionContext?.nextWorkoutMinutes??null;
    const packet={format:VERSION,date:current.date,recordState,dayType:clean(current.dayType)||null,sessionStatus:current.sessionContext?.status||'unknown',nextWorkoutMinutes:nextMinutes,priorityTargetMinutes:nextMinutes===null?null:Math.floor(nextMinutes*0.9),goals:options.currentGoals??current.goals??[],constraints:options.currentConstraints??current.constraints??{},notes,historyLimit:limit,groups:flat.groups,movements};
    packet.appPlan=['finished_saved','active_not_finished'].includes(recordState)
      ?appPlanFact(options.appPlan,movements,current.date):null;
    packet.notesScope=options.notesScope||current.workoutNotesScope||'session';
    const usedHistory=new Set(movements.flatMap(m=>m.history.map(h=>h.contextId)));
    packet.historyContext=priors.filter(p=>usedHistory.has(p.id)).map(p=>({id:p.id,date:p.payload.date,timestamp:p.payload.timestamp,dayType:clean(p.payload.dayType)||null,status:p.payload.sessionContext?.status||'unknown',notes:(p.payload.workoutNotes||[]).filter(x=>typeof x==='string'),notesScope:p.payload.workoutNotesScope||'session'}));
    if(options.includeSessionTime&&current.session)packet.sessionTiming=current.session;
    packet.counts={loggedEntries:(current.exercises||[]).reduce((a,e)=>a+(e.sets?.length||0),0),movementEntries:movements.reduce((a,m)=>a+m.sets.length,0),strengthEntries:movements.filter(m=>m.type==='strength').reduce((a,m)=>a+m.sets.length,0),cardioEntries:movements.filter(m=>m.type==='cardio').reduce((a,m)=>a+m.sets.length,0)};
    const outcomeNote=packet.sessionStatus==='complete'
      ? ' (complete is the app default unless changed; this setting alone does not mean Finish Workout was pressed)'
      : '';
    const lines=[`WORKOUT → NEXT SESSION | ${current.date} | ${VERSION}`,`Record: ${recordState}; user-selected day label: ${packet.dayType||'unspecified'}; session outcome setting: ${packet.sessionStatus}${outcomeNote}.`,`Roster (only these movements for next workout): ${movements.map(m=>JSON.stringify(m.name)).join(', ')}.`,`Counts: ${packet.counts.loggedEntries} log entries (a superset round is one); ${packet.counts.movementEntries} movement entries = ${packet.counts.strengthEntries} strength + ${packet.counts.cardioEntries} cardio.`];
    if(recordState==='active_not_finished')lines.push('This is an exported snapshot of an active workout, not a finished-session record. If sets change afterward, re-export before planning.');
    if(packet.sessionTiming)lines.push(`Session timing: ${packet.sessionTiming.sessionStart} → ${packet.sessionTiming.sessionEnd}; ${fmt(packet.sessionTiming.sessionDurationSec)} sec.`);
    if(packet.goals.length)lines.push(`Training focus: ${packet.goals.map(clean).join('; ')}.`);
    const constraintLines=helpers.describeConstraintsLines?helpers.describeConstraintsLines(packet.constraints):[];
    if(constraintLines.length)lines.push(`Constraints: ${constraintLines.map(clean).join('; ')}.`);
    if(packet.nextWorkoutMinutes!==null)lines.push(`Next session budget: ${packet.nextWorkoutMinutes} min; priority portion ≤${packet.priorityTargetMinutes??packet.nextWorkoutMinutes} min. Display the full roster even if it exceeds the budget.`);
    if(notes.length)lines.push(`${packet.notesScope==='calendar_day'?'CALENDAR-DAY NOTES (may cover other sessions on this date)':'SESSION NOTES'} (user text; reconcile with the set log):`,...notes.map(note=>`- ${JSON.stringify(note)}`));
    lines.push('','HOW TO READ','Load = lb as entered; each Weight setup defines total/per-hand/machine meaning; unknown remains unresolved. 0 = no external load logged. Distance = mi; time/rest = sec. # ranges repeat identical entries.','work/top/backoff = candidate main work; warmup/ramp/practice/failed/unknown separate. ! user-marked; ~role-confidence inferred by app; # outcome-derived. Roles may be wrong. RIR = reps left. Missing RIR/form/pain = unknown. Rest = planned/timer-observed, not verified between-set rest; ? missing.');
    if(movements.some(m=>m.prescription))lines.push('An assigned target is a saved in-app plan, not proof it was performed. Numeric completion does not establish clean form, low effort, or absence of pain.');
    lines.push('Qualifying totals exclude failed, stopped-for-pain, poor-form and non-main sets, but can include inferred roles. Volume = Σ(load×reps), not fatigue or progress. Long-term weight goals are logged load targets, not tested 1RMs or next-session prescriptions.');
    if(movements.some(m=>m.quantitative?.capacity))lines.push('Capacity math: L=entered load; n=reps+reported RIR (0–3), or reps alone with reserve unknown; only n=2–10 modeled. Epley=L(1+n/30); Brzycki=36L/(37−n); OConnor=L(1+0.025n). Up to 3 early/low-rep sets form a weighted session median; up to 5 sessions form a recency-weighted median, weight=1/(1+days/14). These weighting choices are coaching heuristics. Reference never falls below a heavier successful main lift in this snapshot.');
    if(flat.groups.length)lines.push(`Supersets: ${flat.groups.map(g=>`${g.id} = ${g.exercises.map(x=>JSON.stringify(x)).join(' + ')} (${g.rounds} rounds)`).join('; ')}. Rest on a superset entry belongs to its round.`);
    if(packet.historyContext.length){lines.push('','HISTORY CONTEXT (referenced below; notes shown once)');packet.historyContext.forEach(h=>{lines.push(`${h.id}: ${h.date}${packet.historyContext.filter(x=>x.date===h.date).length>1?` @ ${h.timestamp}`:''}; day=${h.dayType||'unspecified'}; status-setting=${h.status}.`);if(h.notes.length)lines.push(`  ${h.notesScope==='calendar_day'?'Calendar-day':'Session'} notes: ${h.notes.map(note=>JSON.stringify(note)).join('; ')}`);});}
    lines.push('','CURRENT RESULTS + MATCHED HISTORY (newest first)');
    movements.forEach((m,i)=>{
      lines.push(`\n${i+1}. ${JSON.stringify(m.name)} [${m.type}]`);
      if(m.goal)lines.push(`Goal: ${fmt(m.goal.target)} ${m.goal.unit}${m.goal.type==='weight'?` × ${m.goal.targetReps} rep${m.goal.targetReps===1?'':'s'}`:''} (${m.goal.type}; ${m.goal.focus||'focus unspecified'})${includeProgress&&m.goal.appLoggedBest!==undefined?`; app-tracked best at the required reps ${fmt(m.goal.appLoggedBest)} ${m.goal.unit} (not independently verified)`:''}.`);
      else lines.push('Goal: — (none currently set).');
      if(m.goalAtWorkout)lines.push(`At-workout goal (historical only): ${fmt(m.goalAtWorkout.target)} ${m.goalAtWorkout.unit}${m.goalAtWorkout.type==='weight'?` × ${m.goalAtWorkout.targetReps} rep${m.goalAtWorkout.targetReps===1?'':'s'}`:''} (${m.goalAtWorkout.type}).`);
      if(m.profile)lines.push(profileText(m.profile));
      if(m.equipment)lines.push(`Weight setup: ${loadLabels[m.equipment.loadConvention]}${m.equipment.label?`; equipment ${JSON.stringify(m.equipment.label)}`:''}; smallest confirmed step ${m.equipment.incrementLb===null?'unknown':`${fmt(m.equipment.incrementLb)} lb`}.`);
      if(m.cadence)lines.push(`Logged cadence: ${m.cadence.loggedSessionsLast28Days} same-movement sessions in 28 calendar days (including today); previous exposure ${m.cadence.daysSincePrevious===null?'unknown':`${fmt(m.cadence.daysSincePrevious)} days ago`}; median recent gap ${m.cadence.medianRecentGapDays===null?'unknown':`${fmt(m.cadence.medianRecentGapDays)} days`}. Saved logs only; missing days do not prove inactivity.`);
      const assignment=assignedLine(m);if(assignment)lines.push(assignment);
      lines.push(`Today: ${compactSets(m.sets,m.type)}`);
      const s=m.summary;
      if(m.type==='strength')lines.push(`Calculated: ${s.qualifyingSets} qualifying main sets, ${s.qualifyingReps} reps, ${fmt(s.qualifyingVolumeLb)} lb·reps; ${s.failedAttempts} failed; ${s.inferredRoles}/${s.entries} roles inferred. Unknown: RIR ${s.unknownRir}/${m.sets.filter(x=>x.completed).length} completed sets, form ${s.unknownTechnique}/${s.entries}, pain ${s.unknownPain}/${s.entries}.`);
      else lines.push(`Calculated: ${fmt(s.durationSeconds)} sec total; ${s.distanceMiles===null?'distance unknown':`${fmt(s.distanceMiles)} mi total`}. Effort, heart rate, terrain and conditions are not recorded.`);
      lines.push(...quantitativeLines(m));
      if(!m.history.length)lines.push(limit?'History: no earlier matching movement in saved app data.':'History: excluded by export preference.');
      m.history.forEach(h=>{
        const label=`${h.date}${h.calendarDaysBefore===0?` @ ${h.timestamp||'time unknown'}`:''}${h.calendarDaysBefore!==null?` (${h.calendarDaysBefore} calendar days earlier)`:''}`;
        lines.push(`Previous ${h.contextId} ${label}${m.type==='strength'?` [equipment ${h.equipmentComparison}${h.equipment.label?`: ${JSON.stringify(h.equipment.label)}`:''}]`:''}: ${compactSets(h.sets,m.type)}`);
        if(h.profile?.source==='user_settings'&&JSON.stringify(h.profile)!==JSON.stringify(m.profile))lines.push(`  Earlier profile: ${profileText(h.profile)}`);
      });
      if(m.comparison){const c=m.comparison;if(c.sameLoadReps.length)lines.push(`Same-load qualifying reps, ${c.contextId} (equipment ${c.equipmentComparison}) → today: ${c.sameLoadReps.map(x=>`${fmt(x.weightLb)} lb [${x.previous.join(',')}]→[${x.current.join(',')}]`).join('; ')}.`);if(c.qualifyingVolumeChangePercent!==undefined)lines.push(`Comparison with ${c.contextId}: main-set count ${c.qualifyingSetsDelta>=0?'+':''}${c.qualifyingSetsDelta}; main volume ${c.qualifyingVolumeChangePercent>=0?'+':''}${c.qualifyingVolumeChangePercent}% (dose comparison only; check reps, effort and context).`);}
    });
    if(packet.appPlan){
      lines.push('',recordState==='active_not_finished'
        ?'PROVISIONAL APP NEXT-WORKOUT DRAFT (from this active snapshot; recalculate after later edits)'
        :'APP NEXT-WORKOUT DRAFT (calculated from this log; not performed or medically verified)');
      packet.appPlan.exercises.forEach((ex,i)=>{
        lines.push(`${i+1}. ${JSON.stringify(ex.name)}: ${ex.action||'REVIEW'} [${ex.confidence||'unknown'} confidence]${ex.reviewRequired?' — review before following':''}.`);
        if(ex.main.length)lines.push(`  Main: ${compactPlanSets(ex.main,ex.type)}.`);
        if(ex.warmups.length)lines.push(`  Logged warm-up pattern: ${compactPlanSets(ex.warmups,ex.type)}.`);
        if(ex.reason)lines.push(`  Why: ${ex.reason}`);
        if(ex.effortCue)lines.push(`  Effort: ${ex.effortCue}`);
        if(ex.trigger)lines.push(`  Next increase requires: ${ex.trigger}`);
      });
    }
    if(movements.some(m=>m.type==='strength'))lines.push('','PROGRAMMING LENS (general evidence versus app rules)',
      'For a strength goal, prioritize repeatable high-quality work, appropriate heavier exposure, enough submaximal volume and rest, and recorded effort/recovery. A goal load is not a verified current 1RM; do not derive fixed percentages or a peak calendar from it.',
      'Keep the logged scheme: straight 5×5, top set plus back-offs, or rep range only when actually identifiable. Complete assigned work before escalating; compare like loads/roles across sessions. Change one variable at a time; hold or reduce after misses, pain, poor form or uncertain data. Do not add a heavy single or extra exercise just because a strength goal exists.',
      'The app’s exact 5×5 completion/reset, two-comparable-session, load-step and fatigue cutoffs are coaching heuristics, not proven individual laws. General evidence anchors: ACSM position stand https://pubmed.ncbi.nlm.nih.gov/41843416/ ; load/sets/frequency review https://pubmed.ncbi.nlm.nih.gov/37414459/ ; autoregulation review https://pubmed.ncbi.nlm.nih.gov/40791980/ ; strength rest review https://pubmed.ncbi.nlm.nih.gov/28933024/ .');
    lines.push('','NEXT WORKOUT REQUEST',
      'Start with DO THIS NEXT. Prescribe the full current-session roster in order and preserve superset groups. The day label is user-selected context; if it conflicts with the exercises, flag it rather than moving or adding movements. History informs progression, never exercise selection. Give warm-ups, exact main sets/load/reps (or cardio time/distance), rest, effort, next progression trigger and one reason per movement.',
      'Compare assigned versus completed work and like-for-like history. Preserve the identifiable scheme; choose the smallest justified change in load, reps or sets. Holds/reductions are valid. Explain meaningful previous→next numbers and confidence; mark exact rules as evidence-backed or coaching heuristics. Do not invent maxes, equipment, effort, recovery or observations.',
      'Make the numbers auditable for every movement: previous→next working load and percentage change, main sets × reps, rest, the goal-directed reason, and the exact next progression trigger. Use the numeric brief as evidence, not a mandatory prescription. Missing RIR, equipment setup, or a capacity estimate must not become a prerequisite for a complete next workout; use observed load/reps and state assumptions inline.',
      'Choose the rep/set scheme deliberately: retain effective straight sets (3×5, 5×5, 3×3, 4×4, 5×3), separate top sets/back-offs, or use rep-range progression when increments are coarse. These are program conventions, not universally optimal percentage tables. Explain a scheme change numerically. Treat improving same-load reps as progress; distinguish early shortfalls from late-set attrition. Do not add sets merely because tonnage fell, or impose a fixed percentage reduction from unlogged days.',
      'A logged successful rep is not independent proof of clean technique, effort or a tested max. Preserve the exercise roster, not an arbitrary exact set count; distinguish warm-ups from working sets and justify the planned dose and time estimate.',
      'Weight setup is optional. Keep prescribing from logged performance when it is missing: use the entered weight scale consistently, label assumed increments, and avoid invented per-hand/total conversions or machine equivalence. Known different machines or conventions are not comparable. With unknown effort, prefer repeated completion evidence. Restore short rest before diagnosing lost strength. Interpret logged gaps relative to cadence; unlogged days do not prove inactivity and no fixed weekly strength-loss percentage applies.',
      'For percentage work, name the current capacity reference, date and estimation method; never use the goal as current capacity. A training max is a chosen programming factor: distinguish percent of training max from percent of estimated 1RM. Formula spread is model disagreement, not a confidence interval. Use feasible equipment steps and conservative rounding for heavy work. Support a goal attempt with converging recent performance, effort and technique evidence; one optimistic estimate is insufficient.',
      'If time is limited, show a priority stopping point AND the complete remaining roster without catch-up sets. Change the roster only for an explicit user request, stated post-goal rule, or safety/equipment need; label any substitution. Pain, a miss or form breakdown must not trigger mandatory fallback sets or an invented precise substitution; stop the affected work and give a conditional safety path. Ask only questions that materially change the plan.');
    if(packet.appPlan)lines.push('Treat the app draft as a transparent starting point, not an order. Reconcile it with the log; if you change a target, show the changed number and specific evidence or safety reason so app and AI stay on one progression path.');
    return {packet,text:lines.join('\n')};
  }
  const api={build,compactSets,flatten,summarize};
  if(typeof module!=='undefined')module.exports=api;
  root.WorkoutAIExport=api;
})(typeof window!=='undefined'?window:globalThis);
