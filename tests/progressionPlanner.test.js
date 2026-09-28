/** @jest-environment node */
const { buildNextWorkout } = require('../progression-planner');
const helpers = require('../script');

const profile = { mode: 'custom', purpose: 'hypertrophy_compound', repMin: 8, repMax: 12, targetRir: 2, loadStep: 5 };
const set = (weight = 100, reps = 12, overrides = {}) => ({
  weight, reps, role: 'working', roleSource: 'manual', rir: 2,
  technique: 'good', pain: 'none', ...overrides,
});
const exercise = (name = 'Bench Press', sets = [set(), set()], extra = {}) => ({
  name, sets, progressionProfile: profile, ...extra,
});
const workout = (date, exercises = [exercise()], extra = {}) => ({
  date, timestamp: `${date}T12:00:00Z`, exercises, sessionContext: { status: 'complete' }, ...extra,
});
const plan = (current, history = [], extra = {}) => buildNextWorkout({ current, history, helpers, ...extra });
const target = (current, history = [], extra = {}) => plan(current, history, extra).exercises[0];

describe('current workout controls the next exercise roster', () => {
  it('keeps current order and never imports exercises from another day', () => {
    const result = plan(workout('2026-09-20', [exercise('Bench Press'), exercise('Larsen Press')]), [
      workout('2026-09-19', [exercise('Squat'), exercise('Cable Fly')]),
      workout('2026-09-18', [exercise('Bench Press'), exercise('Larsen Press'), exercise('Push-ups')]),
    ]);
    expect(result.exerciseNames).toEqual(['Bench Press', 'Larsen Press']);
    expect(result.selectionRule).toBe('current_session_only');
    expect(result.exercises).toHaveLength(2);
  });

  it('preserves every logged exercise when the previous session was cut short', () => {
    const result = plan(workout('2026-09-20', [exercise('Bench'), exercise('Row'), exercise('Curl')], {
      sessionContext: { status: 'time_limited', nextWorkoutMinutes: 10 },
    }));
    expect(result.exerciseNames).toEqual(['Bench', 'Row', 'Curl']);
    expect(result.exercises.every((entry) => entry.workingSets.length === 2)).toBe(true);
  });

  it('merges returns to the same exercise without multiplying the roster', () => {
    const result = plan(workout('2026-09-20', [exercise('Bench Press', [set()]), exercise(' bench   press ', [set()])]));
    expect(result.exerciseNames).toEqual(['Bench Press']);
    expect(result.exercises[0].workingSets).toHaveLength(2);
  });

  it('gives each superset movement its own plan and preserves its group', () => {
    const result = plan(workout('2026-09-20', [{
      name: 'Chest + Back', isSuperset: true,
      exercises: ['Press', 'Row'],
      progressionProfiles: { press: profile, row: { ...profile, loadStep: 2.5 } },
      exerciseGoals: [{ exerciseName: 'Row', goalType: 'weight', goalValue: 150 }],
      sets: [{ set: 1, exercises: [{ name: 'Press', ...set() }, { name: 'Row', ...set(60, 10) }] }],
    }]));
    expect(result.exerciseNames).toEqual(['Press', 'Row']);
    expect(result.exercises.map((entry) => entry.supersetGroup)).toEqual(['Chest + Back', 'Chest + Back']);
    expect(result.exercises[1]).toMatchObject({ loadStep: 2.5, goal: { goalValue: 150 }, workingSets: [{ weight: 60, reps: 10 }] });
  });
});

