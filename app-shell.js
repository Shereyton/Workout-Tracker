/* iPhone-first product shell. Business rules live in script.js and progression-planner.js. */
(function (root) {
  'use strict';
  const key = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const finite = (value) => value !== null && value !== '' && Number.isFinite(Number(value));
  const number = (value) => finite(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const hasSets = (payload) => Array.isArray(payload?.exercises) && payload.exercises.some(ex => Array.isArray(ex?.sets) && ex.sets.length);
  function uniqueSessions(history) {
    const seen = new Set();
    return (Array.isArray(history) ? history : Object.values(history || {})).filter(hasSets).filter(item => {
      const id = item.workoutId || item.id || item.completedId || `${item.timestamp || item.date}:${JSON.stringify(item.exercises)}`;
      if (seen.has(id)) return false;
      seen.add(id); return true;
    }).sort((a,b) => String(b.timestamp || b.date).localeCompare(String(a.timestamp || a.date)));
  }
  function targetText(set, type) {
    if (type === 'cardio') {
      const parts = [];
      if (finite(set.distance) && Number(set.distance) > 0) parts.push(`${number(set.distance)} mi`);
      if (finite(set.duration) && Number(set.duration) > 0) parts.push(`${number(Number(set.duration) / 60)} min`);
      return parts.join(' · ') || 'Repeat a comfortable effort';
    }
    return `${Number(set.weight) === 0 ? 'Bodyweight' : `${number(set.weight)} lb`} × ${number(set.reps)}`;
  }
  function sessionDate(payload) {
    const date = String(payload?.date || payload?.timestamp || '').slice(0,10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null;
    return parsed && !isNaN(parsed) ? parsed.toLocaleDateString(undefined, { month:'short', day:'numeric' }) : 'Saved session';
  }
  function init() {
    const doc = root.document;
    if (!doc?.getElementById('trainingSection') || doc.body.classList.contains('app-v2')) return;
    const api = root.workoutTracker;
    if (!api?.getState) return; // Legacy screen remains fully usable if the enhancement cannot initialize.
    const originalElements = new Map(Array.from(doc.querySelectorAll('[id]'),el=>[el.id,el]));
    const $ = (id) => doc.getElementById(id) || originalElements.get(id);
    const make = (tag, cls, html) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; };
    const button = (label, handler, cls = 'shell-button') => { const el = make('button',cls); el.type='button'; el.textContent=label; el.addEventListener('click',handler); return el; };
    const heading = (eyebrow,title,copy) => make('div','view-heading',`<span class="eyebrow">${eyebrow}</span><h2 tabindex="-1">${title}</h2><p>${copy}</p>`);
    const details = (label, nodes, cls='settings-disclosure') => { const el=make('details',cls); el.append(make('summary','',label)); nodes.filter(Boolean).forEach(n=>el.append(n)); return el; };
    const section = doc.querySelector('main > .section');
    const train=make('section','app-view'); train.id='view-train'; train.dataset.viewPanel='train';
    const plan=make('section','app-view'); plan.id='view-plan'; plan.dataset.viewPanel='plan';
    const progress=make('section','app-view'); progress.id='view-progress'; progress.dataset.viewPanel='progress';
    const history=make('section','app-view'); history.id='view-history'; history.dataset.viewPanel='history';
    const panels={train,plan,progress,history};
    const overview=make('div','today-overview'); overview.id='todayOverview';
    const recent=make('div','recent-exercises'); recent.id='recentExercises';
    const picker=details('Choose or switch exercise',[$('trainingSection')],'exercise-picker'); picker.open=true;
    train.append(overview,recent,picker,$('interface'),$('summaryBox'));
    const customInput=$('customExercise').parentElement;
    const extras=details('Can’t find it? Add an exercise or superset',[customInput,$('startSuperset'),$('supersetBuilder')],'exercise-extras');
    $('trainingSection').append(extras);
    const target=make('div','live-target'); target.id='liveTarget'; target.hidden=true;
    $('exerciseStage').after(target);
    // Visible labels remain visible even after a numeric value has been entered.
    [['weight','Weight','lb'],['reps','Repetitions','reps']].forEach(([id,label,unit])=>{
      const input=$(id); const cell=make('div','number-field');
      input.before(cell); const lab=make('label','',label); lab.htmlFor=id;
      cell.append(lab,input,make('span','input-unit',unit)); input.placeholder='0';
    });
    $('logBtn').textContent='Log set';
    $('nextExerciseBtn').textContent='Next exercise';
    $('finishBtn').textContent='Finish & save workout';
    $('resetBtn').textContent='Clear current workout';
    $('autoSetNote').textContent='Warm-up or main set? We estimate from your log. Tap “Set details” if it looks wrong.';
    const accuracySummary=$('accuracyDetails').querySelector('summary');
    if(accuracySummary) accuracySummary.textContent='Set details · effort, pain & corrections';
    const effort=make('fieldset','quick-effort','<legend>How hard was that set? <span>Optional</span></legend>');
    [['Comfortable','3'],['Challenging','2'],['All-out','0']].forEach(([label,value])=>{
      const b=button(label,()=>{
        const selected=b.getAttribute('aria-pressed')==='true';
        $('setRir').value=selected?'':value;
        $('setRir').dispatchEvent(new Event('change',{bubbles:true}));
        effort.querySelectorAll('button').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===b&&!selected)));
      },'effort-button'); b.setAttribute('aria-pressed','false'); effort.append(b);
    });
    effort.append(make('small','','About 3, 2, or 0 good reps left. Leave blank if unsure.'));
    $('logBtn').before(effort);
    $('logBtn').addEventListener('click',()=>effort.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false')));

    plan.append(heading('A reason behind every rep','Your next move.','A clear prescription, built from what you actually logged.'));
    const sourceLabel=make('label','source-label','Build a plan from'); sourceLabel.htmlFor='planSource';
    const sourceSelect=make('select','field'); sourceSelect.id='planSource';
    const planContent=make('div','plan-content'); planContent.id='planContent';
    plan.append(sourceLabel,sourceSelect,planContent);
    plan.append(details('How your plan works',[make('div','coach-method',
      '<p><strong>More is not always better.</strong> First build repeatable reps with good form; then earn a small weight increase. A repeat or easier day can be the right next step.</p><p>Only this session’s exercises are used. Earlier sessions help compare the same movements. Unknown effort, technique, or set types lower confidence.</p><p>These are conservative starting targets—not a guarantee or a medical assessment. Stop a movement that hurts. Warm-ups are based on what you logged; add gradual, comfortable preparation if needed.</p><p>Guided by the <a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noopener">2026 ACSM guidance</a>. Exact step sizes and readiness rules are app heuristics, not a scientifically proven individual optimum.</p>') ]));
    plan.append($('exportSection'));
    const context=details('Tell your coach more',[$('dayTypeSection'),$('goalsSection'),$('constraintsSection')]);
    plan.append(context);
    progress.append(heading('Built over time','Proof of progress.','Your goals, your consistency, and the work behind them.'));
    const progressContent=make('div','progress-content'); progressContent.id='progressContent'; progress.append(progressContent);
    history.append(heading('Every session matters','Your training story.','Saved workouts and notes, together in one place.'));
    const dataCard=make('div','data-card','<span class="eyebrow">Made to be yours</span><h3>Protect your hard work.</h3><p>Workouts stay in this browser, not in a cloud account. Export your history regularly, especially before changing phones.</p>');
    dataCard.append(button('Export calendar notes',()=> $('exportHistory').click()));
    dataCard.append(make('p','data-fineprint','This backs up calendar notes only. Download individual saved workouts from Your session, and use Export Workout for the full current workout and its goals.'));
    history.append(dataCard,$('calendarSection'));
    section.replaceChildren(train,plan,progress,history);
    const appearance=$('darkToggle'); doc.querySelector('.brand-row').append(appearance);
    const status=make('div','shell-status'); status.id='shellStatus'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); doc.body.append(status);
    let statusTimer;
    const tell=(message)=>{ status.textContent=message;status.classList.add('visible');clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.classList.remove('visible'),4500); };
    let view='train', state={}, sessions=[], selectedSource='current', lastExercise='', activeGuide=null, renderPending=false;
    try { const saved=JSON.parse(root.sessionStorage.getItem('wt_guidedPlan')||'null'); if(saved&&Array.isArray(saved.exercises)) activeGuide=saved; } catch {}
    function switchView(name,{focus=true}={}) {
      if(!panels[name]) return;
      view=name;
      Object.entries(panels).forEach(([id,panel])=>{panel.hidden=id!==name;});
      doc.querySelectorAll('.dock-action[data-view]').forEach(b=>{
        const on=b.dataset.view===name;b.classList.toggle('is-active',on);
        if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      });
      doc.body.dataset.appView=name;
      if (focus) { root.scrollTo?.({top:0,behavior:'instant'}); panels[name].querySelector('h2')?.focus({preventScroll:true}); }
    }
    doc.querySelectorAll('.dock-action[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    function currentName(){return state.activeExercise?.name || state.currentExercise?.name || '';}
    async function chooseExercise(name, goal=false) {
      const result=await api.startExercise?.(name);
      if(result===false)return false;
      switchView('train'); scheduleRender();
      if(goal) { if($('exerciseGoalForm').classList.contains('hidden'))$('exerciseGoalToggle').click(); $('exerciseGoalPanel').scrollIntoView({block:'center',behavior:'smooth'}); }
      else $('interface').scrollIntoView({block:'start',behavior:'smooth'});
      return true;
    }
    function renderOverview() {
      const exercises=state.current?.exercises || [];
      const count=exercises.reduce((n,e)=>n+(e?.sets?.length||0),0);
      const name=currentName();
      overview.hidden=Boolean(name);
      recent.hidden=Boolean(name);
      doc.body.classList.toggle('has-active-exercise',Boolean(name));
      if(name!==lastExercise){picker.open=!name;lastExercise=name;}
      const latest=sessions[0];
      overview.innerHTML=`<div class="hero-orbit" aria-hidden="true"><span>↗</span></div><div class="hero-kicker"><i></i> YOUR PERSONAL TRAINING SPACE</div><h2>${count?'Keep the<br>momentum.':'Make your<br>next rep count.'}</h2><p>${count?'Your work is here. Pick up where you left off.':'One clear goal. One focused session.<br>A stronger version of you.'}</p><div class="hero-bottom"><span><strong>${number(sessions.length)}</strong> saved sessions</span><span><strong>${number(Object.keys(state.goals||{}).length)}</strong> exercise goals</span></div>`;
      overview.append(button(count?'Continue training ↗':'Let’s train ↗',()=>{$('exerciseSearch').focus();$('trainingSection').scrollIntoView({block:'start',behavior:'smooth'});},'hero-button'));
      recent.replaceChildren();
      if(latest){recent.append(make('div','section-line',`<h3>Pick up the rhythm</h3><span>${sessionDate(latest)}</span>`));const rail=make('div','exercise-rail');
        (latest.exercises||[]).filter(e=>e?.name&&!e.isSuperset).slice(0,8).forEach(e=>rail.append(button(e.name,()=>chooseExercise(e.name),'exercise-chip')));recent.append(rail);}
    }
    function rebuildSources() {
      const prior=sourceSelect.value || selectedSource;
      sourceSelect.replaceChildren();
      if(hasSets(state.current)){ const o=make('option','','Current session');o.value='current';sourceSelect.append(o); }
      sessions.forEach((item,index)=>{const o=make('option','',`${sessionDate(item)} · ${item.dayType || item.sessionContext?.dayType || 'Workout'} · ${item.exercises.length} exercises`);o.value=`saved-${index}`;sourceSelect.append(o);});
      if(!sourceSelect.options.length){const o=make('option','','No sessions yet');o.value='';sourceSelect.append(o);}
      const match=Array.from(sourceSelect.options).find(o=>o.value===prior);
      sourceSelect.value=match?prior:sourceSelect.options[0].value;
      selectedSource=sourceSelect.value;
    }
    function getPlan() {
      const source=selectedSource==='current'?state.current:sessions[Number(selectedSource.replace('saved-',''))];
      if(!hasSets(source)||!root.WorkoutPlanner)return null;
      return root.WorkoutPlanner.buildNextWorkout({current:source,history:sessions.filter(s=>s!==source),goals:state.goals,helpers:api.helpers||state.helpers});
    }
    function saveGuide(value) {activeGuide=value;try{root.sessionStorage.setItem('wt_guidedPlan',JSON.stringify(value));}catch{}renderTarget();}
    function renderPlan() {
      planContent.replaceChildren();
      const prescription=getPlan();
      if(!prescription?.exercises?.length){const empty=make('div','empty-state','<div class="empty-symbol" aria-hidden="true">↗</div><h3>Your first session is the baseline.</h3><p>Log your workout, then come here for the next weights, reps, and a reason for every target. No invented starting numbers.</p>');empty.append(button('Log my first workout',()=>switchView('train')));planContent.append(empty);return;}
      const count=prescription.exercises.length;
      const intro=make('div','plan-intro',`<div><span class="eyebrow">THE FULL WORKOUT</span><h3>${count} ${count===1?'movement':'movements'}.<br>One clear direction.</h3></div><span class="plan-count">${String(count).padStart(2,'0')}</span><p>Same exercise list. Smarter next steps. Review targets before training and adjust if today feels different.</p>`);
      planContent.append(intro);
      prescription.exercises.forEach((ex,i)=>{
        const card=make('article','plan-card');
        card.innerHTML=`<div class="plan-card-top"><span class="movement-number">${String(i+1).padStart(2,'0')}</span><span class="action-pill">${esc(ex.actionLabel||'Build consistency')}</span></div><h3>${esc(ex.name)}</h3><p class="plan-reason">${esc(ex.reason||'Repeat a controlled effort before adding more.')}</p>`;
        const sets=Array.isArray(ex.workingSets)?ex.workingSets:[];
        if(sets.length){const rows=make('div','prescription-table');rows.append(make('div','prescription-head','<span>MAIN SET</span><span>WEIGHT × REPS</span>'));sets.forEach((set,j)=>rows.append(make('div','prescription-row',`<span>${j+1}</span><strong>${esc(targetText(set,ex.type))}</strong>`)));card.append(rows);}
        else card.append(make('div','review-note',ex.needsReview?'Check this movement before prescribing a target.':'More clearly logged sets are needed to choose a target.'));
        if(ex.preparationSets?.length){const prep=make('div','warmup-list');ex.preparationSets.forEach((s,j)=>prep.append(make('p','',`${j+1}. ${esc(targetText(s,ex.type))}`)));card.append(details(`Warm-up · ${ex.preparationSets.length} preparation sets`,[prep],'warmup-details'));}
        else if(ex.type!=='cardio')card.append(make('p','plan-fineprint','Warm-up: no preparation sets were logged. Build up gradually before your main sets.'));
        const seconds=Number(ex.restSeconds);
        card.append(make('div','plan-footer',`<span>${Number.isFinite(seconds)&&seconds>0?`Rest ${number(seconds/60)} min`:'Rest until ready'}</span><span>${esc(ex.confidence||'Limited data')} confidence</span>`));
        if(ex.effortCue)card.append(make('p','plan-fineprint',esc(ex.effortCue)));
        if(ex.needsReview)card.append(make('p','safety-note','Review needed. Do not force a target through pain or an incomplete attempt.'));
        card.append(button(ex.needsReview?'Review exercise':'Train this exercise ↗',async()=>{
          if(hasSets(state.current)&&!state.finishedAt&&!activeGuide){tell('These targets are for your next session. Finish and save today’s workout first.');return;}
          if(await chooseExercise(ex.name))saveGuide(prescription);
        }));
        planContent.append(card);
      });
      const copy=button('Copy this full plan',async()=>{
        const text=prescription.exercises.map(ex=>`${ex.name}\n${ex.actionLabel||''}: ${ex.reason||''}\n${(ex.preparationSets||[]).map((s,i)=>`Warm-up ${i+1}: ${targetText(s,ex.type)}`).join('\n')}\n${(ex.workingSets||[]).map((s,i)=>`Set ${i+1}: ${targetText(s,ex.type)}`).join('\n')}\n${ex.effortCue||''}`).join('\n\n');
        try{await root.navigator.clipboard.writeText(text);tell('Full plan copied.');}catch{tell('Clipboard unavailable. Use Export Workout to save your data.');}
      },'shell-button shell-button--secondary');planContent.append(copy);
    }
    function renderTarget() {
      const name=currentName();
      const exercise=activeGuide?.exercises?.find(e=>key(e.name)===key(name));
      if(!exercise){target.hidden=true;return;}
      const logged=state.activeExercise?.sets||state.currentExercise?.sets||[];
      const all=[...(exercise.preparationSets||[]),...(exercise.workingSets||[])];
      const next=all[logged.length];
      target.hidden=false;target.replaceChildren();
      target.append(make('span','eyebrow','YOUR SESSION GUIDE'));
      if(next){target.append(make('h3','',esc(targetText(next,exercise.type))));target.append(make('p','',`${logged.length<(exercise.preparationSets?.length||0)?'Preparation':'Main'} set · ${logged.length+1} of ${all.length}`));
        target.append(button('Use these numbers',()=>{
          const assign=(id,value)=>{if(value===null||value===undefined||!finite(value))return;$(id).value=String(value);$(id).dispatchEvent(new Event('input',{bubbles:true}));};
          if(exercise.type==='cardio'){assign('distance',next.distance);assign('durationMin',Math.floor(Number(next.duration||0)/60));assign('durationSec',Number(next.duration||0)%60);}
          else{assign('weight',next.weight);assign('reps',next.reps);}
          if(Number(exercise.restSeconds)>0){$('restSecsInput').value=exercise.restSeconds;$('restSecsInput').dispatchEvent(new Event('change',{bubbles:true}));}
          tell('Target filled in. Log only what you actually complete.');
          $(exercise.type==='cardio'?'distance':'weight').focus();
        },'target-fill'));
      }else{target.append(make('h3','','Planned sets complete.'));target.append(make('p','','You do not need extra sets to make this session count.'));}
      target.append(button('Dismiss guide',()=>saveGuide(null),'text-button'));
    }
    function renderProgress() {
      progressContent.replaceChildren();
      const now=new Date(); const days=[];
      for(let i=27;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}
      const dates=new Set(sessions.map(s=>String(s.date||s.timestamp||'').slice(0,10)));
      const loggedDays=days.filter(d=>dates.has(d)).length;
      const activity=make('section','activity-card',`<div class="section-line"><h3>Keep showing up.</h3><span>LAST 28 DAYS</span></div><div class="activity-stat"><strong>${loggedDays}</strong><span>training days<br>Every one counts.</span></div>`);
      const grid=make('div','activity-grid');grid.setAttribute('role','img');grid.setAttribute('aria-label',`${loggedDays} days with saved workouts in the last 28 days.`);days.forEach(d=>{const dot=make('span',dates.has(d)?'trained':'');dot.title=d;dot.setAttribute('aria-hidden','true');grid.append(dot);});activity.append(grid,make('p','plan-fineprint','Rest days belong in the plan, too. More days is not automatically better.'));progressContent.append(activity);
      const goalHeader=make('div','section-line','<h3>What you’re working toward</h3>');progressContent.append(goalHeader);
      const goals=Object.values(state.goals||{}).filter(g=>g?.exerciseName&&Number(g.goalValue)>0);
      if(!goals.length){const empty=make('div','empty-state','<div class="empty-symbol" aria-hidden="true">◎</div><h3>Give your training a direction.</h3><p>Choose an exercise, then set its goal. It stays attached to that exercise every time you train.</p>');empty.append(button('Set an exercise goal',()=>{switchView('train');picker.open=true;$('exerciseSearch').focus();}));progressContent.append(empty);}
      goals.forEach(g=>{
        let best=0;
        if(api.helpers?.getGoalPerformanceFromExercise){[state.current,...sessions].filter(Boolean).forEach(p=>(p.exercises||[]).forEach(ex=>{if(key(ex?.name)===key(g.exerciseName)||ex?.isSuperset)best=Math.max(best,api.helpers.getGoalPerformanceFromExercise(ex,g.goalType,g.exerciseName));}));}
        const pct=best?Math.max(0,Math.min(100,best/Number(g.goalValue)*100)):0;
        const card=make('article','goal-card',`<div class="section-line"><span class="eyebrow">${esc(g.goalPathLabel||'PERSONAL GOAL')}</span><span>${best>=Number(g.goalValue)?'Target logged ✓':`${Math.round(pct)}%`}</span></div><h3>${esc(g.exerciseName)}</h3><div class="goal-numbers"><strong>${best?number(best):'—'} <small>${esc(g.unit||'')}</small></strong><span>toward ${number(g.goalValue)} ${esc(g.unit||'')}</span></div><div class="goal-meter" role="progressbar" aria-label="${esc(g.exerciseName)} logged goal progress" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div><p>${best?'Best qualifying logged performance. Not an independently verified max.':'No qualifying performance logged yet. Your goal is saved.'}</p>`);
        card.append(button('Train or edit goal ↗',()=>chooseExercise(g.exerciseName,true),'text-button'));progressContent.append(card);
      });
    }
    function render() {
      renderPending=false;
      try {state=api.getState();sessions=uniqueSessions(state.history);renderOverview();rebuildSources();renderPlan();renderProgress();renderTarget();}
      catch(error){console.error('Workout dashboard update failed',error);tell('A dashboard could not update. Your workout controls are still available.');}
    }
    function scheduleRender(){if(renderPending)return;renderPending=true;queueMicrotask(render);}
    sourceSelect.addEventListener('change',()=>{selectedSource=sourceSelect.value;renderPlan();});
    root.addEventListener('wt-state-updated',scheduleRender);
    root.addEventListener('storage',scheduleRender);
    // Keyboard-aware dock: keep it away from numeric inputs on iPhone.
    if(root.visualViewport){const resized=()=>{
      const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName||'');
      doc.body.classList.toggle('keyboard-open',editing&&root.innerHeight-root.visualViewport.height>150);
    };root.visualViewport.addEventListener('resize',resized);doc.addEventListener('focusin',resized);doc.addEventListener('focusout',()=>setTimeout(resized,0));}
    doc.body.classList.add('app-v2');switchView('train',{focus:false});render();
    root.WorkoutShell={switchView,refresh:scheduleRender};
  }
  if(typeof module!=='undefined')module.exports={key,uniqueSessions,targetText,hasSets,sessionDate,init};
  if(root.document)init();
})(typeof window!=='undefined'?window:globalThis);
