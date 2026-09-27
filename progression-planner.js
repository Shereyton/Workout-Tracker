/*
 * A pure presentation layer for the existing progression engine. The current
 * workout owns exercise selection; history can only inform those exercises.
 *
 * Evidence informs the direction, not a guaranteed personal rate of progress:
 * https://acsm.org/resistance-training-guidelines-update-2026/
 * https://www.cdc.gov/healthy-weight-growth/physical-activity/getting-started.html
 * The one-rep target, 10% equipment-jump ceiling, and 5% cardio step below are
 * conservative product heuristics, not thresholds proven optimal for everyone.
 */
(function exposeWorkoutPlanner(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorkoutPlanner = api;
}(typeof window !== 'undefined' ? window : null, function createWorkoutPlanner() {
  'use strict';

  const WORK_ROLES = new Set(['working', 'top_set', 'back_off']);
  const PREP_ROLES = new Set(['warmup', 'ramp', 'technique']);
  const ACTION_LABELS = Object.freeze({
    'ADD LOAD': 'A little more weight',
    'ADD REPS': 'One more clean rep',
    'ADD TIME': 'A little longer',
    'ADD DISTANCE': 'A little farther',
    HOLD: 'Make it repeatable',
    'TEST BASELINE': 'Build your baseline',
    'REDUCE LOAD': 'Lighter, cleaner reps',
    'INCREASE REST': 'Recover between sets',
    'STOP AND SEEK APPROPRIATE GUIDANCE': 'Check pain first',
    'REVIEW DATA': 'Check your last sets',
  });
  const SOURCES = Object.freeze([
    { title: 'ACSM resistance training guidance (2026)', url: 'https://acsm.org/resistance-training-guidelines-update-2026/' },
    { title: 'CDC: gradual activity progression', url: 'https://www.cdc.gov/healthy-weight-growth/physical-activity/getting-started.html' },
  ]);

  function key(value) {
    return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  }

  function number(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= min && result <= max ? result : null;
  }

  function round(value, places = 2) {
    return Number(value.toFixed(places));
  }

  function cloneSet(set) {
    if (!set || typeof set !== 'object') return {};
    return { ...set, ...(Array.isArray(set.exercises) ? { exercises: set.exercises.map(cloneSet) } : {}) };
  }

  function cleanStrength(set) {
    const weight = number(set.weight, 0, 9999);
    const reps = number(set.reps, 1, 999);
    if (weight === null || reps === null || !Number.isInteger(reps)) return null;
    if (set.completed === false || set.outcome === 'failed' || set.role === 'failed_attempt') return null;
    return { ...set, weight, reps };
  }

  function cleanCardio(set) {
    const duration = number(set.duration, 1, 604800);
    const distance = number(set.distance, 0, 100000);
    if (duration === null || !Number.isInteger(duration) || set.completed === false || set.outcome === 'failed') return null;
    return { ...set, duration, distance };
  }

  function validRawSet(set, cardio) {
    if (cardio) return !!cleanCardio(set);
    const reps = number(set.reps, 0, 999);
    return number(set.weight, 0, 9999) !== null && reps !== null && Number.isInteger(reps);
  }

  function flattenExercises(payload, helpers = {}) {
    const entries = new Map();
    function add(name, set, parent, group = null) {
      const exerciseKey = key(name);
      if (!exerciseKey) return;
      const identity = `${parent.isCardio ? 'cardio' : 'strength'}:${exerciseKey}`;
      if (!entries.has(identity)) {
        entries.set(identity, {
          name: String(name).trim(),
          isCardio: !!parent.isCardio,
          category: parent.category || payload?.dayType || null,
          progressionProfile: parent.progressionProfiles?.[exerciseKey] || parent.progressionProfile,
          prescription: group ? null : parent.prescription,
          goal: parent.goal || parent.exerciseGoals?.find((goal) => key(goal?.exerciseName) === exerciseKey) || null,
          supersetGroup: group,
          sets: [],
        });
      }
      entries.get(identity).sets.push(cloneSet(set));
    }
    for (const raw of Array.isArray(payload?.exercises) ? payload.exercises : []) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sets)) continue;
      const copied = { ...raw, sets: raw.sets.filter(Boolean).map(cloneSet).filter((set) => {
        if (!raw.isSuperset) return validRawSet(set, raw.isCardio);
        set.exercises = (set.exercises || []).filter((inner) => validRawSet(inner, false));
        return set.exercises.length > 0;
      }) };
      // The shared classifier is the sole authority for automatic strength roles.
      const exercise = typeof helpers.classifyExerciseSets === 'function'
        ? helpers.classifyExerciseSets(copied) : copied;
      for (const set of exercise.sets || []) {
        if (exercise.isSuperset) {
          for (const inner of Array.isArray(set.exercises) ? set.exercises : []) {
            if (!inner?.name) continue;
            add(inner.name, { ...set, ...inner, exercises: undefined }, exercise, exercise.name);
          }
        } else {
          add(exercise.name, set, exercise);
        }
      }
    }
    return [...entries.values()];
  }

  function stamp(payload) {
    const value = payload?.session?.sessionStart || payload?.startedAt || payload?.timestamp || payload?.date;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function identity(payload) {
    return payload?.workoutId || payload?.id || payload?.completedId || payload?.sessionId || '';
  }

  function fingerprint(payload) {
    return JSON.stringify([payload?.date, (payload?.exercises || []).filter(Boolean).map((exercise) => [
      key(exercise.name), exercise.isCardio, exercise.isSuperset,
      (exercise.sets || []).filter(Boolean).map((set) => [
        set.weight, set.reps, set.duration, set.distance, set.role, set.completed,
        (set.exercises || []).map((inner) => [key(inner?.name), inner?.weight, inner?.reps]),
      ]),
    ])]);
  }

  function priorWorkouts(current, history) {
    const currentId = identity(current);
    const currentTime = stamp(current);
    const currentFingerprint = fingerprint(current);
    const seenIds = new Set();
    const seenFallback = new Set();
    return (Array.isArray(history) ? history : [])
      .filter((item) => item && typeof item === 'object' && Array.isArray(item.exercises))
      .slice()
      .sort((a, b) => stamp(b) - stamp(a))
      .filter((item) => {
        const id = identity(item);
        const time = stamp(item);
        if (currentId && id === currentId) return false;
        if (currentTime && time > currentTime) return false;
        const content = fingerprint(item);
        // Separate IDs preserve legitimate identical workouts on the same day.
        // Unidentified copies of the active workout cannot count as readiness.
        if ((!id || !currentId) && content === currentFingerprint) return false;
        if (id) {
          if (seenIds.has(id)) return false;
          seenIds.add(id);
        } else {
          if (seenFallback.has(content)) return false;
          seenFallback.add(content);
        }
        return true;
      });
  }

  function profileFor(exercise, helpers) {
    const profile = typeof helpers.normalizeExerciseProfile === 'function'
      ? helpers.normalizeExerciseProfile(exercise.progressionProfile)
      : exercise.progressionProfile || {};
    const repMin = number(profile.repMin, 1, 100) ?? 6;
    return {
      ...profile,
      repMin: Math.ceil(repMin),
      repMax: Math.floor(number(profile.repMax, repMin, 100) ?? Math.max(repMin, 12)),
      targetRir: number(profile.targetRir, 0, 10) ?? 2,
      loadStep: number(profile.loadStep, 0.25, 100) ?? 5,
    };
  }

  function goalFor(exercise, goals) {
    const goal = Object.entries(goals || {}).find(([name]) => key(name) === key(exercise.name))?.[1]
      || exercise.goal;
    const value = number(goal?.goalValue ?? goal?.goalWeight, 0.01, 1000000);
    if (!goal || value === null) return null;
    return {
      exerciseName: exercise.name,
      goalType: goal.goalType || 'weight',
      goalValue: value,
      goalPath: goal.goalPath || null,
      unit: goal.unit || ({ weight: 'lbs', reps: 'reps', duration: 'minutes', distance: 'miles' }[goal.goalType] || 'lbs'),
    };
  }

  function restFor(set, profile, preparation = false) {
    const recorded = number(set?.restPlanned, 15, 900);
    if (recorded !== null) return Math.round(recorded);
    if (preparation) return 60;
    return /strength|power/.test(profile.purpose || '') ? 180 : 120;
  }

  function strengthTarget(set, index, profile, preparation = false) {
    return {
      set: index + 1,
      role: set.role,
      weight: set.weight,
      reps: set.reps,
      restSeconds: restFor(set, profile, preparation),
    };
  }

  function summaryForSets(sets, type) {
    if (!sets.length) return 'Review needed before the next attempt';
    if (type === 'cardio') {
      return sets.map((set) => set.distance != null && set.duration == null
        ? `${set.distance} mi`
        : `${Math.floor(set.duration / 60)}:${String(set.duration % 60).padStart(2, '0')}${set.distance ? ` · ${set.distance} mi` : ''}`).join(' / ');
    }
    const sameWeight = sets.every((set) => set.weight === sets[0].weight);
    const sameReps = sets.every((set) => set.reps === sets[0].reps);
    if (sameWeight && sameReps) return `${sets.length} × ${sets[0].reps} at ${sets[0].weight === 0 ? 'bodyweight' : `${sets[0].weight} lb`}`;
    if (sameWeight) return `${sets.map((set) => set.reps).join(' / ')} reps at ${sets[0].weight === 0 ? 'bodyweight' : `${sets[0].weight} lb`}`;
    return sets.map((set) => `${set.weight} lb × ${set.reps}`).join(' · ');
  }

  function basePlan(exercise, goals) {
    return {
      name: exercise.name,
      type: exercise.isCardio ? 'cardio' : 'strength',
      category: exercise.category,
      supersetGroup: exercise.supersetGroup,
      goal: goalFor(exercise, goals),
      action: 'TEST BASELINE',
      confidence: 'LOW',
      preparationSets: [],
      workingSets: [],
      needsReview: false,
      evidence: { observed: [], missing: [], heuristic: [] },
    };
  }

  function finalize(plan) {
    plan.actionLabel = ACTION_LABELS[plan.action] || ACTION_LABELS.HOLD;
    plan.targetSummary = summaryForSets(plan.workingSets, plan.type);
    const allSets = [...plan.preparationSets, ...plan.workingSets];
    plan.restSeconds = plan.workingSets[0]?.restSeconds ?? null;
    plan.estimatedMinutes = allSets.length ? Math.ceil(allSets.reduce((seconds, set, index) => (
      seconds + (set.duration || (plan.type === 'cardio' ? 0 : Math.max(20, (set.reps || 0) * 3)))
      + (index < allSets.length - 1 ? (set.restSeconds || 0) : 0)
    ), 0) / 60) : null;
    // Distance-only prescriptions have no honest duration estimate.
    if (plan.type === 'cardio' && plan.workingSets.some((set) => set.duration == null)) plan.estimatedMinutes = null;
    return plan;
  }

  function attachGoalProgress(plan, recordedSets) {
    if (!plan.goal) return;
    const values = recordedSets.filter((set) => !['stopped', 'discomfort'].includes(set.pain) && set.technique !== 'poor').map((set) => {
      if (plan.goal.goalType === 'weight') return number(set.weight);
      if (plan.goal.goalType === 'reps') return number(set.reps);
      if (plan.goal.goalType === 'duration') return set.duration / 60;
      if (plan.goal.goalType === 'distance') return number(set.distance);
      return null;
    }).filter((value) => value !== null && Number.isFinite(value));
    const best = values.length ? Math.max(...values) : null;
    plan.goalProgress = {
      current: best === null ? null : round(best),
      target: plan.goal.goalValue,
      percentage: best === null ? null : round(Math.min(100, best / plan.goal.goalValue * 100), 1),
      reached: best !== null && best >= plan.goal.goalValue,
      label: best !== null && best >= plan.goal.goalValue ? 'Target recorded — make it repeatable' : 'Your next step toward this goal',
    };
  }

  function painBlock(plan, exercise, context) {
    const setPain = exercise.sets.some((set) => ['stopped', 'discomfort'].includes(set.pain));
    if (!setPain && context?.status !== 'pain_limited') return false;
    plan.action = 'STOP AND SEEK APPROPRIATE GUIDANCE';
    plan.confidence = 'HIGH';
    plan.needsReview = true;
    plan.preparationSets = [];
    plan.workingSets = [];
    plan.reason = setPain
      ? 'Pain or discomfort was recorded. Resolve that before repeating this movement; do not push through it.'
      : 'This workout was marked pain-limited. Identify the affected movement before following a new target.';
    plan.effortCue = 'Use a previously established pain-free alternative or get appropriate guidance.';
    return true;
  }

  // An explicitly configured, five-straight-set 5x5 is a program convention,
  // not a claim that 5x5 is physiologically optimal. Never infer it from a
  // general strength goal or from ramped/top-set and back-off work.
  function straightFiveByFive(profile, work) {
    return profile.mode === 'custom' && /strength|power/.test(profile.purpose || '')
      && profile.repMin === 5 && profile.repMax === 5
      && work.length === 5 && work.every((set) => set.role === 'working'
        && set.weight > 0 && set.weight === work[0].weight
        && set.reps >= 1 && set.reps <= 5);
  }

  function knownShortRest(exercise) {
    return exercise.sets.some(set => {
      const planned = number(set.restPlanned, 1, 900), actual = number(set.restActual, 0, 900);
      return planned !== null && actual !== null && actual < planned * 0.85;
    });
  }

  function priorFiveByFiveTotals(previousExercises, helpers, load) {
    return previousExercises.slice(0, 2).map(({ exercise, context }) => {
      if (context?.status && context.status !== 'complete') return null;
      const priorProfile = profileFor(exercise, helpers);
      const priorWork = exercise.sets.map(cleanStrength).filter(set => set && WORK_ROLES.has(set.role));
      if (!straightFiveByFive(priorProfile, priorWork) || priorWork[0].weight !== load
        || knownShortRest(exercise)
        || exercise.sets.some(set => set.completed === false || set.outcome === 'failed'
          || ['stopped', 'discomfort'].includes(set.pain)
          || ['minor', 'poor'].includes(set.technique))) return null;
      return priorWork.reduce((total, set) => total + set.reps, 0);
    }).filter(total => total !== null);
  }

  function assignedStrengthTargets(exercise, profile) {
    const saved = exercise.prescription;
    if (saved?.source !== 'app_next_workout' || saved.type !== 'strength'
      || !Array.isArray(saved.workingSets) || !saved.workingSets.length || saved.workingSets.length > 40) return null;
    const targets = saved.workingSets.map((set, index) => {
      const weight = number(set?.weight, 0, 9999), reps = number(set?.reps, 1, 999);
      if (weight === null || reps === null || !Number.isInteger(reps)) return null;
      return { set: index + 1, role: WORK_ROLES.has(set.role) ? set.role : 'working',
        weight, reps, restSeconds: number(set.restSeconds, 0, 900) ?? restFor(null, profile) };
    });
    return targets.every(Boolean) ? targets : null;
  }

  function planStrength(exercise, previousExercises, current, helpers, goals) {
    const plan = basePlan(exercise, goals);
    const profile = profileFor(exercise, helpers);
    const valid = exercise.sets.map(cleanStrength).filter(Boolean);
    const work = valid.filter((set) => WORK_ROLES.has(set.role) && set.pain !== 'stopped' && set.technique !== 'poor');
    const assigned = assignedStrengthTargets(exercise, profile);
    attachGoalProgress(plan, work);
    plan.preparationSets = valid.filter((set) => PREP_ROLES.has(set.role) && set.technique !== 'poor')
      .map((set, index) => strengthTarget(set, index, profile, true));
    plan.workingSets = work.map((set, index) => strengthTarget(set, index, profile));
    plan.effortCue = profile.targetRir > 0
      ? `Finish each set feeling you could still do about ${profile.targetRir} clean rep${profile.targetRir === 1 ? '' : 's'}.`
      : 'Keep every rep controlled. Stop when your technique breaks down.';
    plan.repRange = [profile.repMin, profile.repMax];
    plan.loadStep = profile.loadStep;
    plan.warmupCue = plan.preparationSets.length
      ? 'Repeat these preparation sets before your working sets.'
      : 'Start with easy practice reps and build up gradually; warm-up loads were not recorded.';
    if (painBlock(plan, exercise, current.sessionContext)) return finalize(plan);
    if (!work.length) {
      if (assigned && current.sessionContext?.status === 'time_limited'
        && !exercise.sets.some((set) => set.completed === false || set.outcome === 'failed')) {
        plan.action = 'HOLD'; plan.confidence = 'LOW'; plan.workingSets = assigned;
        plan.reason = 'No planned main sets were reached before time ran out. Repeat the assigned targets; omitted sets are not failed lifts.';
        plan.progressionTrigger = 'Complete the assigned main sets with controlled technique before increasing demand.';
        plan.plannedComparison = `0 of ${assigned.length} assigned main sets logged.`;
        return finalize(plan);
      }
      plan.action = 'REVIEW DATA';
      plan.confidence = 'INSUFFICIENT';
      plan.needsReview = true;
      plan.reason = 'No successful working sets were identified. Check the set labels or log a comfortable working set first.';
      plan.evidence.missing.push('successful classified working sets');
      return finalize(plan);
    }

    let support = null;
    if (typeof helpers.computeSessionStats === 'function' && typeof helpers.buildStrengthDecisionSupport === 'function') {
      const toStats = (item, context) => helpers.computeSessionStats({
        exercises: [item], sessionContext: context,
      }).exercises?.find((entry) => key(entry.name) === key(exercise.name));
      const stats = toStats(exercise, current.sessionContext);
      const prior = previousExercises.map((entry) => toStats(entry.exercise, entry.context)).filter(Boolean);
      support = helpers.buildStrengthDecisionSupport(stats, prior[0] || null, profile.loadStep, prior.slice(1));
    }
    plan.action = support?.decision || 'TEST BASELINE';
    plan.confidence = ['HIGH', 'MODERATE', 'LOW'].includes(support?.confidence) ? support.confidence : 'LOW';
    plan.evidence = support?.evidenceTrace || plan.evidence;
    plan.evidence = {
      ...plan.evidence,
      observed: [...(plan.evidence.observed || [])],
      missing: [...(plan.evidence.missing || [])],
      heuristic: [...(plan.evidence.heuristic || [])],
    };
    plan.engineReason = support?.text || null;
    const failed = exercise.sets.some((set) => set.completed === false || set.outcome === 'failed' || set.role === 'failed_attempt');
    const poorForm = exercise.sets.some((set) => set.technique === 'poor');
    const minorForm = exercise.sets.some((set) => set.technique === 'minor');
    const lowEffortReserve = work.some((set) => number(set.rir, 0, 10) !== null && number(set.rir, 0, 10) < profile.targetRir);
    const uncertainRoles = work.some((set) => ['auto', 'legacy_default'].includes(set.roleSource) && set.roleConfidence === 'low');
    const fiveByFive = straightFiveByFive(profile, work) && !failed && !poorForm && !minorForm
      && !lowEffortReserve && !uncertainRoles && current.sessionContext?.status !== 'recovery_limited';
    const fiveByFiveComplete = fiveByFive && work.every((set) => set.reps === 5);
    const fiveByFiveShortRest = fiveByFive && knownShortRest(exercise);
    const priorFiveByFive = fiveByFive ? priorFiveByFiveTotals(previousExercises, helpers, work[0].weight) : [];
    const currentFiveByFiveReps = fiveByFive ? work.reduce((total, set) => total + set.reps, 0) : null;
    const stalledFiveByFive = fiveByFive && !fiveByFiveComplete && priorFiveByFive.length >= 2
      && priorFiveByFive[0] < 25 && priorFiveByFive[1] < 25
      && !fiveByFiveShortRest && currentFiveByFiveReps <= priorFiveByFive[0] && priorFiveByFive[0] <= priorFiveByFive[1];
    const assignedMet = assigned && work.length === assigned.length
      && work.every((set, index) => set.weight === assigned[index].weight && set.reps >= assigned[index].reps);
    // Safety information remains authoritative even if a supplied engine is old.
    if (poorForm) plan.action = 'REDUCE LOAD';
    else if (failed || minorForm || lowEffortReserve || current.sessionContext?.status === 'recovery_limited') plan.action = 'HOLD';
    else if (uncertainRoles && ['ADD LOAD', 'ADD REPS'].includes(plan.action)) {
      plan.action = 'HOLD';
      plan.confidence = 'LOW';
    }

    if (fiveByFive) {
      plan.action = fiveByFiveComplete ? 'ADD LOAD' : fiveByFiveShortRest && support?.decision === 'INCREASE REST' ? 'INCREASE REST' : 'HOLD';
      plan.confidence = work.every((set) => number(set.rir, 0, 10) !== null
        && set.technique === 'good' && set.pain === 'none') ? 'HIGH' : 'MODERATE';
      plan.evidence.heuristic.push('Explicit straight-set 5×5 convention: complete all 25 reps before increasing load; the exact trigger is not a research-proven optimum.');
      if (!fiveByFiveComplete) {
        plan.workingSets = plan.workingSets.map((set) => ({ ...set, reps: 5 }));
        plan.reason = `Repeat ${work[0].weight} lb for five sets of five. You completed ${currentFiveByFiveReps} of 25 target reps${priorFiveByFive.length&&currentFiveByFiveReps>priorFiveByFive[0]?`, up from ${priorFiveByFive[0]} last time`:''}; a missed rep is not a reason to add weight or erase that set from the next target.`;
        if (priorFiveByFive.length) plan.evidence.observed.push(`Same-load 5×5 reps: ${priorFiveByFive.slice(0,2).reverse().join('→')}→${currentFiveByFiveReps}/25`);
      }
    }
    if (assigned && !assignedMet && !['REDUCE LOAD', 'STOP AND SEEK APPROPRIATE GUIDANCE'].includes(plan.action)) {
      const matched = Math.min(work.length, assigned.length);
      const missing = Math.max(0, assigned.length - work.length);
      plan.plannedComparison = `${work.length} of ${assigned.length} assigned main sets logged${missing ? `; ${missing} omitted` : ''}.`;
      if (plan.action !== 'INCREASE REST') plan.action = 'HOLD';
      plan.confidence = 'LOW';
      plan.workingSets = assigned.map((set) => ({ ...set }));
      plan.reason = current.sessionContext?.status === 'time_limited' && missing
        ? 'Time ended before the assigned work was complete. Keep the full target next time; omitted sets are not failed attempts.'
        : work.slice(0, matched).some((set, index) => set.weight !== assigned[index].weight)
          ? 'The logged loads differed from the assigned plan. Repeat or deliberately adjust the target before asking for more weight; the app cannot call an altered plan completed.'
          : `The assigned target was not fully met. Repeat the planned load and reps; a missed rep is not a reason to add weight or extra sets.`;
      plan.evidence.heuristic.push('Assigned targets are compared with actual logged work; missing sets are not presumed failed.');
    }
    if (stalledFiveByFive) {
      plan.action = 'REDUCE LOAD';
      plan.confidence = 'MODERATE';
      plan.evidence.heuristic.push('Three same-load 5×5 attempts without a rep gain trigger a roughly 5% reset rounded to the saved load step; this is a coaching convention, not a proven cutoff.');
    }

    const topWeight = Math.max(...work.map((set) => set.weight));
    if (plan.action === 'ADD LOAD') {
      const nextWeight = round(topWeight + profile.loadStep);
      if (topWeight <= 0 || nextWeight > 9999 || profile.loadStep / topWeight > 0.10
        || (!fiveByFiveComplete && profile.loadStep / topWeight > 0.05 && support?.nextLoadPreservesRepMinimum === false)) {
        plan.action = 'HOLD';
        plan.reason = 'The available weight jump is too large for a small next step. Repeat this weight or choose a smaller equipment increment.';
      } else {
        plan.workingSets = plan.workingSets.map((set) => set.weight === topWeight
          ? { ...set, weight: nextWeight, reps: Math.min(set.reps, profile.repMin) } : set);
        plan.reason = fiveByFiveComplete
          ? `You completed the configured five sets of five. Try one ${profile.loadStep} lb step higher for five sets of five; repeat that load until all 25 reps are completed. This is your 5×5 progression rule, not a guaranteed rate of gain.`
          : `Your recent sets support the next ${profile.loadStep} lb step. Keep the same number of sets and rebuild reps at the new weight.`;
        plan.evidence.heuristic.push('Raise only the heaviest working-set group by one equipment step; leave back-off work unchanged.');
      }
    }
    if (plan.action === 'ADD REPS') {
      const candidates = plan.workingSets.map((set, index) => ({ set, index }))
        .filter(({ set }) => set.reps < profile.repMax)
        .sort((a, b) => a.set.reps - b.set.reps || b.index - a.index);
      if (candidates.length) {
        plan.workingSets[candidates[0].index].reps += 1;
        plan.reason = 'Aim for one extra clean rep across the whole exercise. Keep the weight and number of sets the same.';
      } else plan.action = 'HOLD';
    }
    if (plan.action === 'REDUCE LOAD') {
      if (stalledFiveByFive) {
        const steps = Math.max(1, Math.round(topWeight * 0.05 / profile.loadStep));
        const nextWeight = round(topWeight - steps * profile.loadStep);
        if (profile.loadStep / topWeight <= 0.1 && nextWeight > 0) {
          plan.workingSets = plan.workingSets.map((set) => ({ ...set, weight: nextWeight, reps: 5 }));
          plan.reason = `Three same-load 5×5 attempts did not gain reps. Reset from ${topWeight} to ${nextWeight} lb (about 5%, rounded to your saved load step) for five sets of five, then rebuild in small steps. Check rest and recovery; the log cannot prove why progress stalled.`;
        } else {
          plan.action = 'HOLD'; plan.needsReview = true;
          plan.reason = 'The saved load step cannot make a safe 5×5 reset. Review the available weights and recent recovery before retrying.';
        }
      } else if (work.every((set) => set.weight >= profile.loadStep && set.weight > 0)) {
        plan.workingSets = plan.workingSets.map((set) => ({ ...set, weight: round(set.weight - profile.loadStep) }));
        plan.reason = `Form broke down. Use one ${profile.loadStep} lb step less and repeat only your successful reps with control.`;
      } else {
        plan.workingSets = [];
        plan.needsReview = true;
        plan.reason = 'Form broke down and a practical lighter load is not known. Choose an easier setup before retrying.';
      }
    }
    if (plan.action === 'INCREASE REST') {
      plan.workingSets = plan.workingSets.map((set) => ({ ...set, restSeconds: Math.min(300, Math.max(set.restSeconds, 180)) }));
      plan.reason = 'Your reps fell while timer-observed rest was short. Keep the same targets and take the full rest between sets.';
    }
    if (plan.action === 'TEST BASELINE') {
      plan.reason = 'Repeat these successful sets to establish a reliable starting point. A steady baseline makes the next increase more useful.';
    }
    if (plan.action === 'HOLD' && !plan.reason) {
      if (failed) plan.reason = 'A failed attempt was logged. Repeat your successful work; the failed attempt is not a target to beat yet.';
      else if (minorForm) plan.reason = 'Keep the same targets until every rep feels controlled and your form stays consistent.';
      else if (lowEffortReserve) plan.reason = 'These sets were already hard. Repeat the targets with a little more left in reserve before adding work.';
      else if (current.sessionContext?.status === 'recovery_limited') plan.reason = 'Recovery was limited. Repeat only what feels controlled and stop early if you are still run down.';
      else if (uncertainRoles) plan.reason = 'The app is still learning which sets were your working sets. Confirm their labels or repeat this workout first.';
      else if ((support?.repDropPercent || 0) >= 20) plan.reason = 'Your reps dropped across repeated sets. Keep the weight steady and take the full rest before trying to progress.';
      else plan.reason = 'Repeat these targets once more. Consistent clean sets will provide better evidence for the next increase.';
    }
    if (!plan.needsReview) {
      plan.progressionTrigger = fiveByFive
        ? 'Complete all five sets of five at the prescribed load without reported pain or form breakdown; use the smallest saved load step when effort permits.'
        : assigned && !assignedMet
          ? 'Complete the assigned sets at the planned loads and reps with acceptable technique before adding demand.'
          : /strength|power/.test(profile.purpose || '')
            ? 'Complete the prescribed work with controlled technique and tolerable effort; compare it with recent sessions before the next load increase.'
            : `Build clean reps through the saved ${profile.repMin}–${profile.repMax} range; increase load only when the upper target is repeatable.`;
    }
    return finalize(plan);
  }

  function planCardio(exercise, previousExercises, current, goals) {
    const plan = basePlan(exercise, goals);
    const sets = exercise.sets.map(cleanCardio).filter(Boolean);
    const saved = exercise.prescription;
    const assigned = saved?.source === 'app_next_workout' && saved.type === 'cardio'
      && Array.isArray(saved.workingSets) && saved.workingSets.length <= 40
      ? saved.workingSets.map((set, index) => {
        const duration = number(set?.duration, 1, 604800), distance = number(set?.distance, 0.001, 100000);
        if ((duration === null || !Number.isInteger(duration)) && distance === null) return null;
        return { set:index+1,role:'cardio',duration,distance,
          restSeconds:Math.round(number(set.restSeconds,0,900)??0) };
      }) : null;
    const assignedTargets = assigned?.length && assigned.every(Boolean) ? assigned : null;
    attachGoalProgress(plan, sets);
    plan.workingSets = sets.map((set, index) => ({
      set: index + 1, role: 'cardio', duration: set.duration, distance: set.distance,
      restSeconds: Math.round(number(set.restPlanned, 0, 900) ?? 0),
    }));
    plan.effortCue = 'Keep a comfortable, repeatable effort. Slow down if you need to.';
    plan.warmupCue = 'Start gently and ease into your usual pace.';
    if (painBlock(plan, exercise, current.sessionContext)) return finalize(plan);
    if (!sets.length) {
      plan.action = 'REVIEW DATA';
      plan.confidence = 'INSUFFICIENT';
      plan.reason = 'A valid completed time was not recorded. Log your starting point before increasing it.';
      plan.needsReview = true;
      return finalize(plan);
    }
    const previous = previousExercises[0];
    const previousSets = (previous?.exercise.sets || []).map(cleanCardio).filter(Boolean);
    const total = sets.reduce((sum, set) => sum + set.duration, 0);
    const previousTotal = previousSets.reduce((sum, set) => sum + set.duration, 0);
    const adverse = [exercise, previous?.exercise].filter(Boolean).some((entry) => entry.sets.some((set) => (
      set.completed === false || set.outcome === 'failed' || ['stopped', 'discomfort'].includes(set.pain)
      || ['minor', 'poor'].includes(set.technique)
    )));
    const limited = [current.sessionContext, previous?.context].some((context) => context?.status && context.status !== 'complete');
    const comparable = previousTotal > 0 && previousSets.length === sets.length && total >= previousTotal * 0.95 && total <= previousTotal * 1.1;
    plan.reason = 'Repeat this comfortable effort to establish a consistent baseline before increasing it.';
    if (previous) plan.action = 'HOLD';
    if (limited || adverse) {
      plan.reason = 'The last workout was limited or difficult. Keep the target steady and finish only what feels comfortable.';
    } else if (comparable && ['duration', 'distance'].includes(plan.goal?.goalType)) {
      if (plan.goal.goalType === 'duration') {
        // Duration goals are stored in minutes; logged duration is seconds.
        // Like the tracker goal model, the goal applies to one completed set.
        const targetSet = plan.workingSets.reduce((best, set) => set.duration >= best.duration ? set : best);
        const goalSeconds = Math.round(plan.goal.goalValue * 60);
        const remaining = goalSeconds - targetSet.duration;
        const increase = Math.min(60, Math.floor(total * 0.05), remaining);
        if (increase >= 1 && targetSet.duration + increase <= 604800) {
          targetSet.duration += increase;
          // A duration target is not also a pace/distance requirement.
          plan.workingSets.forEach((set) => { set.distance = null; });
          plan.action = 'ADD TIME';
          plan.reason = `Your recent times were consistent. Add ${increase} seconds in total at the same comfortable effort.`;
        }
      } else {
        const distance = sets.reduce((sum, set) => sum + (set.distance || 0), 0);
        const previousDistance = previousSets.reduce((sum, set) => sum + (set.distance || 0), 0);
        const targetSet = plan.workingSets.reduce((best, set) => (set.distance || 0) >= (best.distance || 0) ? set : best);
        const remaining = plan.goal.goalValue - (targetSet.distance || 0);
        const increase = Math.min(0.1, Math.floor(distance * 0.05 * 100) / 100, remaining);
        if (sets.every((set) => set.distance > 0) && previousDistance > 0 && distance >= previousDistance * 0.95
          && distance <= previousDistance * 1.1 && increase >= 0.01) {
          targetSet.distance = round(targetSet.distance + increase);
          plan.workingSets.forEach((set) => { set.duration = null; });
          plan.action = 'ADD DISTANCE';
          plan.reason = `Your recent distances were consistent. Add ${round(increase)} mi in total without chasing a faster pace.`;
        }
      }
      plan.confidence = 'MODERATE';
      plan.evidence.heuristic.push('At most 5% more total time or distance, with a 60-second or 0.1-mile ceiling.');
    }
    if (plan.action === 'HOLD' && !limited && !adverse) {
      plan.reason = 'Repeat your current time and distance at a comfortable effort. Keep building consistency before the next increase.';
    }
    if (assignedTargets && (sets.length !== assignedTargets.length || sets.some((set,index) => {
      const target = assignedTargets[index];
      return !target || target.duration !== null && set.duration < target.duration
        || target.distance !== null && (set.distance === null || set.distance < target.distance);
    }))) {
      plan.action = 'HOLD'; plan.confidence = 'LOW';
      plan.workingSets = assignedTargets.map(set => ({ ...set }));
      plan.plannedComparison = `${sets.length} of ${assignedTargets.length} assigned cardio entries logged.`;
      plan.reason = current.sessionContext?.status === 'time_limited' && sets.length < assignedTargets.length
        ? 'Time ran out before the assigned cardio target was complete. Keep the full target next time; omitted entries are not failures.'
        : 'The assigned cardio duration or distance was not fully logged. Repeat that target at a comfortable effort before increasing it.';
    }
    plan.progressionTrigger = 'Complete the prescribed time or distance at a comfortable, repeatable effort before another small increase.';
    return finalize(plan);
  }

  /**
   * @param {object} options {current, history, helpers, goals}
   * helpers: computeSessionStats, classifyExerciseSets,
   *          buildStrengthDecisionSupport, normalizeExerciseProfile.
   * No storage, timestamps, mutations, or network calls occur in this module.
   */
  function buildNextWorkout(options = {}) {
    const current = options.current && typeof options.current === 'object' ? options.current : { exercises: [] };
    const helpers = options.helpers || {};
    const roster = flattenExercises(current, helpers);
    const historical = priorWorkouts(current, options.history).map((payload) => ({
      exercises: flattenExercises(payload, helpers), context: payload.sessionContext,
    }));
    const exercises = roster.map((exercise) => {
      const prior = historical.map((payload) => ({
        exercise: payload.exercises.find((candidate) => key(candidate.name) === key(exercise.name) && candidate.isCardio === exercise.isCardio),
        context: payload.context,
      })).filter((entry) => entry.exercise);
      return exercise.isCardio
        ? planCardio(exercise, prior, current, options.goals)
        : planStrength(exercise, prior, current, helpers, options.goals);
    });
    const advancing = exercises.filter((exercise) => ['ADD LOAD', 'ADD REPS', 'ADD TIME', 'ADD DISTANCE'].includes(exercise.action)).length;
    const review = exercises.filter((exercise) => exercise.needsReview).length;
    const completeEstimate = exercises.length > 0 && exercises.every((exercise) => exercise.estimatedMinutes != null);
    return {
      version: 1,
      sourceDate: current.date || null,
      dayType: current.dayType || null,
      selectionRule: 'current_session_only',
      exerciseNames: exercises.map((exercise) => exercise.name),
      exercises,
      progressingCount: advancing,
      reviewCount: review,
      estimatedMinutes: completeEstimate ? exercises.reduce((sum, exercise) => sum + exercise.estimatedMinutes, 0) : null,
      summary: !exercises.length ? 'Log your first workout to build a personal next-session plan.'
        : review ? `${review} exercise${review === 1 ? ' needs' : 's need'} a quick check before your next workout.`
          : advancing ? `${advancing} exercise${advancing === 1 ? ' has' : 's have'} a small next step. Keep the rest consistent.`
            : 'Your next win is a repeatable session with clean, controlled reps.',
      guidance: 'Targets adapt to your recorded workouts. Progress can include better technique, more consistent reps, and recovery—not only more weight.',
      sources: SOURCES.map((source) => ({ ...source })),
    };
  }

  return Object.freeze({ buildNextWorkout, ACTION_LABELS, SOURCES });
}));