describe('ready-to-follow strength targets', () => {
  const assigned = (workingSets) => ({source:'app_next_workout',type:'strength',sourceDate:'2026-09-18',workingSets:workingSets.map(([weight,reps])=>({role:'working',weight,reps,restSeconds:180})),preparationSets:[]});
  const fiveByFiveProfile = { mode: 'custom', purpose: 'primary_strength', repMin: 5, repMax: 5, targetRir: 2, loadStep: 2.5 };
  const fiveByFive = (reps) => exercise('Bench Press', reps.map((count) => set(225, count)), { progressionProfile: fiveByFiveProfile });

  it('uses an explicitly configured straight 5×5 completion to prescribe one small load step', () => {
    const result = target(workout('2026-09-20', [fiveByFive([5, 5, 5, 5, 5])]));
    expect(result.action).toBe('ADD LOAD');
    expect(result.workingSets.map((entry) => [entry.weight, entry.reps])).toEqual(Array(5).fill(null).map(() => [227.5, 5]));
    expect(result.reason).toMatch(/five sets of five/);
  });

  it('retries the full 5×5 target after late-set misses without increasing load or deleting reps', () => {
    const result = target(workout('2026-09-20', [fiveByFive([5, 5, 5, 4, 4])]));
    expect(result.action).toBe('HOLD');
    expect(result.workingSets.map((entry) => [entry.weight, entry.reps])).toEqual(Array(5).fill(null).map(() => [225, 5]));
    expect(result.reason).toContain('23 of 25');
  });

  it('recognizes improving same-load 5×5 attempts instead of declaring a stall', () => {
    const result=target(workout('2026-09-20',[fiveByFive([5,5,5,4,4])]),[
      workout('2026-09-18',[fiveByFive([5,5,5,4,3])]),
      workout('2026-09-16',[fiveByFive([5,5,5,3,3])]),
    ]);
    expect(result.action).toBe('HOLD');
    expect(result.reason).toContain('up from 22 last time');
    expect(result.workingSets.every(s=>s.reps===5&&s.weight===225)).toBe(true);
  });

  it('uses a labelled reset only after three non-improving same-load 5×5 attempts', () => {
    const repeated=fiveByFive([5,5,5,4,3]);
    const result=target(workout('2026-09-20',[repeated]),[
      workout('2026-09-18',[repeated]),workout('2026-09-16',[repeated]),
    ]);
    expect(result.action).toBe('REDUCE LOAD');
    expect(result.workingSets).toHaveLength(5);
    expect(result.workingSets.every(s=>s.weight===212.5&&s.reps===5)).toBe(true);
    expect(result.reason).toMatch(/about 5%.*cannot prove why/);
    expect(result.evidence.heuristic.join(' ')).toMatch(/coaching convention/);
  });

  it('does not infer a 5×5 stall across an intervening different-load attempt', () => {
    const repeated=fiveByFive([5,5,5,4,3]);
    const different=exercise('Bench Press',Array(5).fill(null).map(()=>set(220,5)),{progressionProfile:fiveByFiveProfile});
    const result=target(workout('2026-09-20',[repeated]),[
      workout('2026-09-18',[different]),workout('2026-09-16',[repeated]),workout('2026-09-14',[repeated]),
    ]);
    expect(result.action).toBe('HOLD');
    expect(result.workingSets.every(s=>s.weight===225)).toBe(true);
  });

  it('repairs known short rest before resetting a repeated 5×5 load', () => {
    const short=fiveByFive([5,5,5,4,3]);
    short.sets[1].restPlanned=180;short.sets[1].restActual=40;
    const repeated=fiveByFive([5,5,5,4,3]);
    const result=target(workout('2026-09-20',[short]),[
      workout('2026-09-18',[repeated]),workout('2026-09-16',[repeated]),
    ]);
    expect(result.action).toBe('INCREASE REST');
    expect(result.workingSets.every(s=>s.weight===225&&s.reps===5&&s.restSeconds>=180)).toBe(true);
  });

  it('does not treat an effort-limit 5×5 or an unconfigured five-set pattern as earned load progression', () => {
    const hard = fiveByFive([5, 5, 5, 5, 5]);
    hard.sets[4].rir = 0;
    expect(target(workout('2026-09-20', [hard])).action).toBe('HOLD');
    const generic = exercise('Bench Press', Array(5).fill(null).map(() => set(225, 5)));
    expect(target(workout('2026-09-20', [generic])).action).not.toBe('ADD LOAD');
  });

  it('retains every assigned 5×5 set when a time-limited session logs only three', () => {
    const ex=fiveByFive([5,5,5]);ex.prescription=assigned(Array(5).fill([225,5]));
    const result=target(workout('2026-09-20',[ex],{sessionContext:{status:'time_limited'}}));
    expect(result.action).toBe('HOLD');
    expect(result.workingSets).toHaveLength(5);
    expect(result.workingSets.every(s=>s.weight===225&&s.reps===5)).toBe(true);
    expect(result.reason).toMatch(/omitted sets are not failed/i);
    expect(result.progressionTrigger).toContain('Complete the assigned sets');
  });

  it('does not advance weight when the assigned rep-range target was not met', () => {
    const ex=exercise('Bench',[set(100,12),set(100,11),set(100,9)],{prescription:assigned([[100,12],[100,12],[100,12]])});
    const result=target(workout('2026-09-20',[ex]),[workout('2026-09-18',[exercise('Bench',[set(100,12),set(100,12),set(100,12)])])]);
    expect(result.action).toBe('HOLD');
    expect(result.workingSets.map(s=>s.reps)).toEqual([12,12,12]);
    expect(result.plannedComparison).toContain('3 of 3');
  });

  it('does not call a changed load completed against a saved assignment', () => {
    const ex=exercise('Bench',[set(105,12),set(105,12)],{prescription:assigned([[100,12],[100,12]])});
    const result=target(workout('2026-09-20',[ex]),[workout('2026-09-18',[exercise('Bench',[set(100,12),set(100,12)])])]);
    expect(result.action).toBe('HOLD');
    expect(result.reason).toMatch(/differed from the assigned plan/);
    expect(result.workingSets.every(s=>s.weight===100)).toBe(true);
  });

  it('uses the shared engine and increases load by only the equipment increment', () => {
    const current = workout('2026-09-20');
    const previous = workout('2026-09-18');
    const decision = target(current, [previous]);
    expect(decision.action).toBe('ADD LOAD');
    expect(decision.workingSets).toEqual([
      { set: 1, role: 'working', weight: 105, reps: 8, restSeconds: 120 },
      { set: 2, role: 'working', weight: 105, reps: 8, restSeconds: 120 },
    ]);
    expect(decision.targetSummary).toBe('2 × 8 at 105 lb');
    expect(decision.confidence).toBe('HIGH');
    expect(decision.effortCue).toContain('2 clean reps');
  });

  it('changes only one total rep while holding load and set count', () => {
    const result = target(workout('2026-09-20', [exercise('Bench', [set(100, 10), set(100, 9), set(100, 9)])]), [
      workout('2026-09-18', [exercise('Bench', [set(100, 10), set(100, 9), set(100, 8)])]),
    ]);
    expect(result.action).toBe('ADD REPS');
    expect(result.workingSets.map((entry) => entry.reps)).toEqual([10, 9, 10]);
    expect(result.workingSets.every((entry) => entry.weight === 100)).toBe(true);
  });

  it('preserves warmups separately and never increases back-offs alongside top work', () => {
    const sets = [set(45, 10, { role: 'warmup' }), set(75, 5, { role: 'ramp' }), set(), set(80, 12, { role: 'back_off' })];
    const result = target(workout('2026-09-20', [exercise('Bench', sets)]), [workout('2026-09-18', [exercise('Bench', sets)])]);
    expect(result.action).toBe('ADD LOAD');
    expect(result.preparationSets.map((entry) => entry.weight)).toEqual([45, 75]);
    expect(result.workingSets.map((entry) => entry.weight)).toEqual([105, 80]);
    expect(result.workingSets).toHaveLength(2);
    expect(result.preparationSets[0].restSeconds).toBe(60);
  });

  it('progresses a labelled heavy top set independently of completed back-offs', () => {
    const strength = { mode: 'custom', purpose: 'primary_strength', repMin: 3, repMax: 5, targetRir: 2, loadStep: 5 };
    const sets = [set(285, 1, { role: 'top_set' }), ...Array(4).fill(null).map(() => set(255, 4, { role: 'back_off' }))];
    const entry = exercise('Bench Press', sets, { progressionProfile: strength });
    const result = target(workout('2026-09-20', [entry]), [workout('2026-09-18', [entry])]);
    expect(result.action).toBe('ADD LOAD');
    expect(result.workingSets.map(({ role, weight, reps }) => [role, weight, reps])).toEqual([
      ['top_set', 290, 1], ...Array(4).fill(['back_off', 255, 4]),
    ]);
    expect(result.workingSets[0].restSeconds).toBe(240);
    expect(result.workingSets[1].restSeconds).toBe(180);
    expect(result.progressionTrigger).toMatch(/top set and all back-offs/i);
  });

  it('holds a heavy top set when effort is unknown or the available jump is too large', () => {
    const strength = { mode: 'custom', purpose: 'primary_strength', repMin: 3, repMax: 5, targetRir: 2, loadStep: 5 };
    const sets = [set(100, 1, { role: 'top_set' }), set(80, 4, { role: 'back_off' })];
    const entry = exercise('Squat', sets, { progressionProfile: strength });
    const tooLarge = target(workout('2026-09-20', [entry]), [workout('2026-09-18', [entry])]);
    expect(tooLarge.action).toBe('HOLD');
    expect(tooLarge.workingSets.map((s) => s.weight)).toEqual([100, 80]);
    expect(tooLarge.reason).toMatch(/equipment step is large/i);
    const unknown = exercise('Squat', [set(285, 1, { role: 'top_set', rir: null }), set(255, 4, { role: 'back_off' })], { progressionProfile: strength });
    expect(target(workout('2026-09-20', [unknown]), [workout('2026-09-18', [unknown])]).action).toBe('HOLD');
  });

  it('does not advance top work when a saved top-and-back-off assignment was missed', () => {
    const strength = { mode: 'custom', purpose: 'primary_strength', repMin: 3, repMax: 5, targetRir: 2, loadStep: 5 };
    const sets = [set(285, 1, { role: 'top_set' }), set(255, 4, { role: 'back_off' })];
    const saved = { source: 'app_next_workout', type: 'strength', workingSets: [
      { role: 'top_set', weight: 285, reps: 1 }, { role: 'back_off', weight: 255, reps: 5 },
    ] };
    const current = exercise('Bench Press', sets, { progressionProfile: strength, prescription: saved });
    const prior = exercise('Bench Press', sets, { progressionProfile: strength });
    const result = target(workout('2026-09-20', [current]), [workout('2026-09-18', [prior])]);
    expect(result.action).toBe('HOLD');
    expect(result.workingSets.map((s) => s.reps)).toEqual([1, 5]);
  });

  it('holds large equipment jumps and never substitutes the long-term goal for next load', () => {
    const largeStep = { ...profile, loadStep: 20, repMin: 1 };
    const ex = exercise('Press', [set()], { progressionProfile: largeStep });
    const result = target(workout('2026-09-20', [ex]), [workout('2026-09-18', [ex])], {
      goals: { press: { goalType: 'weight', goalValue: 300 } },
    });
    expect(result.action).toBe('HOLD');
    expect(result.workingSets[0].weight).toBe(100);
    expect(result.goal.goalValue).toBe(300);
    expect(result.reason).toMatch(/jump is too large/);
  });

  it('does not infer progression from a single uncertain automatic set', () => {
    const ex = exercise('Press', [{ weight: 100, reps: 9 }]);
    const result = target(workout('2026-09-20', [ex]), [workout('2026-09-18', [ex])]);
    expect(result.action).toBe('HOLD');
    expect(result.workingSets[0]).toMatchObject({ weight: 100, reps: 9 });
    expect(result.confidence).toBe('LOW');
  });

  it('preserves bodyweight as zero load without adding external weight from zero', () => {
    const ex = exercise('Push-ups', [set(0, 12), set(0, 12)]);
    const result = target(workout('2026-09-20', [ex]), [workout('2026-09-18', [ex])]);
    expect(result.workingSets.every((entry) => entry.weight === 0)).toBe(true);
    expect(result.targetSummary).toContain('bodyweight');
    expect(result.action).toBe('HOLD');
  });

  it('does not turn a warmup-only workout into hard work', () => {
    const result = target(workout('2026-09-20', [exercise('Bench', [set(45, 10, { role: 'warmup' })])]));
    expect(result.action).toBe('REVIEW DATA');
    expect(result.workingSets).toEqual([]);
    expect(result.preparationSets).toHaveLength(1);
    expect(result.needsReview).toBe(true);
  });

  it('keeps a pain-affected movement in the roster without prescribing painful sets', () => {
    const result = target(workout('2026-09-20', [exercise('Bench', [set(100, 5, { pain: 'stopped' })])]));
    expect(result.name).toBe('Bench');
    expect(result.action).toBe('STOP AND SEEK APPROPRIATE GUIDANCE');
    expect(result.workingSets).toEqual([]);
    expect(result.needsReview).toBe(true);
  });

  it('treats discomfort and unidentified session pain as reasons to review', () => {
    expect(target(workout('2026-09-20', [exercise('Bench', [set(100, 5, { pain: 'discomfort' })])])).needsReview).toBe(true);
    expect(target(workout('2026-09-20', [exercise()], { sessionContext: { status: 'pain_limited' } })).workingSets).toEqual([]);
  });

  it('does not repeat failed attempts or increase work after low reserve or form issues', () => {
    const failed = set(120, 0, { completed: false, role: 'failed_attempt' });
    const previous = workout('2026-09-18');
    const failure = target(workout('2026-09-20', [exercise('Bench Press', [set(), failed])]), [previous]);
    expect(failure.action).toBe('HOLD');
    expect(failure.workingSets).toHaveLength(1);
    expect(failure.workingSets[0].weight).toBe(100);
    for (const overrides of [{ rir: 0 }, { technique: 'minor' }]) {
      expect(target(workout('2026-09-20', [exercise('Bench Press', [set(100, 12, overrides)])]), [previous]).action).toBe('HOLD');
    }
  });

  it('reduces successful work after poor form without prescribing the poor set', () => {
    const result = target(workout('2026-09-20', [exercise('Bench', [set(), set(120, 3, { technique: 'poor' })])]));
    expect(result.action).toBe('REDUCE LOAD');
    expect(result.workingSets).toHaveLength(1);
    expect(result.workingSets[0]).toMatchObject({ weight: 95, reps: 12 });
  });

  it('uses full rest instead of escalating targets after fatigue with short rest', () => {
    const sets = [set(100, 12, { restPlanned: 180, restActual: 40 }), set(100, 10, { restPlanned: 180, restActual: 50 }), set(100, 7)];
    const result = target(workout('2026-09-20', [exercise('Bench', sets)]));
    expect(result.action).toBe('INCREASE REST');
    expect(result.workingSets.map((entry) => entry.reps)).toEqual([12, 10, 7]);
    expect(result.workingSets.every((entry) => entry.restSeconds >= 180)).toBe(true);
  });

  it('reports the recorded goal result without treating an estimate as achievement', () => {
    const result = target(workout('2026-09-20', [exercise('Bench', [set(100, 12)])]), [], {
      goals: { bench: { goalType: 'weight', goalValue: 120 } },
    });
    expect(result.goalProgress).toMatchObject({ current: 100, target: 120, percentage: 83.3, reached: false });
    const reached = target(workout('2026-09-20', [exercise('Bench', [set(120, 1)])]), [], {
      goals: { bench: { goalType: 'weight', goalValue: 120 } },
    });
    expect(reached.goalProgress.reached).toBe(true);
  });
});

