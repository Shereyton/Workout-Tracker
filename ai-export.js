/* A fact-first coaching handoff. App targets are labelled drafts, never observations. */
(function (root) {
  'use strict';
  const VERSION = 'ai-workout/2';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = value => clean(value).toLowerCase();
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const n = value => numeric(value) ? Number(value) : null;
  const fmt = value => n(value) === null ? '?' : String(Number(Number(value).toFixed(2)));
  const mainRoles = new Set(['working', 'top_set', 'back_off']);
  const roleNames = {working:'work',top_set:'top',back_off:'backoff',warmup:'warmup',ramp:'ramp',technique:'practice',failed_attempt:'failed',unknown:'unknown',auto:'unknown'};
  function goalFact(goal, includeProgress) {
    if (!goal || !(Number(goal.goalValue) > 0)) return null;
    const result = {type:clean(goal.goalType),target:Number(goal.goalValue),unit:clean(goal.unit),focus:clean(goal.goalPathLabel || goal.goalPath)};
    if (includeProgress && numeric(goal.currentBestPerformance)) result.appLoggedBest=Number(goal.currentBestPerformance);
    return result;
  }
  function profileFact(profile) {
    if(!profile) return null;
    return {source:profile.mode==='custom'?'user_settings':'automatic_app_settings',purpose:clean(profile.purposeLabel||profile.purpose),repMin:n(profile.repMin),repMax:n(profile.repMax),targetRir:n(profile.targetRir),loadStep:n(profile.loadStep)};
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
      if(!byName.has(id)){const e={name:clean(name),type:cardio?'cardio':'strength',goal:goalFact(goal,includeProgress),profile:cardio?null:profileFact(profile),prescription:prescribedFact(prescription,cardio),sets:[]};byName.set(id,e);movements.push(e);}
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
    if(current.type!=='strength'||!previous?.summary)return null;
    const a=current.summary,b=previous.summary;
    const result={qualifyingSetsDelta:a.qualifyingSets-b.qualifyingSets};
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
    return `Assigned main target${target.sourceDate?` (from ${target.sourceDate})`:''}: ${runs.map(r=>`${r.count}×${r.value}`).join(' | ')}. Numeric targets met ${met}/${target.workingSets.length}; ${actual.length} qualifying main entries logged. Missing entries are not automatically failed sets.`;
  }
  function profileText(p){
    if(!p)return '';
    return `${p.source==='user_settings'?'User settings':'App defaults (not verified equipment)'}: ${p.purpose}; reps ${fmt(p.repMin)}–${fmt(p.repMax)}, target RIR ${fmt(p.targetRir)}, load step ${fmt(p.loadStep)} lb.`;
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
        m.history.push({contextId:old.id,date:old.payload.date,timestamp:old.payload.timestamp,calendarDaysBefore:calendarGap(current.date,old.payload.date),profile:match.profile,sets:match.sets,summary:summarize(match)});
        if(m.history.length>=limit)break;
      }
      m.comparison=deltaSummary(m,m.history[0]);return m;
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
    const lines=[`WORKOUT → NEXT SESSION | ${current.date} | ${VERSION}`,`Record: ${recordState}; user-selected day label: ${packet.dayType||'unspecified'}; user-selected session outcome: ${packet.sessionStatus}.`,`Roster (only these movements for next workout): ${movements.map(m=>JSON.stringify(m.name)).join(', ')}.`,`Counts: ${packet.counts.loggedEntries} log entries (a superset round is one); ${packet.counts.movementEntries} movement entries = ${packet.counts.strengthEntries} strength + ${packet.counts.cardioEntries} cardio.`];
    if(recordState==='active_not_finished')lines.push('This is an exported snapshot of an active workout, not a finished-session record. If sets change afterward, re-export before planning.');
    if(packet.sessionTiming)lines.push(`Session timing: ${packet.sessionTiming.sessionStart} → ${packet.sessionTiming.sessionEnd}; ${fmt(packet.sessionTiming.sessionDurationSec)} sec.`);
    if(packet.goals.length)lines.push(`Training focus: ${packet.goals.map(clean).join('; ')}.`);
    const constraintLines=helpers.describeConstraintsLines?helpers.describeConstraintsLines(packet.constraints):[];
    if(constraintLines.length)lines.push(`Constraints: ${constraintLines.map(clean).join('; ')}.`);
    if(packet.nextWorkoutMinutes!==null)lines.push(`Next session budget: ${packet.nextWorkoutMinutes} min; priority portion ≤${packet.priorityTargetMinutes??packet.nextWorkoutMinutes} min. Display the full roster even if it exceeds the budget.`);
    if(notes.length)lines.push(`${packet.notesScope==='calendar_day'?'CALENDAR-DAY NOTES (may cover other sessions on this date)':'SESSION NOTES'} (user text; reconcile with the set log):`,...notes.map(note=>`- ${JSON.stringify(note)}`));
    lines.push('','HOW TO READ','Load = lb as entered (total/per-hand/equipment convention unknown); 0 = no external load logged. Distance = mi; time/rest = sec. # ranges repeat identical entries.','work/top/backoff = candidate main work; warmup/ramp/practice/failed/unknown separate. ! user-marked; ~role-confidence inferred by app; # outcome-derived. Roles may be wrong. RIR = reps left. Missing RIR/form/pain = unknown. Rest = planned/timer-observed, not verified between-set rest; ? missing.');
    if(movements.some(m=>m.prescription))lines.push('An assigned target is a saved in-app plan, not proof it was performed. Numeric completion does not establish clean form, low effort, or absence of pain.');
    lines.push('Qualifying totals exclude failed, stopped-for-pain, poor-form and non-main sets, but can include inferred roles. Volume = Σ(load×reps), not fatigue or progress. Long-term weight goals are logged load targets, not tested 1RMs or next-session prescriptions.');
    if(flat.groups.length)lines.push(`Supersets: ${flat.groups.map(g=>`${g.id} = ${g.exercises.map(x=>JSON.stringify(x)).join(' + ')} (${g.rounds} rounds)`).join('; ')}. Rest on a superset entry belongs to its round.`);
    if(packet.historyContext.length){lines.push('','HISTORY CONTEXT (referenced below; notes shown once)');packet.historyContext.forEach(h=>{lines.push(`${h.id}: ${h.date}${packet.historyContext.filter(x=>x.date===h.date).length>1?` @ ${h.timestamp}`:''}; day=${h.dayType||'unspecified'}; status-setting=${h.status}.`);if(h.notes.length)lines.push(`  ${h.notesScope==='calendar_day'?'Calendar-day':'Session'} notes: ${h.notes.map(note=>JSON.stringify(note)).join('; ')}`);});}
    lines.push('','CURRENT RESULTS + MATCHED HISTORY (newest first)');
    movements.forEach((m,i)=>{
      lines.push(`\n${i+1}. ${JSON.stringify(m.name)} [${m.type}]`);
      if(m.goal)lines.push(`Goal: ${fmt(m.goal.target)} ${m.goal.unit} (${m.goal.type}; ${m.goal.focus||'focus unspecified'})${includeProgress&&m.goal.appLoggedBest!==undefined?`; app-tracked best ${fmt(m.goal.appLoggedBest)} ${m.goal.unit} (not independently verified)`:''}.`);
      else lines.push('Goal: — (none currently set).');
      if(m.goalAtWorkout)lines.push(`At-workout goal (historical only): ${fmt(m.goalAtWorkout.target)} ${m.goalAtWorkout.unit} (${m.goalAtWorkout.type}).`);
      if(m.profile)lines.push(profileText(m.profile));
      const assignment=assignedLine(m);if(assignment)lines.push(assignment);
      lines.push(`Today: ${compactSets(m.sets,m.type)}`);
      const s=m.summary;
      if(m.type==='strength')lines.push(`Calculated: ${s.qualifyingSets} qualifying main sets, ${s.qualifyingReps} reps, ${fmt(s.qualifyingVolumeLb)} lb·reps; ${s.failedAttempts} failed; ${s.inferredRoles}/${s.entries} roles inferred. Unknown: RIR ${s.unknownRir}/${m.sets.filter(x=>x.completed).length} completed sets, form ${s.unknownTechnique}/${s.entries}, pain ${s.unknownPain}/${s.entries}.`);
      else lines.push(`Calculated: ${fmt(s.durationSeconds)} sec total; ${s.distanceMiles===null?'distance unknown':`${fmt(s.distanceMiles)} mi total`}. Effort, heart rate, terrain and conditions are not recorded.`);
      if(!m.history.length)lines.push(limit?'History: no earlier matching movement in saved app data.':'History: excluded by export preference.');
      m.history.forEach(h=>{
        const label=`${h.date}${h.calendarDaysBefore===0?` @ ${h.timestamp||'time unknown'}`:''}${h.calendarDaysBefore!==null?` (${h.calendarDaysBefore} calendar days earlier)`:''}`;
        lines.push(`Previous ${h.contextId} ${label}: ${compactSets(h.sets,m.type)}`);
        if(h.profile?.source==='user_settings'&&JSON.stringify(h.profile)!==JSON.stringify(m.profile))lines.push(`  Earlier profile: ${profileText(h.profile)}`);
      });
      if(m.comparison){const c=m.comparison;if(c.sameLoadReps.length)lines.push(`Same-load qualifying reps, latest previous → today: ${c.sameLoadReps.map(x=>`${fmt(x.weightLb)} lb [${x.previous.join(',')}]→[${x.current.join(',')}]`).join('; ')}.`);if(c.qualifyingVolumeChangePercent!==undefined)lines.push(`Latest comparison: main-set count ${c.qualifyingSetsDelta>=0?'+':''}${c.qualifyingSetsDelta}; main volume ${c.qualifyingVolumeChangePercent>=0?'+':''}${c.qualifyingVolumeChangePercent}% (dose comparison only; check reps, effort and context).`);}
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
      'The app’s exact 5×5 completion/reset, two-comparable-session, load-step and fatigue cutoffs are coaching heuristics, not proven individual laws. General evidence anchors: ACSM position stand https://pubmed.ncbi.nlm.nih.gov/41843416/ ; autoregulation review https://pubmed.ncbi.nlm.nih.gov/40791980/ ; strength rest review https://pubmed.ncbi.nlm.nih.gov/28933024/ .');
    lines.push('','NEXT WORKOUT REQUEST',
      'Start with DO THIS NEXT. Prescribe the full current-session roster in order and preserve superset groups. The day label is user-selected context; if it conflicts with the exercises, flag it rather than moving or adding movements. History informs progression, never exercise selection. Give warm-ups, exact main sets/load/reps (or cardio time/distance), rest, effort, next progression trigger and one reason per movement.',
      'Compare assigned versus completed work and like-for-like history. Preserve the identifiable scheme; choose the smallest justified change in load, reps or sets. Holds/reductions are valid. Explain meaningful previous→next numbers and confidence; mark exact rules as evidence-backed or coaching heuristics. Do not invent maxes, equipment, effort, recovery or observations.',
      'If time is limited, show a priority stopping point AND the complete remaining roster without catch-up sets. Change the roster only for an explicit user request, stated post-goal rule, or safety/equipment need; label any substitution. Ask only questions that materially change the plan.');
    if(packet.appPlan)lines.push('Treat the app draft as a transparent starting point, not an order. Reconcile it with the log; if you change a target, show the changed number and specific evidence or safety reason so app and AI stay on one progression path.');
    return {packet,text:lines.join('\n')};
  }
  const api={build,compactSets,flatten,summarize};
  if(typeof module!=='undefined')module.exports=api;
  root.WorkoutAIExport=api;
})(typeof window!=='undefined'?window:globalThis);