describe('history identity and deterministic output', () => {
  it('excludes the active saved record and future sessions from readiness evidence', () => {
    const current = workout('2026-09-20', [exercise()], { workoutId: 'current' });
    const result = target(current, [current, workout('2026-09-21', [exercise()])]);
    expect(result.action).toBe('TEST BASELINE');
  });

  it('keeps a distinct previous same-day workout and ignores duplicated session IDs', () => {
    const current = workout('2026-09-20', [exercise()], { workoutId: 'evening', timestamp: '2026-09-20T18:00:00Z' });
    const earlier = workout('2026-09-20', [exercise()], { workoutId: 'morning', timestamp: '2026-09-20T08:00:00Z' });
    const result = target(current, [earlier, earlier]);
    expect(result.action).toBe('ADD LOAD');
  });

  it('produces the same result without mutating frozen current or history data', () => {
    function freeze(value) {
      if (!value || typeof value !== 'object') return value;
      Object.values(value).forEach(freeze);
      return Object.freeze(value);
    }
    const current = freeze(workout('2026-09-20'));
    const history = freeze([workout('2026-09-18')]);
    expect(plan(current, history)).toEqual(plan(current, history));
    expect(current.exercises[0].sets[0].weight).toBe(100);
  });

  it('does not emit NaN, Infinity, fractional reps, or fabricated values from corrupt sets', () => {
    const result = plan(workout('2026-09-20', [exercise('Bench', [
      null, { weight: 'NaN', reps: 5 }, { weight: 100, reps: 2.5 },
      { weight: Infinity, reps: 5 }, { weight: -10, reps: 5 }, set(100, 8),
    ])]));
    expect(result.exercises[0].workingSets).toHaveLength(1);
    expect(result.exercises[0].workingSets[0]).toMatchObject({ weight: 100, reps: 8 });
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('handles empty or incomplete payloads and missing helpers without unsafe increases', () => {
    expect(buildNextWorkout().exercises).toEqual([]);
    expect(buildNextWorkout({ current: { exercises: [null, {}, { name: 'Bench' }] } }).exercises).toEqual([]);
    const result = buildNextWorkout({ current: workout('2026-09-20'), history: [workout('2026-09-18')] });
    expect(result.exercises[0].action).toBe('TEST BASELINE');
    expect(result.exercises[0].workingSets[0].weight).toBe(100);
  });
});

describe('bounded cardio and timed-exercise progression', () => {
  const cardio = (sets = [{ duration: 600, distance: 1 }], extra = {}) => exercise('Walk', sets.map((entry) => ({ distance: 0, ...entry })), { isCardio: true, ...extra });
  const goals = { walk: { goalType: 'duration', goalValue: 20 } };

  it('adds a bounded amount of time after comparable sessions without imposing faster pace', () => {
    const result = target(workout('2026-09-20', [cardio()]), [workout('2026-09-18', [cardio()])], { goals });
    expect(result.action).toBe('ADD TIME');
    expect(result.workingSets[0]).toMatchObject({ duration: 630, distance: null });
  });

  it('treats duration goals as per-set minutes and caps the step at the target', () => {
    const ex = cardio([{ duration: 600 }, { duration: 590 }]);
    const result = target(workout('2026-09-20', [ex]), [workout('2026-09-18', [ex])], {
      goals: { walk: { goalType: 'duration', goalValue: 10.5 } },
    });
    expect(result.action).toBe('ADD TIME');
    expect(result.workingSets.map((entry) => entry.duration)).toEqual([630, 590]);
    expect(result.goalProgress.current).toBe(10);
  });

  it('adds distance alone, and does not claim a duration estimate for it', () => {
    const result = target(workout('2026-09-20', [cardio()]), [workout('2026-09-18', [cardio()])], {
      goals: { walk: { goalType: 'distance', goalValue: 3 } },
    });
    expect(result.action).toBe('ADD DISTANCE');
    expect(result.workingSets[0]).toMatchObject({ duration: null, distance: 1.05 });
    expect(result.estimatedMinutes).toBeNull();
  });

  it('retains an assigned distance-only target when actual distance falls short', () => {
    const ex=cardio([{duration:600,distance:1}],{prescription:{source:'app_next_workout',type:'cardio',workingSets:[{role:'cardio',distance:1.05}],preparationSets:[]}});
    const result=target(workout('2026-09-20',[ex]),[workout('2026-09-18',[cardio()])],{goals:{walk:{goalType:'distance',goalValue:3}}});
    expect(result.action).toBe('HOLD');
    expect(result.workingSets[0]).toMatchObject({distance:1.05,duration:null});
    expect(result.progressionTrigger).toContain('prescribed time or distance');
  });

  it('holds an incomplete workout, a large recent increase, or an already reached target', () => {
    const previous = workout('2026-09-18', [cardio()]);
    const limited = target(workout('2026-09-20', [cardio()], { sessionContext: { status: 'recovery_limited' } }), [previous], { goals });
    expect(limited.action).toBe('HOLD');
    const jump = target(workout('2026-09-20', [cardio([{ duration: 900 }])]), [previous], { goals });
    expect(jump.action).toBe('HOLD');
    const reached = target(workout('2026-09-20', [cardio()]), [previous], { goals: { walk: { goalType: 'duration', goalValue: 10 } } });
    expect(reached.action).toBe('HOLD');
    expect(reached.goalProgress.reached).toBe(true);
  });

  it('does not progress cardio after pain or malformed time input', () => {
    const result = target(workout('2026-09-20', [cardio([{ duration: 600, pain: 'stopped' }])]));
    expect(result.workingSets).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(plan(workout('2026-09-20', [cardio([{ duration: NaN }, { duration: 2.5 }])])).exercises).toEqual([]);
  });
});
