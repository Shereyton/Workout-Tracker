// ---- storage guardrails (no HTML changes) ----
const WT_KEYS = {
  session: 'wt_session',
  current: 'wt_currentExercise',
  last: 'wt_lastWorkout',
  lastMeta: 'wt_lastWorkoutMeta',
  completed: 'wt_completedWorkouts',
  history: 'wt_history',
  custom: 'wt_customExercises',
  theme: 'wt_theme',
  themePack: 'wt_themePack',
  schema: 'wt_schemaVersion',
  prefSessionTime: 'wt_pref_sessionTimeAlways',
  goals: 'wt_goals',
  constraints: 'wt_constraints',
  archive: 'wt_sessionArchive',
  dayType: 'wt_dayType',
  dayCompare: 'wt_dayCompareWindow',
  progressionGuard: 'wt_progressionGuard',
  exerciseGoals: 'wt_exerciseGoals',
  prefExerciseGoalProgress: 'wt_pref_exerciseGoalProgressExport',
  sessionStatus: 'wt_sessionStatus',
  nextWorkoutMinutes: 'wt_nextWorkoutMinutes',
  exerciseProfiles: 'wt_exerciseProfiles',
};

const THEME_PACKS = Object.freeze({
  aurora: Object.freeze({ id: 'aurora', label: 'Aurora', mode: 'light', lightColor: '#eef0fb', darkColor: '#0c1020' }),
  midnight: Object.freeze({ id: 'midnight', label: 'Midnight', mode: 'dark', lightColor: '#11162a', darkColor: '#070a14' }),
  inferno: Object.freeze({ id: 'inferno', label: 'Inferno', mode: 'dark', lightColor: '#2b1215', darkColor: '#12090b' }),
  ice: Object.freeze({ id: 'ice', label: 'Ice', mode: 'light', lightColor: '#e8f7ff', darkColor: '#071724' }),
  volt: Object.freeze({ id: 'volt', label: 'Volt', mode: 'dark', lightColor: '#152217', darkColor: '#071008' }),
  chrome: Object.freeze({ id: 'chrome', label: 'Chrome', mode: 'light', lightColor: '#edf0f5', darkColor: '#101318' }),
});

function getThemePack(value) {
  return THEME_PACKS[value] || THEME_PACKS.aurora;
}

const WT_SCHEMA_VERSION = 9;
const MAX_ACTIVE_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

function normalizeSessionStartedAt(value, nowMs = Date.now()) {
  if (!value) return null;
  const startedAtMs = new Date(value).getTime();
  if (
    !Number.isFinite(startedAtMs)
    || startedAtMs > nowMs + 60000
    || nowMs - startedAtMs > MAX_ACTIVE_SESSION_AGE_MS
  ) {
    return null;
  }
  return value;
}

const EXERCISE_GOAL_TYPES = Object.freeze({
  weight: Object.freeze({ label: 'Weight', unit: 'lbs', step: 0.5 }),
  reps: Object.freeze({ label: 'Repetitions', unit: 'reps', step: 1 }),
  distance: Object.freeze({ label: 'Distance', unit: 'miles', step: 0.01 }),
  duration: Object.freeze({ label: 'Duration', unit: 'minutes', step: 0.5 }),
  performance: Object.freeze({ label: 'Performance', unit: 'points', step: 0.1 }),
});

const SET_ROLE_OPTIONS = Object.freeze({
  auto: 'Auto-detect',
  unknown: 'Not classified',
  warmup: 'Warm-up',
  ramp: 'Ramp set',
  working: 'Working set',
  top_set: 'Top set',
  back_off: 'Back-off set',
  technique: 'Technique set',
  failed_attempt: 'Failed attempt',
});

const SET_ROLE_SOURCES = Object.freeze({
  auto: 'Automatically classified',
  manual: 'Marked by user',
  legacy_default: 'Automatically reclassified from an older default',
  system: 'Determined from the logged outcome',
});

const TECHNIQUE_OPTIONS = Object.freeze({
  unknown: 'Not recorded',
  good: 'Good / full standard',
  minor: 'Minor breakdown',
  poor: 'Poor / unsafe',
});

const PAIN_OPTIONS = Object.freeze({
  unknown: 'Not recorded',
  none: 'No pain',
  discomfort: 'Discomfort',
  stopped: 'Pain stopped the set',
});

const EXERCISE_PURPOSES = Object.freeze({
  general: Object.freeze({ label: 'General progression', repMin: 6, repMax: 12, targetRir: 2 }),
  primary_strength: Object.freeze({ label: 'Primary strength lift', repMin: 1, repMax: 5, targetRir: 2 }),
  secondary_strength: Object.freeze({ label: 'Secondary strength lift', repMin: 3, repMax: 8, targetRir: 2 }),
  hypertrophy_compound: Object.freeze({ label: 'Hypertrophy compound', repMin: 6, repMax: 12, targetRir: 2 }),
  hypertrophy_isolation: Object.freeze({ label: 'Hypertrophy isolation', repMin: 8, repMax: 20, targetRir: 2 }),
  power_skill: Object.freeze({ label: 'Power / skill', repMin: 1, repMax: 5, targetRir: 3 }),
  rehab_tolerance: Object.freeze({ label: 'Rehab / tolerance', repMin: 8, repMax: 15, targetRir: 3 }),
  conditioning: Object.freeze({ label: 'Conditioning', repMin: 8, repMax: 20, targetRir: 3 }),
  hybrid: Object.freeze({ label: 'Balanced strength + muscle', repMin: 5, repMax: 10, targetRir: 2 }),
});

const GOAL_PATHS = Object.freeze({
  strength: Object.freeze({
    label: 'Get stronger',
    description: 'Prioritize safe weight increases and strength-specific practice.',
  }),
  hypertrophy: Object.freeze({
    label: 'Build muscle',
    description: 'Prioritize quality reps and productive volume before adding weight.',
  }),
  balanced: Object.freeze({
    label: 'Strength + muscle',
    description: 'Balance weight, reps, and repeatable working sets.',
  }),
  performance: Object.freeze({
    label: 'Improve performance',
    description: 'Progress distance, time, or repeatable output.',
  }),
});

function normalizeGoalPath(value, goalType = 'weight') {
  if (goalType === 'distance' || goalType === 'duration') return 'performance';
  if (Object.prototype.hasOwnProperty.call(GOAL_PATHS, value)) return value;
  return goalType === 'weight' ? 'strength' : 'balanced';
}

function normalizeSetRole(value) {
  return Object.prototype.hasOwnProperty.call(SET_ROLE_OPTIONS, value)
    ? value
    : 'unknown';
}

function normalizeSetRoleSource(value, role = 'unknown') {
  if (Object.prototype.hasOwnProperty.call(SET_ROLE_SOURCES, value)) return value;
  return normalizeSetRole(role) === 'auto' ? 'auto' : 'manual';
}

function normalizeRir(value) {
  if (value === '' || value === null || value === undefined) return null;
  const rir = Number(value);
  return Number.isFinite(rir) && rir >= 0 && rir <= 10
    ? Number(rir.toFixed(1))
    : null;
}

function normalizeTechnique(value) {
  return Object.prototype.hasOwnProperty.call(TECHNIQUE_OPTIONS, value)
    ? value
    : 'unknown';
}

function normalizePain(value) {
  return Object.prototype.hasOwnProperty.call(PAIN_OPTIONS, value)
    ? value
    : 'unknown';
}

function defaultExerciseProfile(purpose = 'general') {
  const safePurpose = Object.prototype.hasOwnProperty.call(EXERCISE_PURPOSES, purpose)
    ? purpose
    : 'general';
  const defaults = EXERCISE_PURPOSES[safePurpose];
  return {
    mode: 'auto',
    purpose: safePurpose,
    purposeLabel: defaults.label,
    repMin: defaults.repMin,
    repMax: defaults.repMax,
    targetRir: defaults.targetRir,
    loadStep: 5,
  };
}

function normalizeExerciseProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const base = defaultExerciseProfile(source.purpose);
  const repMin = Math.floor(Number(source.repMin));
  const repMax = Math.floor(Number(source.repMax));
  const targetRir = Number(source.targetRir);
  const loadStep = Number(source.loadStep);
  const safeMin = Number.isFinite(repMin) && repMin >= 1 && repMin <= 100
    ? repMin
    : base.repMin;
  const safeMax = Number.isFinite(repMax) && repMax >= safeMin && repMax <= 100
    ? repMax
    : Math.max(safeMin, base.repMax);
  return {
    mode: source.mode === 'custom' ? 'custom' : 'auto',
    purpose: base.purpose,
    purposeLabel: base.purposeLabel,
    repMin: safeMin,
    repMax: safeMax,
    targetRir: Number.isFinite(targetRir) && targetRir >= 0 && targetRir <= 10
      ? Number(targetRir.toFixed(1))
      : base.targetRir,
    loadStep: Number.isFinite(loadStep) && loadStep >= 0.25 && loadStep <= 100
      ? Number(loadStep.toFixed(2))
      : base.loadStep,
  };
}

function isLikelyIsolationExercise(name) {
  return /(curl|raise|extension|pushdown|fly|calf|leg curl|hamstring curl|pullover)/i
    .test(String(name || ''));
}

function buildAutomaticExerciseProfile(exerciseName, goal, previousProfile = null) {
  const normalizedGoal = normalizeExerciseGoal(goal, exerciseName);
  const previous = normalizeExerciseProfile(previousProfile);
  if (!normalizedGoal) {
    return normalizeExerciseProfile({
      ...defaultExerciseProfile('general'),
      mode: 'auto',
      loadStep: previous.loadStep,
    });
  }
  const goalType = normalizedGoal?.goalType || 'weight';
  const path = normalizeGoalPath(normalizedGoal?.goalPath, goalType);
  let purpose = 'general';
  if (path === 'performance') purpose = 'conditioning';
  else if (path === 'strength') purpose = 'primary_strength';
  else if (path === 'balanced') purpose = 'hybrid';
  else if (path === 'hypertrophy') {
    purpose = isLikelyIsolationExercise(exerciseName)
      ? 'hypertrophy_isolation'
      : 'hypertrophy_compound';
  }
  const automatic = defaultExerciseProfile(purpose);
  return normalizeExerciseProfile({
    ...automatic,
    mode: 'auto',
    loadStep: previous.loadStep,
  });
}

function sanitizeExerciseProfiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).forEach(([name, profile]) => {
    const key = exerciseGoalKey(name);
    if (key) out[key] = normalizeExerciseProfile(profile);
  });
  return out;
}

function isProgressionSet(set) {
  const reps = Number(set?.reps);
  if (!set || set.completed === false || !Number.isFinite(reps) || reps <= 0) return false;
  const role = normalizeSetRole(set.role);
  return ['working', 'top_set', 'back_off'].includes(role);
}

function exerciseGoalKey(name) {
  return trimString(name, 80).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeExerciseGoal(value, exerciseName = '', nowIso = new Date().toISOString()) {
  if (!value || typeof value !== 'object') return null;
  const name = trimString(value.exerciseName || exerciseName, 80);
  const goalType = EXERCISE_GOAL_TYPES[value.goalType]
    ? value.goalType
    : 'weight';
  const goalValue = Number(value.goalValue ?? value.goalWeight);
  if (!name || !Number.isFinite(goalValue) || goalValue <= 0) return null;
  const createdAt = trimString(value.dateCreated || value.createdAt || nowIso, 40);
  const updatedAt = trimString(value.lastUpdated || value.updatedAt || nowIso, 40);
  const best = Number(value.currentBestPerformance);
  const currentBestPerformance = Number.isFinite(best) && best >= 0 ? best : 0;
  const progressPercentage = Math.min(
    100,
    Math.max(0, (currentBestPerformance / goalValue) * 100),
  );
  const remainingDistanceToGoal = Math.max(0, goalValue - currentBestPerformance);
  const meta = EXERCISE_GOAL_TYPES[goalType];
  const goalPath = normalizeGoalPath(value.goalPath, goalType);
  const normalized = {
    exerciseName: name,
    goalType,
    goalPath,
    goalPathLabel: GOAL_PATHS[goalPath].label,
    goalValue,
    ...(goalType === 'weight' ? { goalWeight: goalValue } : {}),
    unit: trimString(value.unit || meta.unit, 20),
    dateCreated: createdAt || nowIso,
    lastUpdated: updatedAt || nowIso,
    currentBestPerformance,
    progressPercentage: Number(progressPercentage.toFixed(1)),
    remainingDistanceToGoal: Number(remainingDistanceToGoal.toFixed(2)),
  };
  const datePerformed = trimString(value.datePerformed, 20);
  if (datePerformed) normalized.datePerformed = datePerformed;
  return normalized;
}

function sanitizeExerciseGoals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).forEach(([key, goal]) => {
    const normalized = normalizeExerciseGoal(goal, goal && goal.exerciseName ? goal.exerciseName : key);
    if (!normalized) return;
    out[exerciseGoalKey(normalized.exerciseName)] = normalized;
  });
  return out;
}

function getGoalPerformanceFromExercise(exercise, goalType, exerciseName = '') {
  if (!exercise || !Array.isArray(exercise.sets)) return 0;
  const classifiedExercise = classifyExerciseSets(exercise);
  const values = [];
  const record = (set) => {
    if (!set) return;
    if (
      set.completed === false
      || normalizeSetRole(set.role) === 'failed_attempt'
      || normalizePain(set.pain) === 'stopped'
      || normalizeTechnique(set.technique) === 'poor'
    ) return;
    if (['weight', 'reps'].includes(goalType) && !isProgressionSet(set)) return;
    let value = null;
    if (goalType === 'weight') value = Number(set.weight);
    else if (goalType === 'reps') value = Number(set.reps);
    else if (goalType === 'distance') value = Number(set.distance);
    else if (goalType === 'duration') value = Number(set.duration) / 60;
    else if (goalType === 'performance') value = Number(set.performance);
    if (Number.isFinite(value) && value >= 0) values.push(value);
  };
  if (classifiedExercise.isSuperset) {
    classifiedExercise.sets.forEach((set) => {
      (set.exercises || []).forEach((inner) => {
        if (exerciseGoalKey(inner.name) === exerciseGoalKey(exerciseName)) {
          record({
            ...set,
            ...inner,
            exercises: undefined,
          });
        }
      });
    });
  } else {
    classifiedExercise.sets.forEach(record);
  }
  return values.length ? Math.max(...values) : 0;
}

function updateExerciseGoalProgress(goal, performance, updatedAt = new Date().toISOString()) {
  const normalized = normalizeExerciseGoal(goal, goal && goal.exerciseName, updatedAt);
  if (!normalized) return null;
  const candidate = Number(performance);
  const best = Number.isFinite(candidate) && candidate >= 0
    ? Math.max(normalized.currentBestPerformance, candidate)
    : normalized.currentBestPerformance;
  return normalizeExerciseGoal(
    {
      ...normalized,
      currentBestPerformance: best,
      lastUpdated: best > normalized.currentBestPerformance
        ? updatedAt
        : normalized.lastUpdated,
    },
    normalized.exerciseName,
    updatedAt,
  );
}

function buildExerciseGoalSnapshots(exercise, goalsByExercise) {
  const safeGoals = sanitizeExerciseGoals(goalsByExercise);
  const names = exercise && exercise.isSuperset
    ? (exercise.exercises || [])
    : [exercise && exercise.name];
  return names.filter(Boolean).map((name) => {
    const goal = safeGoals[exerciseGoalKey(name)];
    if (!goal) return null;
    const performance = getGoalPerformanceFromExercise(exercise, goal.goalType, name);
    return updateExerciseGoalProgress(goal, performance);
  }).filter(Boolean);
}

function attachExerciseGoalSnapshots(exercises, goalsByExercise, datePerformed = '') {
  if (!Array.isArray(exercises)) return [];
  return exercises.map((exercise) => {
    const normalized = normalizeExercise(exercise);
    const snapshots = buildExerciseGoalSnapshots(normalized, goalsByExercise)
      .map((goal) => normalizeExerciseGoal({ ...goal, datePerformed }, goal.exerciseName));
    if (!snapshots.length) return normalized;
    if (normalized.isSuperset) {
      return { ...normalized, exerciseGoals: snapshots };
    }
    return { ...normalized, goal: snapshots[0] };
  });
}

function exerciseGoalForExport(goal, includeProgress = false) {
  const normalized = normalizeExerciseGoal(goal, goal && goal.exerciseName);
  if (!normalized) return null;
  const exported = {
    exerciseName: normalized.exerciseName,
    goalType: normalized.goalType,
    goalPath: normalized.goalPath,
    goalPathLabel: normalized.goalPathLabel,
    goalValue: normalized.goalValue,
    ...(normalized.goalType === 'weight'
      ? { goalWeight: normalized.goalWeight }
      : {}),
    unit: normalized.unit,
    dateCreated: normalized.dateCreated,
    lastUpdated: normalized.lastUpdated,
    ...(normalized.datePerformed
      ? { datePerformed: normalized.datePerformed }
      : {}),
  };
  if (includeProgress) {
    exported.currentBestPerformance = normalized.currentBestPerformance;
    exported.progressPercentage = normalized.progressPercentage;
    exported.remainingDistanceToGoal = normalized.remainingDistanceToGoal;
  }
  return exported;
}

function prepareExerciseGoalsForExport(exercises, includeProgress = false) {
  if (!Array.isArray(exercises)) return [];
  return exercises.map((exercise) => {
    const exported = { ...exercise };
    if (exercise.goal) {
      exported.goal = exerciseGoalForExport(exercise.goal, includeProgress);
    }
    if (Array.isArray(exercise.exerciseGoals)) {
      const goals = exercise.exerciseGoals
        .map((goal) => exerciseGoalForExport(goal, includeProgress))
        .filter(Boolean);
      if (goals.length) exported.exerciseGoals = goals;
      else delete exported.exerciseGoals;
    }
    return exported;
  });
}

function formatGoalNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function buildGoalInsight(goal) {
  const normalized = normalizeExerciseGoal(goal, goal && goal.exerciseName);
  if (!normalized) return '';
  const best = normalized.currentBestPerformance;
  const remaining = normalized.remainingDistanceToGoal;
  const pathLabel = normalized.goalPathLabel;
  if (remaining <= 0) {
    return `${pathLabel} coaching is active. Goal reached with a logged best of ${formatGoalNumber(best)} ${normalized.unit}. Confirm it with controlled, high-quality work before setting the next target.`;
  }
  if (best <= 0) {
    return `${pathLabel} coaching is active. Log a normal baseline workout, then export it so the AI can calculate the next exact step toward ${formatGoalNumber(normalized.goalValue)} ${normalized.unit}.`;
  }
  if (normalized.goalType === 'weight') {
    return `${pathLabel} coaching is active. Your logged best is ${formatGoalNumber(remaining)} ${normalized.unit} below the long-term goal. The AI should use the smallest available increment and progress one variable at a time after clean, repeatable work.`;
  }
  return `${pathLabel} coaching is active. Your logged best is ${formatGoalNumber(remaining)} ${normalized.unit} below the long-term goal. Keep logging and exporting; the AI should calculate each next step from completed work.`;
}

// ----- Data Health Utilities -----
function coercePositiveNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function normalizeSet(s) {
  // supports strength set and cardio set
  const out = s && typeof s === 'object' ? { ...s } : {};
  const isStrengthSet = 'weight' in out || 'reps' in out || Array.isArray(out.exercises);
  if (isStrengthSet) {
    const requestedRole = out.role ?? out.setRole ?? 'auto';
    const normalizedRequestedRole = normalizeSetRole(requestedRole);
    const hasExplicitReps = out.reps !== '' && out.reps !== null && out.reps !== undefined;
    const hasZeroCompletedReps = !Array.isArray(out.exercises)
      && hasExplicitReps
      && Number(out.reps) === 0;
    const outcomeForcesFailure = out.outcome === 'failed'
      || out.completed === false
      || hasZeroCompletedReps;
    out.role = outcomeForcesFailure ? 'failed_attempt' : normalizedRequestedRole;
    out.roleSource = outcomeForcesFailure && normalizedRequestedRole !== 'failed_attempt'
      ? 'system'
      : normalizeSetRoleSource(out.roleSource, out.role);
    if (out.role === 'auto' && out.roleSource !== 'legacy_default') {
      out.roleSource = 'auto';
    }
    if (out.roleSource === 'auto' || out.roleSource === 'legacy_default') {
      out.recordedRole = normalizeSetRole(
        out.recordedRole || (out.roleSource === 'legacy_default' ? 'working' : 'auto'),
      );
    } else {
      delete out.recordedRole;
    }
    out.completed = out.role !== 'failed_attempt' && out.completed !== false;
    out.outcome = out.completed ? 'completed' : 'failed';
    out.rir = out.completed ? normalizeRir(out.rir) : null;
    out.technique = normalizeTechnique(out.technique);
    out.pain = normalizePain(out.pain);
    if (!['high', 'moderate', 'low'].includes(out.roleConfidence)) {
      delete out.roleConfidence;
    }
    if (out.roleReason) out.roleReason = trimString(out.roleReason, 180);
    else delete out.roleReason;
    if (Number(out.classificationVersion) !== 1) delete out.classificationVersion;
    delete out.setRole;
  }
  if ('weight' in out) {
    const weight = out.weight === null || out.weight === '' ? NaN : Number(out.weight);
    out.weight = Number.isFinite(weight) && weight >= 0 && weight <= 9999
      ? weight
      : null;
  }
  if ('reps' in out) {
    const reps = Number(out.reps);
    out.reps = out.role === 'failed_attempt'
      ? 0
      : Number.isFinite(reps) && reps >= 1 && reps <= 999
        ? Math.floor(reps)
        : null;
  }
  // Normalize superset inner exercises if present
  if (Array.isArray(out.exercises)) {
    out.exercises = out.exercises.map((sub) => {
      const subOut = { ...sub };
      if ('weight' in subOut) {
        const weight = subOut.weight === null || subOut.weight === '' ? NaN : Number(subOut.weight);
        subOut.weight = Number.isFinite(weight) && weight >= 0 && weight <= 9999
          ? weight
          : null;
      }
      if ('reps' in subOut) {
        const reps = Number(subOut.reps);
        subOut.reps = out.role === 'failed_attempt'
          ? 0
          : Number.isFinite(reps) && reps >= 1 && reps <= 999
            ? Math.floor(reps)
            : null;
      }
      if ('name' in subOut) subOut.name = String(subOut.name || 'Unknown');
      return subOut;
    });
  }
  if ('distance' in out && out.distance !== null) {
    const d = Number(out.distance);
    out.distance = Number.isFinite(d) && d >= 0 && d <= 100000 ? d : null;
  }
  if ('duration' in out)
    {
      const duration = Number(out.duration);
      out.duration = Number.isFinite(duration) && duration >= 0 && duration <= 604800
        ? Math.floor(duration)
        : null;
    }
  if ('restPlanned' in out && out.restPlanned !== null) {
    const rp = Number(out.restPlanned);
    out.restPlanned = Number.isFinite(rp) && rp >= 0 && rp <= 86400 ? rp : null;
  }
  if ('restActual' in out && out.restActual !== null) {
    const ra = Number(out.restActual);
    out.restActual = Number.isFinite(ra) && ra >= 0 && ra <= 86400 ? ra : null;
  }
  return out;
}

function isValidNormalizedSet(set, exercise = {}) {
  if (!set || typeof set !== 'object') return false;
  if (exercise.isCardio) {
    const duration = Number(set.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 604800) return false;
    const allowsNoDistance = ['jump rope', 'plank'].includes(
      String(exercise.name || '').trim().toLowerCase(),
    );
    if (allowsNoDistance && (set.distance === null || set.distance === undefined)) return true;
    const distance = Number(set.distance);
    return Number.isFinite(distance) && distance >= 0 && distance <= 100000;
  }
  const isValidStrengthEntry = (entry, role) => {
    if (entry?.weight === null || entry?.weight === undefined || entry?.weight === '') return false;
    if (entry?.reps === null || entry?.reps === undefined || entry?.reps === '') return false;
    const weight = Number(entry?.weight);
    const reps = Number(entry?.reps);
    if (!Number.isFinite(weight) || weight < 0 || weight > 9999) return false;
    if (normalizeSetRole(role) === 'failed_attempt') return reps === 0;
    return Number.isFinite(reps) && reps >= 1 && reps <= 999;
  };
  if (exercise.isSuperset || Array.isArray(set.exercises)) {
    return Array.isArray(set.exercises)
      && set.exercises.length >= 2
      && set.exercises.every((inner) => isValidStrengthEntry(
        inner,
        inner.role ?? set.role,
      ));
  }
  return isValidStrengthEntry(set, set.role);
}

function representativeSetLoad(set) {
  if (Array.isArray(set?.exercises)) {
    const weights = set.exercises
      .map((inner) => Number(inner?.weight))
      .filter((weight) => Number.isFinite(weight) && weight >= 0);
    return weights.length ? weights.reduce((sum, weight) => sum + weight, 0) : 0;
  }
  const weight = Number(set?.weight);
  return Number.isFinite(weight) && weight >= 0 ? weight : 0;
}

function representativeSetReps(set) {
  if (Array.isArray(set?.exercises)) {
    const reps = set.exercises
      .map((inner) => Number(inner?.reps))
      .filter((value) => Number.isFinite(value) && value > 0);
    return reps.length ? Math.min(...reps) : 0;
  }
  const reps = Number(set?.reps);
  return Number.isFinite(reps) && reps > 0 ? reps : 0;
}

function isAutomaticRole(set) {
  const role = normalizeSetRole(set?.role);
  const source = normalizeSetRoleSource(set?.roleSource, role);
  return role === 'auto' || source === 'auto' || source === 'legacy_default';
}

function medianNumber(values) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Resolve automatic set roles from the complete loading sequence for one exercise.
 * Manual labels always win. The classifier deliberately uses only transparent
 * loading-pattern rules; inferred labels retain their source, confidence, and reason.
 */
function classifyExerciseSets(exercise) {
  if (!exercise || !Array.isArray(exercise.sets)) {
    return exercise && typeof exercise === 'object'
      ? { ...exercise, sets: Array.isArray(exercise.sets) ? exercise.sets.map(normalizeSet) : [] }
      : exercise;
  }

  if (exercise.isCardio) {
    const sets = exercise.sets
      .map((set) => normalizeSet(set))
      .filter((set) => isValidNormalizedSet(set, exercise));
    return { ...exercise, sets };
  }

  if (exercise.isSuperset) {
    const parentSets = exercise.sets
      .map((set) => normalizeSet(set))
      .filter((set) => isValidNormalizedSet(set, exercise));
    const childSeries = new Map();
    parentSets.forEach((parentSet, parentIndex) => {
      (parentSet.exercises || []).forEach((inner, innerIndex) => {
        const name = trimString(inner?.name || `Exercise ${innerIndex + 1}`, 80);
        const key = exerciseGoalKey(name);
        if (!childSeries.has(key)) childSeries.set(key, { name, entries: [] });
        childSeries.get(key).entries.push({
          parentIndex,
          innerIndex,
          set: {
            ...inner,
            set: parentSet.set,
            role: inner.role ?? parentSet.role,
            roleSource: inner.roleSource ?? parentSet.roleSource,
            recordedRole: inner.recordedRole ?? parentSet.recordedRole,
            completed: inner.completed ?? parentSet.completed,
            outcome: inner.outcome ?? parentSet.outcome,
            rir: inner.rir ?? parentSet.rir,
            technique: inner.technique ?? parentSet.technique,
            pain: inner.pain ?? parentSet.pain,
          },
        });
      });
    });

    childSeries.forEach(({ name, entries }) => {
      const classified = classifyExerciseSets({
        name,
        progressionProfile: exercise.progressionProfiles?.[exerciseGoalKey(name)]
          || exercise.progressionProfile,
        sets: entries.map((entry) => entry.set),
      });
      classified.sets.forEach((childSet, childIndex) => {
        const entry = entries[childIndex];
        const inner = parentSets[entry.parentIndex].exercises[entry.innerIndex];
        [
          'role',
          'roleSource',
          'recordedRole',
          'roleConfidence',
          'roleReason',
          'classificationVersion',
          'completed',
          'outcome',
          'rir',
          'technique',
          'pain',
        ].forEach((field) => {
          if (childSet[field] === undefined) delete inner[field];
          else inner[field] = childSet[field];
        });
      });
    });

    parentSets.forEach((parentSet) => {
      if (!isAutomaticRole(parentSet)) return;
      const roles = [...new Set(
        (parentSet.exercises || []).map((inner) => normalizeSetRole(inner.role)),
      )];
      if (roles.length === 1) {
        parentSet.role = roles[0];
        parentSet.roleConfidence = (parentSet.exercises || []).every(
          (inner) => inner.roleConfidence === 'high',
        ) ? 'high' : 'moderate';
        parentSet.roleReason = 'Every exercise in this superset received the same automatic role.';
      } else {
        parentSet.role = 'auto';
        parentSet.roleConfidence = 'low';
        parentSet.roleReason = 'Superset exercises were classified separately because their loading patterns differ.';
      }
      parentSet.recordedRole = normalizeSetRole(parentSet.recordedRole || 'auto');
      parentSet.classificationVersion = 1;
    });

    return { ...exercise, sets: parentSets };
  }

  const sets = exercise.sets
    .map((set) => normalizeSet(set))
    .filter((set) => isValidNormalizedSet(set, exercise));
  const profile = normalizeExerciseProfile(exercise.progressionProfile);
  const analysis = sets
    .map((set, index) => ({
      set,
      index,
      load: representativeSetLoad(set),
      reps: representativeSetReps(set),
    }))
    .filter(({ set, reps }) => {
      if (set.completed === false || reps <= 0) return false;
      const role = normalizeSetRole(set.role);
      return isAutomaticRole(set) || ['working', 'top_set', 'back_off'].includes(role);
    });

  const automatic = analysis.filter(({ set }) => isAutomaticRole(set));
  if (!automatic.length) return { ...exercise, sets };

  const maxLoad = analysis.length
    ? Math.max(...analysis.map(({ load }) => load))
    : 0;
  const loadTolerance = Math.max(0.01, maxLoad * 0.005);
  const sameLoad = (a, b) => Math.abs(a - b) <= loadTolerance;
  const peakCandidates = analysis.filter(({ load }) => sameLoad(load, maxLoad));
  const peakIndex = peakCandidates.length ? peakCandidates[0].index : automatic[0].index;
  const peakReps = medianNumber(peakCandidates.map(({ reps }) => reps));
  const distinctLoads = new Set(
    analysis.map(({ load }) => Number(load.toFixed(4))),
  );
  const hasLoadSequence = maxLoad > 0 && distinctLoads.size > 1;
  const occurrencesAt = (load) => analysis.filter((item) => sameLoad(item.load, load)).length;
  const hasLowerAfterPeak = analysis.some(
    ({ index, load }) => index > peakIndex && load < maxLoad - loadTolerance,
  );

  const resolvedSets = sets.map((set, index) => {
    if (!isAutomaticRole(set)) return set;
    const load = representativeSetLoad(set);
    const reps = representativeSetReps(set);
    const source = normalizeSetRoleSource(set.roleSource, set.role);
    const recordedRole = source === 'legacy_default'
      ? 'working'
      : normalizeSetRole(set.recordedRole || 'auto');
    let role = 'working';
    let confidence = 'moderate';
    let reason = 'Repeated at one load, so it is treated as productive work.';

    if (!set.completed || reps <= 0) {
      role = 'failed_attempt';
      confidence = 'high';
      reason = 'Zero completed repetitions cannot count as successful work.';
    } else if (!hasLoadSequence) {
      role = 'working';
      confidence = maxLoad > 0 && automatic.length > 1 ? 'moderate' : 'low';
      reason = maxLoad > 0 && automatic.length > 1
        ? 'All logged sets used the same load.'
        : maxLoad > 0
          ? 'A single completed set is treated as baseline work until more sets are logged.'
        : 'No comparable external load was available, so completed sets are treated as work.';
    } else if (sameLoad(load, maxLoad)) {
      const isFirstPeak = index === peakIndex;
      role = isFirstPeak ? 'top_set' : 'working';
      confidence = hasLowerAfterPeak || peakCandidates.length > 1 ? 'high' : 'moderate';
      reason = isFirstPeak
        ? 'This is the first set at the session’s heaviest load.'
        : 'This repeats the session’s heaviest load after the first top set.';
    } else if (index > peakIndex && load < maxLoad - loadTolerance) {
      role = 'back_off';
      confidence = load <= maxLoad * 0.9 ? 'high' : 'moderate';
      reason = 'The load decreased after the session’s heaviest set.';
    } else if (index < peakIndex) {
      const loadRatio = maxLoad > 0 ? load / maxLoad : 1;
      const repeatedLoad = occurrencesAt(load) > 1;
      const looksLikeProductivePyramidWork = loadRatio >= 0.85
        && reps >= Math.max(profile.repMin, peakReps)
        && !repeatedLoad;
      if (loadRatio <= 0.5) {
        role = 'warmup';
        confidence = 'high';
        reason = 'This early load was at most half of the session’s heaviest load.';
      } else if (repeatedLoad && reps >= profile.repMin) {
        role = 'working';
        confidence = 'moderate';
        reason = 'This load was repeated in the exercise’s productive rep range.';
      } else if (looksLikeProductivePyramidWork) {
        role = 'working';
        confidence = 'low';
        reason = 'This near-peak set fits the productive rep range; it may be pyramid work.';
      } else {
        role = 'ramp';
        confidence = loadRatio < 0.75 ? 'high' : 'moderate';
        reason = 'This was an earlier, lighter exposure before the session’s heaviest load.';
      }
    }

    return {
      ...set,
      role,
      roleSource: source,
      recordedRole,
      roleConfidence: confidence,
      roleReason: reason,
      classificationVersion: 1,
    };
  });

  return { ...exercise, sets: resolvedSets };
}

function formatSetContext(set, { includeRole = true } = {}) {
  if (!set || typeof set !== 'object') return '';
  const parts = [];
  const role = normalizeSetRole(set.role);
  if (includeRole && role !== 'unknown') {
    const source = normalizeSetRoleSource(set.roleSource, role);
    if (role === 'auto') parts.push('Auto-detecting');
    else if (source === 'auto' || source === 'legacy_default') {
      parts.push(`Auto: ${SET_ROLE_OPTIONS[role]}`);
    } else parts.push(SET_ROLE_OPTIONS[role]);
  }
  const rir = normalizeRir(set.rir);
  if (rir != null) parts.push(`${formatGoalNumber(rir)} RIR`);
  const technique = normalizeTechnique(set.technique);
  if (technique !== 'unknown') parts.push(`Technique: ${TECHNIQUE_OPTIONS[technique]}`);
  const pain = normalizePain(set.pain);
  if (pain !== 'none' && pain !== 'unknown') parts.push(`Pain: ${PAIN_OPTIONS[pain]}`);
  return parts.join(' • ');
}

function normalizeExercise(e) {
  const source = e && typeof e === 'object' ? e : {};
  const isSuperset = !!source.isSuperset;
  const isCardio = !!source.isCardio;
  const exerciseShape = {
    name: String(source.name || 'Unknown'),
    isSuperset,
    isCardio,
  };
  const sets = Array.isArray(source.sets)
    ? source.sets
      .map((set, index) => normalizeSet({ ...(set || {}), set: index + 1 }))
      .filter((set) => isValidNormalizedSet(set, exerciseShape))
      .map((set, index) => ({ ...set, set: index + 1 }))
    : [];
  const base = {
    name: exerciseShape.name,
    isSuperset,
    isCardio,
    exercises: isSuperset
      ? Array.isArray(source.exercises)
        ? source.exercises.slice(0, 10).map((name) => trimString(name, 80)).filter(Boolean)
        : []
      : undefined,
    sets,
    nextSet: sets.length + 1,
  };
  base.progressionProfile = normalizeExerciseProfile(
    source.progressionProfile || source.profile,
  );
  if (isSuperset && source.progressionProfiles && typeof source.progressionProfiles === 'object') {
    base.progressionProfiles = {};
    Object.entries(source.progressionProfiles).forEach(([name, profile]) => {
      const key = exerciseGoalKey(name);
      if (key) base.progressionProfiles[key] = normalizeExerciseProfile(profile);
    });
  }
  const goal = normalizeExerciseGoal(source.goal, source.name);
  if (goal) base.goal = goal;
  if (Array.isArray(source.exerciseGoals)) {
    const exerciseGoals = source.exerciseGoals
      .map((item) => normalizeExerciseGoal(item, item && item.exerciseName))
      .filter(Boolean);
    if (exerciseGoals.length) base.exerciseGoals = exerciseGoals;
  }
  return base;
}

// input can be session-like arrays or exported payload
function normalizePayload(payload) {
  if (!payload)
    return {
      date: getLocalDateString(),
      timestamp: new Date().toISOString(),
      totalExercises: 0,
      totalSets: 0,
      exercises: [],
      schema: WT_SCHEMA_VERSION,
    };
  if (Array.isArray(payload)) {
    const exs = payload
      .filter((exercise) => exercise && typeof exercise === 'object')
      .map(normalizeExercise);
    const totalSets = exs.reduce((s, e) => s + e.sets.length, 0);
    return {
      date: getLocalDateString(),
      timestamp: new Date().toISOString(),
      totalExercises: exs.length,
      totalSets,
      exercises: exs,
      schema: WT_SCHEMA_VERSION,
    };
  }
  // v1/v2 exported object
  const declaredSchema = Number(payload.schema);
  if (Number.isFinite(declaredSchema) && declaredSchema > 0 && declaredSchema < 9) {
    payload = migrateSetRoleProvenance(payload).value;
  }
  const exs = Array.isArray(payload.exercises)
    ? payload.exercises
      .filter((exercise) => exercise && typeof exercise === 'object')
      .map(normalizeExercise)
    : [];
  const totalSets = exs.reduce((s, e) => s + e.sets.length, 0);
  const date = String(payload.date || getLocalDateString());
  const ts = String(payload.timestamp || new Date().toISOString());
  const normalized = {
    date,
    timestamp: ts,
    totalExercises: exs.length,
    totalSets,
    exercises: exs,
    schema: WT_SCHEMA_VERSION,
  };
  const goals = sanitizeGoals(payload.goals);
  if (goals.length) normalized.goals = goals.map((g) => g.text);
  const constraints = sanitizeConstraints(payload.constraints);
  if (hasConstraints(constraints)) normalized.constraints = constraints;
  const highlights = sanitizeExerciseHighlights(payload.exerciseHighlights);
  if (highlights.length) normalized.exerciseHighlights = highlights;
  if (payload.sessionContext && typeof payload.sessionContext === 'object') {
    normalized.sessionContext = buildSessionPlanningContext(
      payload.sessionContext.status,
      payload.sessionContext.nextWorkoutMinutes,
    );
  }
  return normalized;
}

const MAX_GOALS = 10;
const MAX_NOTES = 6;
const MAX_NOTE_LENGTH = 160;
const DEFAULT_CONSTRAINTS = {
  scheduleNotes: [],
  avoidAreas: [],
};

const SESSION_STATUS_OPTIONS = Object.freeze({
  complete: 'Completed as planned',
  time_limited: 'Stopped because time ran out',
  pain_limited: 'Stopped because of pain or discomfort',
  recovery_limited: 'Reduced because recovery/readiness was poor',
  other_incomplete: 'Incomplete for another reason',
});

function normalizeSessionStatus(value) {
  return Object.prototype.hasOwnProperty.call(SESSION_STATUS_OPTIONS, value)
    ? value
    : 'complete';
}

function normalizeWorkoutMinutes(value) {
  if (value === '' || value === null || value === undefined) return null;
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes >= 15 && minutes <= 360
    ? minutes
    : null;
}

// Local date string in the same format calendar.js uses (YYYY-MM-DD, local time)
function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSessionPlanningContext(status, nextWorkoutMinutes) {
  const normalizedStatus = normalizeSessionStatus(status);
  const minutes = normalizeWorkoutMinutes(nextWorkoutMinutes);
  const mustDoTargetMinutes = minutes == null ? null : Math.floor(minutes * 0.9);
  return {
    status: normalizedStatus,
    statusLabel: SESSION_STATUS_OPTIONS[normalizedStatus],
    isIncomplete: normalizedStatus !== 'complete',
    nextWorkoutMinutes: minutes,
    mustDoTargetMinutes,
    timeBufferMinutes: minutes == null ? null : minutes - mustDoTargetMinutes,
  };
}

function trimString(input, maxLength = 200) {
  return String(input || '').trim().slice(0, maxLength);
}

function dedupeStrings(list, limit = 10, maxLength = 120) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const value = trimString(item, maxLength);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out.slice(0, limit);
}

function normalizeGoalEntry(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const text = trimString(item, 140);
    if (!text) return null;
    return { text, active: true };
  }
  if (typeof item === 'object') {
    const text = trimString(item.text || item.name || '', 140);
    if (!text) return null;
    return { text, active: !!item.active };
  }
  return null;
}

function sanitizeGoals(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Map();
  value.forEach((item) => {
    const norm = normalizeGoalEntry(item);
    if (!norm) return;
    const key = norm.text.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, norm);
    } else if (norm.active) {
      seen.get(key).active = true;
    }
  });
  return Array.from(seen.values()).slice(0, MAX_GOALS);
}

function sanitizeConstraints(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONSTRAINTS };
  const out = { ...DEFAULT_CONSTRAINTS };
  out.scheduleNotes = dedupeStrings(value.scheduleNotes, MAX_NOTES, MAX_NOTE_LENGTH);
  out.avoidAreas = dedupeStrings(value.avoidAreas, 8, 40);
  return out;
}

function hasConstraints(constraints) {
  if (!constraints) return false;
  return constraints.scheduleNotes.length > 0 || constraints.avoidAreas.length > 0;
}

function sanitizeConsistency(value) {
  if (!value || typeof value !== 'object') return null;
  const safeNumber = (n) => {
    const num = Number(n);
    return Number.isFinite(num) ? num : null;
  };
  const out = {};
  if (value.past7) {
    out.past7 = {
      daysTrained: safeNumber(value.past7.daysTrained) ?? 0,
      totalSets: safeNumber(value.past7.totalSets) ?? 0,
    };
  }
  if (value.past30) {
    out.past30 = {
      daysTrained: safeNumber(value.past30.daysTrained) ?? 0,
      totalSets: safeNumber(value.past30.totalSets) ?? 0,
    };
  }
  if (value.streakDays != null) {
    out.streakDays = safeNumber(value.streakDays) ?? 0;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeExerciseHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = trimString(item.name, 80);
      if (!name) return null;
      const parsed = {
        name,
        today: trimString(item.today, 120) || null,
        trend: trimString(item.trend, 160) || null,
        previous: Array.isArray(item.previous)
          ? item.previous.slice(0, 3).map((entry) => trimString(entry, 120)).filter(Boolean)
          : [],
        isPR: !!item.isPR,
      };
      return parsed;
    })
    .filter(Boolean);
}

function parseYMD(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

function formatYMD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr) {
  const parsed = parseYMD(dateStr);
  if (!parsed) return String(dateStr || '');
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatSecondsHuman(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatVolumeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Math.round(num).toLocaleString();
}

function formatTopSet(ts) {
  if (!ts || typeof ts.weight !== 'number' || typeof ts.reps !== 'number') return '-';
  return `${ts.weight}×${ts.reps}`;
}

function formatPercentChange(newVal, oldVal) {
  const a = Number(newVal);
  const b = Number(oldVal);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 'N/A';
  const pct = ((a - b) / b) * 100;
  const rounded = pct.toFixed(1);
  return `${pct >= 0 ? '+' : ''}${rounded}%`;
}

function formatDistanceMiles(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${num.toFixed(2)} mi`;
}

function roundToStep(value, step = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num / step) * step;
}

function describeConstraintsLines(constraints) {
  if (!constraints) return [];
  const lines = [];
  if (Array.isArray(constraints.scheduleNotes) && constraints.scheduleNotes.length) {
    constraints.scheduleNotes.forEach((note) => {
      const text = trimString(note, MAX_NOTE_LENGTH);
      if (text) lines.push(`Schedule: ${text}`);
    });
  }
  if (Array.isArray(constraints.avoidAreas) && constraints.avoidAreas.length) {
    lines.push(`Avoid Emphasis: ${constraints.avoidAreas.join(', ')}`);
  }
  return lines;
}

function estimateE1rmEnsemble(weight, effectiveReps, maximumEffectiveReps = 10) {
  const safeWeight = Number(weight);
  const safeReps = Number(effectiveReps);
  if (
    !Number.isFinite(safeWeight) || safeWeight <= 0
    || !Number.isFinite(safeReps) || safeReps < 1
    || safeReps > maximumEffectiveReps
  ) {
    return null;
  }
  const formulas = safeReps === 1
    ? [safeWeight, safeWeight, safeWeight]
    : [
      safeWeight * (1 + (safeReps / 30)),
      safeWeight * (36 / (37 - safeReps)),
      (100 * safeWeight) / (101.3 - (2.67123 * safeReps)),
    ];
  const sorted = formulas.slice().sort((a, b) => a - b);
  const estimate = sorted[1];
  return {
    estimate,
    formulaSpread: (sorted[2] - sorted[0]) / 2,
  };
}

function estimateRepsAtLoad(e1rm, load, targetRir = 0) {
  const max = Number(e1rm);
  const nextLoad = Number(load);
  const rir = normalizeRir(targetRir) ?? 0;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(nextLoad) || nextLoad <= 0) {
    return null;
  }
  const effectiveRepPredictions = [
    30 * ((max / nextLoad) - 1),
    37 - ((36 * nextLoad) / max),
    (101.3 - ((100 * nextLoad) / max)) / 2.67123,
  ].filter((value) => Number.isFinite(value));
  if (effectiveRepPredictions.length !== 3) return null;
  const sorted = effectiveRepPredictions.sort((a, b) => a - b);
  return Number(Math.max(0, sorted[1] - rir).toFixed(1));
}

function estimateNextLoadFeasibility(sets, nextLoad, targetRir, repMin) {
  if (!Array.isArray(sets) || !sets.length) return null;
  const predictions = sets.map((set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    const rir = normalizeRir(set.rir);
    if (rir == null || !Number.isFinite(reps) || reps < 1) return null;
    const ensemble = estimateE1rmEnsemble(weight, reps + Math.min(4, rir), 15);
    return ensemble
      ? estimateRepsAtLoad(ensemble.estimate, nextLoad, targetRir)
      : null;
  });
  if (predictions.some((value) => value == null)) return null;
  const predictedMinimumReps = Math.min(...predictions);
  return {
    predictedMinimumReps,
    preservesRepMinimum: predictedMinimumReps >= Number(repMin),
  };
}

function estimateE1rmFromSet(set) {
  if (!isProgressionSet(set)) return null;
  if (normalizePain(set.pain) === 'stopped' || normalizeTechnique(set.technique) === 'poor') {
    return null;
  }
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const rir = normalizeRir(set.rir);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) {
    return null;
  }
  const effectiveReps = reps + (rir == null ? 0 : Math.min(4, rir));
  const ensemble = estimateE1rmEnsemble(weight, effectiveReps, 10);
  if (!ensemble) return null;
  const { estimate, formulaSpread } = ensemble;
  const uncertainty = Math.max(
    formulaSpread,
    estimate * (effectiveReps <= 3 ? 0.05 : effectiveReps <= 6 ? 0.07 : 0.10),
  );
  const confidence = rir != null && normalizeTechnique(set.technique) === 'good'
    ? (effectiveReps <= 6 ? 'HIGH' : 'MODERATE')
    : 'LOW';
  return {
    estimate: Number(estimate.toFixed(1)),
    uncertainty: Number(uncertainty.toFixed(1)),
    lowerBound: weight,
    effectiveReps: Number(effectiveReps.toFixed(1)),
    model: 'Median of Epley, Brzycki, and Lander formulas',
    confidence,
  };
}

function computeSessionStats(payload) {
  const date = payload && payload.date ? String(payload.date) : null;
  const rawExercises = Array.isArray(payload && payload.exercises)
    ? payload.exercises
    : [];
  const exercises = rawExercises
    .filter((exercise) => exercise && typeof exercise === 'object')
    .map((exercise) => classifyExerciseSets(exercise));
  const map = new Map();
  const totalSets = exercises.reduce(
    (sum, exercise) => sum + (Array.isArray(exercise?.sets) ? exercise.sets.length : 0),
    0,
  );
  let totalVolume = 0;
  let totalCardioDuration = 0;
  const roleCounts = {
    auto: 0,
    warmup: 0,
    ramp: 0,
    working: 0,
    top_set: 0,
    back_off: 0,
    technique: 0,
    failed_attempt: 0,
    unknown: 0,
  };
  const roleSourceCounts = {
    auto: 0,
    manual: 0,
    legacy_default: 0,
    system: 0,
  };

  exercises.forEach((exercise) => {
    (exercise?.sets || []).forEach((set) => {
      if (exercise.isCardio) return;
      const strengthEntries = exercise.isSuperset
        ? (set.exercises || []).map((inner) => ({ ...set, ...inner, exercises: undefined }))
        : [set];
      strengthEntries.forEach((strengthSet) => {
        const role = normalizeSetRole(strengthSet.role);
        const source = normalizeSetRoleSource(strengthSet.roleSource, role);
        roleCounts[role] += 1;
        roleSourceCounts[source] += 1;
      });
    });
  });

  const ensureEntry = (name, type, profile = null) => {
    if (!map.has(name)) {
      map.set(name, {
        name,
        type,
        profile: type === 'strength' ? normalizeExerciseProfile(profile) : null,
        totalSets: 0,
        progressionSetCount: 0,
        failedAttemptCount: 0,
        unknownSetCount: 0,
        autoClassifiedSetCount: 0,
        totalVolume: 0,
        workingVolume: 0,
        totalDuration: 0,
        totalDistance: 0,
        topSet: null,
        bestDescription: null,
        longestDuration: 0,
        strengthSets: [],
        e1rm: null,
      });
    }
    return map.get(name);
  };

  const recordStrengthSet = (name, rawSet, profile) => {
    const set = normalizeSet(rawSet);
    const entry = ensureEntry(name, 'strength', profile);
    entry.totalSets += 1;
    entry.strengthSets.push(set);
    const weight = coercePositiveNumber(set.weight);
    const reps = Math.max(0, Math.floor(coercePositiveNumber(set.reps)));
    const volume = set.completed === false ? 0 : weight * reps;
    entry.totalVolume += volume;
    totalVolume += volume;
    if (normalizeSetRole(set.role) === 'failed_attempt') entry.failedAttemptCount += 1;
    if (normalizeSetRole(set.role) === 'unknown') entry.unknownSetCount += 1;
    if (['auto', 'legacy_default'].includes(normalizeSetRoleSource(set.roleSource, set.role))) {
      entry.autoClassifiedSetCount += 1;
    }

    const validPerformance = isProgressionSet(set)
      && normalizePain(set.pain) !== 'stopped'
      && normalizeTechnique(set.technique) !== 'poor';
    if (!validPerformance) return;

    entry.progressionSetCount += 1;
    entry.workingVolume += volume;
    if (
      !entry.topSet
      || weight > entry.topSet.weight
      || (weight === entry.topSet.weight && reps > entry.topSet.reps)
    ) {
      entry.topSet = { ...set, weight, reps };
      entry.bestDescription = `${weight} lbs × ${reps} rep${reps === 1 ? '' : 's'}`;
    }
    const estimate = estimateE1rmFromSet(set);
    if (estimate && (!entry.e1rm || estimate.estimate > entry.e1rm.estimate)) {
      entry.e1rm = estimate;
    }
  };

  const recordCardioSet = (name, duration, distance) => {
    const entry = ensureEntry(name, 'cardio');
    entry.totalSets += 1;
    entry.totalDuration += duration;
    totalCardioDuration += duration;
    if (Number.isFinite(distance) && distance > 0) entry.totalDistance += distance;
    if (!entry.bestDescription || duration > entry.longestDuration) {
      entry.longestDuration = duration;
      const distanceText = Number.isFinite(distance) && distance > 0
        ? `${distance} mi in ${formatSecondsHuman(duration)}`
        : `${formatSecondsHuman(duration)}`;
      entry.bestDescription = distanceText;
    }
  };

  exercises.forEach((exercise) => {
    if (exercise && exercise.isSuperset) {
      (exercise.sets || []).forEach((set) => {
        (set.exercises || []).forEach((inner) => {
          recordStrengthSet(
            trimString(inner.name || exercise.name || 'Exercise', 80),
            { ...set, ...inner, exercises: undefined },
            exercise.progressionProfiles?.[exerciseGoalKey(inner.name)]
              || inner.progressionProfile
              || exercise.progressionProfile,
          );
        });
      });
    } else if (exercise && exercise.isCardio) {
      (exercise.sets || []).forEach((set) => {
        const duration = Math.max(0, Math.floor(coercePositiveNumber(set.duration)));
        const parsedDistance = Number(set.distance);
        const distance = set.distance != null && Number.isFinite(parsedDistance) && parsedDistance >= 0
          ? parsedDistance
          : null;
        recordCardioSet(trimString(exercise.name || 'Cardio', 80), duration, distance);
      });
    } else if (exercise) {
      (exercise.sets || []).forEach((set) => {
        recordStrengthSet(
          trimString(exercise.name || 'Exercise', 80),
          set,
          exercise.progressionProfile,
        );
      });
    }
  });

  return {
    date,
    sessionContext: payload?.sessionContext || null,
    totalSets,
    totalVolume,
    totalCardioDuration,
    roleCounts,
    roleSourceCounts,
    progressionSetCount: roleCounts.working + roleCounts.top_set + roleCounts.back_off,
    warmupSetCount: roleCounts.warmup + roleCounts.ramp,
    failedAttemptCount: roleCounts.failed_attempt,
    exercises: Array.from(map.values()).map((entry) => ({
      ...entry,
      sessionContext: payload?.sessionContext || null,
    })),
  };
}

function getProgressionVolume(exerciseStats) {
  if (!exerciseStats || typeof exerciseStats !== 'object') return 0;
  if (Object.prototype.hasOwnProperty.call(exerciseStats, 'workingVolume')) {
    const workingVolume = Number(exerciseStats.workingVolume);
    return Number.isFinite(workingVolume) && workingVolume >= 0 ? workingVolume : 0;
  }
  const legacyTotal = Number(exerciseStats.totalVolume);
  return Number.isFinite(legacyTotal) && legacyTotal >= 0 ? legacyTotal : 0;
}

function buildStrengthDecisionSupport(
  current,
  previous = null,
  loadStep = null,
  additionalHistory = [],
) {
  if (
    !current ||
    current.type !== 'strength' ||
    !current.topSet ||
    !Number.isFinite(Number(current.topSet.weight)) ||
    !Number.isFinite(Number(current.topSet.reps))
  ) {
    return null;
  }

  const profile = normalizeExerciseProfile(current.profile);
  const topWeight = Number(current.topSet.weight);
  const topReps = Number(current.topSet.reps);
  const step = Number.isFinite(Number(loadStep)) && Number(loadStep) > 0
    ? Number(loadStep)
    : profile.loadStep;
  const strengthSets = Array.isArray(current.strengthSets)
    ? current.strengthSets
    : [];
  const validSets = strengthSets.filter(
    (set) => isProgressionSet(set)
      && normalizePain(set.pain) !== 'stopped'
      && normalizeTechnique(set.technique) !== 'poor',
  );
  const repeatedTopSets = validSets.filter(
    (set) => Number(set.weight) === topWeight,
  );
  const repeatedReps = repeatedTopSets
    .map((set) => Number(set.reps))
    .filter((reps) => Number.isFinite(reps) && reps > 0);
  const peakRepeatedReps = repeatedReps.length
    ? Math.max(...repeatedReps)
    : topReps;
  const finalRepeatedReps = repeatedReps.length
    ? repeatedReps[repeatedReps.length - 1]
    : topReps;
  const repDropPercent = repeatedReps.length > 1 && peakRepeatedReps > 0
    ? Math.max(
      0,
      ((peakRepeatedReps - finalRepeatedReps) / peakRepeatedReps) * 100,
    )
    : 0;
  const repDropCount = Math.max(0, peakRepeatedReps - finalRepeatedReps);
  const hasLargeRepDrop = repeatedReps.length > 1
    && repDropCount >= 2
    && repDropPercent >= 30
    && finalRepeatedReps < profile.repMin;
  const possibleRepeatedSetFatigue = repeatedReps.length >= 3
    && repDropPercent >= 20;
  const nextLoad = Number((topWeight + step).toFixed(2));
  const loadIncreasePercent = topWeight > 0
    ? ((nextLoad - topWeight) / topWeight) * 100
    : 0;
  const previousTopWeight = Number(previous?.topSet?.weight);
  const previousTopReps = Number(previous?.topSet?.reps);
  const previousStatus = previous?.sessionContext?.status || 'complete';
  const hasComparablePrevious = previousStatus !== 'pain_limited'
    && Number.isFinite(previousTopWeight)
    && Number.isFinite(previousTopReps);
  const previousProgressionVolume = getProgressionVolume(previous);
  const volumeRatio = hasComparablePrevious && previousProgressionVolume > 0
    ? getProgressionVolume(current) / previousProgressionVolume
    : null;

  const failedAttempts = strengthSets.filter(
    (set) => normalizeSetRole(set.role) === 'failed_attempt' || set.completed === false,
  );
  const painStopped = strengthSets.some((set) => normalizePain(set.pain) === 'stopped');
  const discomfortRecorded = strengthSets.some(
    (set) => normalizePain(set.pain) === 'discomfort',
  );
  const poorTechnique = strengthSets.some((set) => normalizeTechnique(set.technique) === 'poor');
  const minorTechnique = strengthSets.some((set) => normalizeTechnique(set.technique) === 'minor');
  const rirValues = validSets
    .map((set) => normalizeRir(set.rir))
    .filter((value) => value != null)
    .sort((a, b) => a - b);
  const medianRir = rirValues.length ? medianNumber(rirValues) : null;
  const knownBelowTargetRir = rirValues.some((rir) => rir < profile.targetRir);
  const hasLowConfidenceAutomaticRole = validSets.some(
    (set) => ['auto', 'legacy_default'].includes(normalizeSetRoleSource(set.roleSource, set.role))
      && set.roleConfidence === 'low',
  );
  const allRolesKnown = validSets.length > 0
    && validSets.every((set) => normalizeSetRole(set.role) !== 'unknown');
  const allRolesConfirmed = validSets.length > 0
    && validSets.every(
      (set) => normalizeSetRoleSource(set.roleSource, set.role) === 'manual',
    );
  const allTechniqueGood = validSets.length > 0
    && validSets.every((set) => normalizeTechnique(set.technique) === 'good');
  const allRirKnown = validSets.length > 0 && rirValues.length === validSets.length;
  const allPainKnown = validSets.length > 0
    && validSets.every((set) => normalizePain(set.pain) !== 'unknown');
  const nextLoadFeasibility = estimateNextLoadFeasibility(
    repeatedTopSets,
    nextLoad,
    profile.targetRir,
    profile.repMin,
  );
  const allAtTop = validSets.length > 0
    && validSets.every((set) => Number(set.reps) >= profile.repMax);
  const allWithinRange = validSets.length > 0
    && validSets.every((set) => Number(set.reps) >= profile.repMin);
  const previousSets = Array.isArray(previous?.strengthSets)
    ? previous.strengthSets.filter(
      (set) => isProgressionSet(set)
        && normalizePain(set.pain) !== 'stopped'
        && normalizeTechnique(set.technique) !== 'poor',
    )
    : [];
  const previousAllAtTop = previousSets.length > 0
    && previousStatus !== 'pain_limited'
    && previousStatus !== 'recovery_limited'
    && Number(previous?.topSet?.weight) === topWeight
    && previousSets.every((set) => Number(set.reps) >= profile.repMax)
    && previousSets.every((set) => normalizePain(set.pain) !== 'discomfort')
    && !(previous?.strengthSets || []).some(
      (set) => normalizeSetRole(set.role) === 'failed_attempt' || set.completed === false,
    );
  const previousRirValues = previousSets
    .map((set) => normalizeRir(set.rir))
    .filter((value) => value != null)
    .sort((a, b) => a - b);
  const previousMedianRir = previousRirValues.length
    ? medianNumber(previousRirValues)
    : null;
  const previousQualityKnown = previousSets.length > 0
    && previousSets.every(
      (set) => normalizeSetRole(set.role) !== 'unknown'
        && normalizeRir(set.rir) != null
        && normalizeTechnique(set.technique) === 'good'
        && normalizePain(set.pain) !== 'unknown',
    );
  const previousKnownTechniqueIssue = previousSets.some(
    (set) => ['minor', 'poor'].includes(normalizeTechnique(set.technique)),
  );
  const previousKnownBelowTargetRir = previousRirValues.some(
    (rir) => rir < profile.targetRir,
  );
  const previousHasLowConfidenceAutomaticRole = previousSets.some(
    (set) => ['auto', 'legacy_default'].includes(normalizeSetRoleSource(set.roleSource, set.role))
      && set.roleConfidence === 'low',
  );
  const olderComparableSessions = Array.isArray(additionalHistory)
    ? additionalHistory
    : [];
  const olderTopRangeCount = olderComparableSessions.filter((session) => {
    if (
      !session
      || session.sessionContext?.status === 'pain_limited'
      || session.sessionContext?.status === 'recovery_limited'
    ) return false;
    if (Number(session.topSet?.weight) !== topWeight) return false;
    const sets = Array.isArray(session.strengthSets)
      ? session.strengthSets.filter(
        (set) => isProgressionSet(set)
          && normalizePain(set.pain) !== 'stopped'
          && normalizeTechnique(set.technique) !== 'poor',
      )
      : [];
    return sets.length > 0
      && sets.every((set) => Number(set.reps) >= profile.repMax)
      && sets.every((set) => normalizePain(set.pain) !== 'discomfort')
      && sets.every((set) => normalizeTechnique(set.technique) !== 'minor')
      && sets.every((set) => {
        const rir = normalizeRir(set.rir);
        return rir == null || rir >= profile.targetRir;
      })
      && sets.every((set) => !(
        ['auto', 'legacy_default'].includes(normalizeSetRoleSource(set.roleSource, set.role))
        && set.roleConfidence === 'low'
      ))
      && !session.strengthSets.some(
        (set) => normalizeSetRole(set.role) === 'failed_attempt' || set.completed === false,
      );
  }).length;
  const outcomeBasedProgressionReady = profile.mode === 'auto'
    && allAtTop
    && previousAllAtTop
    && olderTopRangeCount >= 1;
  const shortRestLikely = repeatedTopSets.some((set, index) => {
    if (index >= repeatedTopSets.length - 1) return false;
    return Number.isFinite(Number(set.restActual))
      && Number.isFinite(Number(set.restPlanned))
      && Number(set.restActual) < Number(set.restPlanned) * 0.85;
  });

  let confidence = 'LOW';
  if (
    hasComparablePrevious
    && allRolesKnown
    && allRolesConfirmed
    && allTechniqueGood
    && allRirKnown
    && allPainKnown
    && previousQualityKnown
  ) {
    confidence = 'HIGH';
  } else if (hasComparablePrevious && validSets.length) {
    confidence = 'MODERATE';
  }

  let decision = 'HOLD';
  let reason = '';
  if (painStopped) {
    decision = 'STOP AND SEEK APPROPRIATE GUIDANCE';
    confidence = 'HIGH';
    reason = `pain stopped at least one set. Do not add load or sets; use a previously established pain-free alternative or seek appropriate assessment for concerning symptoms.`;
  } else if (current.sessionContext?.status === 'pain_limited') {
    decision = 'HOLD';
    reason = `the session was marked pain-limited. Do not progress load or sets from this session; identify the affected movement and use only a previously established pain-free alternative if training continues.`;
  } else if (discomfortRecorded) {
    decision = 'HOLD';
    reason = `discomfort was recorded. Do not add load or sets until the movement is pain-free at the required technique standard; use a previously established pain-free alternative if needed.`;
  } else if (poorTechnique) {
    decision = 'REDUCE LOAD';
    reason = `at least one set was marked poor or unsafe. Reduce load by the smallest practical amount and restore the full technique standard before progressing.`;
  } else if (current.sessionContext?.status === 'recovery_limited') {
    decision = 'HOLD';
    reason = `the session was marked recovery-limited. Preserve or reduce the prior prescription until a comparable recovered session confirms readiness to progress.`;
  } else if (failedAttempts.length) {
    decision = 'HOLD';
    reason = `${failedAttempts.length} failed attempt${failedAttempts.length === 1 ? ' was' : 's were'} recorded. A failed attempt is not a completed set, PR, or reason to add weight; base the next session on the heaviest successful high-quality work.`;
  } else if (minorTechnique) {
    decision = 'HOLD';
    reason = `a form breakdown was recorded. Keep load and sets stable until every progression set meets the required technique standard.`;
  } else if (knownBelowTargetRir) {
    decision = 'HOLD';
    reason = `at least one progression set finished below the saved ${formatGoalNumber(profile.targetRir)} RIR target. Keep load and sets stable until the prescribed effort is repeatable.`;
  } else if ((hasLargeRepDrop || possibleRepeatedSetFatigue) && shortRestLikely) {
    decision = 'INCREASE REST';
    const repSequence = repeatedReps.join('→');
    reason = `reps at ${formatGoalNumber(topWeight)} lbs fell ${repSequence} and actual rest was materially shorter than planned. Restore the prescribed rest before changing load or sets.`;
  } else if (hasLargeRepDrop) {
    const repSequence = repeatedReps.join('→');
    reason = `reps at ${formatGoalNumber(topWeight)} lbs fell ${repSequence}, with the final set below the saved ${profile.repMin}–${profile.repMax} range. Hold load and review rest, effort, and technique; one session does not diagnose fatigue.`;
  } else if (possibleRepeatedSetFatigue) {
    const repSequence = repeatedReps.join('→');
    reason = `reps at ${formatGoalNumber(topWeight)} lbs fell ${repSequence} across at least three same-load sets, crossing a conservative 20% fatigue screen. Hold load and sets, confirm planned rest, and compare another session; this screen is a heuristic, not a diagnosis.`;
  } else if (!hasComparablePrevious) {
    decision = 'TEST BASELINE';
    reason = `this is the first comparable session in the selected history. Repeat a conservative submaximal exposure and record set role, RIR, technique, and pain before making an aggressive change.`;
  } else if (
    hasComparablePrevious
    &&
    allAtTop
    && previousAllAtTop
    && allRirKnown
    && allPainKnown
    && medianRir >= profile.targetRir
    && allTechniqueGood
    && previousQualityKnown
    && previousMedianRir >= profile.targetRir
    && nextLoadFeasibility
    && !nextLoadFeasibility.preservesRepMinimum
  ) {
    reason = `two comparable sessions reached the top of the saved range, but the saved ${formatGoalNumber(step)} lb jump predicts only about ${formatGoalNumber(nextLoadFeasibility.predictedMinimumReps)} reps at the saved ${formatGoalNumber(profile.targetRir)} RIR target—below the ${profile.repMin}-rep minimum. Hold the load or change the rep range; do not add sets at the same time.`;
  } else if (
    hasComparablePrevious
    &&
    allAtTop
    && previousAllAtTop
    && allRirKnown
    && allPainKnown
    && medianRir >= profile.targetRir
    && allTechniqueGood
    && previousQualityKnown
    && previousMedianRir >= profile.targetRir
  ) {
    decision = 'ADD LOAD';
    const feasibilityText = nextLoadFeasibility
      ? ` The formula ensemble estimates at least about ${formatGoalNumber(nextLoadFeasibility.predictedMinimumReps)} reps at ${formatGoalNumber(profile.targetRir)} RIR after rounding; this is a conservative feasibility check, not a guarantee.`
      : ` Load feasibility could not be modeled reliably, so the completed-set evidence—not the estimate—remains the basis for this change.`;
    reason = `two comparable sessions reached the top of the saved ${profile.repMin}–${profile.repMax} range at or above the saved ${formatGoalNumber(profile.targetRir)} RIR target with good technique. Add only the saved ${formatGoalNumber(step)} lb increment, return toward the lower end of the range, and do not add sets at the same time.${feasibilityText}`;
  } else if (
    outcomeBasedProgressionReady
    && nextLoadFeasibility
    && !nextLoadFeasibility.preservesRepMinimum
  ) {
    reason = `three comparable successful workouts reached the top of the automatic ${profile.repMin}–${profile.repMax} range, but the saved ${formatGoalNumber(step)} lb jump predicts fewer than ${profile.repMin} reps. Hold this weight and keep building clean reps; the equipment jump is too large for the current range.`;
  } else if (
    outcomeBasedProgressionReady
    && !previousKnownTechniqueIssue
    && !previousKnownBelowTargetRir
    && !hasLowConfidenceAutomaticRole
    && !previousHasLowConfidenceAutomaticRole
  ) {
    decision = 'ADD LOAD';
    confidence = allPainKnown && allTechniqueGood ? 'HIGH' : 'MODERATE';
    reason = `three comparable successful workouts at ${formatGoalNumber(topWeight)} lbs reached the top of the automatic ${profile.repMin}–${profile.repMax} range. Add only the saved ${formatGoalNumber(step)} lb increment, return to the lower end of the range, and keep sets unchanged. This outcome-based rule lets automatic coaching progress without requiring technical effort ratings.`;
  } else if (allAtTop) {
    reason = `all progression sets reached the top of the saved ${profile.repMin}–${profile.repMax} range, but another comparable high-quality exposure or missing RIR, technique, or pain evidence is needed before adding load.`;
  } else if (allWithinRange) {
    decision = 'ADD REPS';
    reason = `all progression sets stayed inside the saved ${profile.repMin}–${profile.repMax} range. Keep load and sets stable and target one additional total clean repetition before considering more weight.`;
  } else if (
    topWeight < previousTopWeight ||
    (
      current.sessionContext?.status === 'complete'
      && volumeRatio !== null
      && volumeRatio < 0.9
    )
  ) {
    reason = `performance was below the previous comparable session. Keep the load stable or reduce it if needed to restore clean, repeatable work before progressing.`;
  } else {
    reason = `there is not enough evidence to justify more weight. Match or improve clean reps at this load first, then progress one variable at a time.`;
  }

  const missingEvidence = [];
  if (!hasComparablePrevious) missingEvidence.push('comparable prior session');
  if (hasComparablePrevious && !previousQualityKnown) {
    missingEvidence.push('complete RIR, technique, pain, and role data for the prior session');
  }
  if (!allRolesKnown) missingEvidence.push('set role');
  if (!allRirKnown) missingEvidence.push('RIR');
  if (!allTechniqueGood) missingEvidence.push('confirmed good technique on every eligible set');
  if (!allPainKnown) missingEvidence.push('pain status');
  const evidenceTrace = {
    observed: [
      `${validSets.length} eligible progression set${validSets.length === 1 ? '' : 's'}`,
      `Top successful set ${formatGoalNumber(topWeight)} lbs × ${topReps}`,
      repeatedReps.length > 1
        ? `Same-load reps ${repeatedReps.join('→')}`
        : null,
    ].filter(Boolean),
    estimated: [
      current.e1rm
        ? `Model-derived e1RM ${formatGoalNumber(current.e1rm.estimate)} ± ${formatGoalNumber(current.e1rm.uncertainty)} lbs`
        : null,
      nextLoadFeasibility
        ? `About ${formatGoalNumber(nextLoadFeasibility.predictedMinimumReps)} minimum reps predicted at ${formatGoalNumber(profile.targetRir)} RIR after the saved load jump`
        : null,
    ].filter(Boolean),
    heuristic: [
      'Progress one primary variable at a time',
      outcomeBasedProgressionReady
        ? 'Three-exposure outcome fallback used because technical effort data are optional'
        : null,
      possibleRepeatedSetFatigue
        ? '20% repeated-set rep-loss screen; requires confirmation and is not diagnostic'
        : null,
    ].filter(Boolean),
    missing: missingEvidence,
  };

  return {
    decision,
    topWeight,
    topReps,
    repeatedReps,
    repDropPercent: Number(repDropPercent.toFixed(1)),
    repRange: [profile.repMin, profile.repMax],
    targetRir: profile.targetRir,
    medianRir,
    confidence,
    e1rm: current.e1rm || null,
    nextLoad,
    predictedMinimumRepsAtNextLoad: nextLoadFeasibility?.predictedMinimumReps ?? null,
    nextLoadPreservesRepMinimum: nextLoadFeasibility?.preservesRepMinimum ?? null,
    loadIncreasePercent: Number(loadIncreasePercent.toFixed(1)),
    evidenceTrace,
    text: `${current.name} – ${decision} (${confidence} confidence): ${reason}${current.e1rm
      ? ` Model-derived e1RM range: ${formatGoalNumber(Math.max(current.e1rm.lowerBound, current.e1rm.estimate - current.e1rm.uncertainty))}–${formatGoalNumber(current.e1rm.estimate + current.e1rm.uncertainty)} lbs (${current.e1rm.confidence} estimate confidence; not a tested max).`
      : ''}`,
  };
}

function buildExerciseHighlightsForExport(currentStats, previousStats) {
  if (!currentStats || !Array.isArray(currentStats.exercises)) return [];
  const prevByName = new Map();
  previousStats.forEach((session) => {
    if (!session || !Array.isArray(session.exercises)) return;
    session.exercises.forEach((exercise) => {
      if (!exercise || !exercise.name) return;
      const key = exerciseGoalKey(exercise.name);
      if (!prevByName.has(key)) prevByName.set(key, []);
      prevByName.get(key).push({
        date: session.date,
        stats: exercise,
      });
    });
  });

  const highlights = [];
  currentStats.exercises.forEach((exercise) => {
    const name = exercise.name;
    const prevEntries = prevByName.get(exerciseGoalKey(name)) || [];
    const recent = prevEntries.slice(0, 3);
    const highlight = {
      name,
      today: null,
      trend: null,
      previous: [],
      isPR: false,
    };

    if (exercise.type === 'strength') {
      const description = exercise.bestDescription
        ? `${exercise.bestDescription}`
        : `${exercise.totalSets} sets completed`;
      highlight.today = `${description} (${exercise.totalSets} set${exercise.totalSets === 1 ? '' : 's'})`;

      const currentProgressionVolume = getProgressionVolume(exercise);
      const volumes = recent
        .map((entry) => getProgressionVolume(entry.stats))
        .filter((volume) => volume > 0);
      if (exercise.progressionSetCount === 0) {
        highlight.trend = 'No classified progression sets; trend withheld.';
      } else if (volumes.length) {
        const avgVolume =
          volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
        if (avgVolume > 0) {
          const delta = ((currentProgressionVolume - avgVolume) / avgVolume) * 100;
          highlight.trend = `${delta >= 0 ? '+' : ''}${delta.toFixed(
            1,
          )}% progression volume vs avg last ${volumes.length}`;
        }
        const maxPrevWeight = prevEntries.reduce((max, entry) => {
          const w =
            entry.stats.topSet && Number(entry.stats.topSet.weight)
              ? Number(entry.stats.topSet.weight)
              : 0;
          return Math.max(max, w);
        }, 0);
        const currentWeight =
          exercise.topSet && Number(exercise.topSet.weight)
            ? Number(exercise.topSet.weight)
            : 0;
        highlight.isPR = currentWeight > maxPrevWeight && maxPrevWeight > 0;
      } else {
        highlight.trend = "First recent strength session logged.";
      }
    } else if (exercise.type === 'cardio') {
      const distanceText = formatDistanceMiles(exercise.totalDistance);
      const durationText = formatSecondsHuman(exercise.totalDuration);
      const base = distanceText
        ? `${distanceText} in ${durationText}`
        : `${durationText} total`;
      highlight.today = `${base} (${exercise.totalSets} effort${exercise.totalSets === 1 ? '' : 's'})`;

      const durations = recent.map((entry) => entry.stats.totalDuration || 0);
      if (durations.length) {
        const avgDuration =
          durations.reduce((sum, value) => sum + value, 0) / durations.length;
        if (avgDuration > 0) {
          const delta =
            ((exercise.totalDuration - avgDuration) / avgDuration) * 100;
          highlight.trend = `${delta >= 0 ? '+' : ''}${delta.toFixed(
            1,
          )}% duration vs avg last ${durations.length}`;
        }
      } else {
        highlight.trend = "First recent cardio session logged.";
      }
    }

    highlight.previous = recent.map((entry) => {
      const stats = entry.stats;
      if (stats.type === 'strength') {
        const desc = stats.bestDescription
          ? stats.bestDescription
          : `${stats.totalSets} sets`;
        return `${formatShortDate(entry.date)}: ${desc}`;
      }
      const distanceText = formatDistanceMiles(stats.totalDistance);
      const durationText = formatSecondsHuman(stats.totalDuration);
      const base = distanceText
        ? `${distanceText} in ${durationText}`
        : durationText;
      return `${formatShortDate(entry.date)}: ${base}`;
    });

    highlights.push(highlight);
  });

  return highlights.slice(0, 6);
}

function getWorkoutExerciseRoster(payload) {
  const names = [];
  const seen = new Set();
  const addName = (value) => {
    const name = trimString(value || '', 80);
    const key = exerciseGoalKey(name);
    if (!name || !key || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  (payload?.exercises || []).forEach((exercise) => {
    if (!exercise) return;
    const loggedSets = Array.isArray(exercise.sets) ? exercise.sets : [];
    if (!loggedSets.length) return;
    if (exercise.isSuperset) {
      const countBefore = names.length;
      loggedSets.forEach((set) => {
        (set.exercises || []).forEach((inner) => addName(inner?.name));
      });
      if (names.length === countBefore) (exercise.exercises || []).forEach(addName);
      return;
    }
    addName(exercise.name);
  });

  return names;
}

function mergeWorkoutExercises(exercises) {
  const merged = [];
  (Array.isArray(exercises) ? exercises : [])
    .filter((exercise) => exercise && typeof exercise === 'object')
    .forEach((exercise) => {
      const normalized = normalizeExercise(exercise);
      if (!normalized.sets.length) return;
      const key = exerciseGoalKey(normalized.name);
      const existing = merged.find(
        (candidate) => exerciseGoalKey(candidate.name) === key
          && candidate.isSuperset === normalized.isSuperset
          && candidate.isCardio === normalized.isCardio,
      );
      if (!existing) {
        merged.push(normalized);
        return;
      }
      existing.progressionProfile = normalized.progressionProfile;
      if (normalized.progressionProfiles) {
        existing.progressionProfiles = {
          ...(existing.progressionProfiles || {}),
          ...normalized.progressionProfiles,
        };
      }
      normalized.sets.forEach((set) => {
        existing.sets.push({ ...set, set: existing.sets.length + 1 });
      });
      existing.nextSet = existing.sets.length + 1;
    });
  return merged.map((exercise) => classifyExerciseSets(exercise));
}

function buildExerciseSelectionReference(currentPayload) {
  const currentExercises = getWorkoutExerciseRoster(currentPayload);
  return {
    source: 'current_session_only',
    currentExercises,
    requiredExercises: [...currentExercises],
  };
}

function computeConsistencyMetricsFromStats(allStats, referenceDate) {
  if (!Array.isArray(allStats) || !allStats.length) return null;
  const refDate =
    parseYMD(referenceDate) || parseYMD(allStats[0] && allStats[0].date);
  if (!refDate) return null;

  const totalsByDate = new Map();
  allStats.forEach((session) => {
    if (!session || !session.date) return;
    const sessionSets = Number(session.totalSets);
    if (!Number.isFinite(sessionSets) || sessionSets <= 0) return;
    const key = session.date;
    const entry = totalsByDate.get(key) || { totalSets: 0 };
    entry.totalSets += sessionSets;
    totalsByDate.set(key, entry);
  });

  const gatherRange = (days) => {
    const trainedDates = new Set();
    let totalSets = 0;
    totalsByDate.forEach((value, key) => {
      const date = parseYMD(key);
      if (!date) return;
      const diff =
        (refDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (diff >= 0 && diff < days) {
        trainedDates.add(key);
        totalSets += value.totalSets;
      }
    });
    return { daysTrained: trainedDates.size, totalSets };
  };

  const past7 = gatherRange(7);
  const past30 = gatherRange(30);

  let streak = 0;
  const streakCursor = new Date(refDate.getTime());
  for (let i = 0; i < 120; i += 1) {
    const key = formatYMD(streakCursor);
    if (totalsByDate.has(key)) {
      streak += 1;
      streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return {
    past7,
    past30,
    streakDays: streak,
  };
}

function pruneArchive(map, limit = 90) {
  const entries = Object.entries(map || {}).filter(
    ([, value]) => value && typeof value === 'object',
  );
  entries.sort((a, b) => {
    if (a[0] === b[0]) return 0;
    return a[0] > b[0] ? -1 : 1;
  });
  if (entries.length <= limit) {
    return Object.fromEntries(entries);
  }
  return Object.fromEntries(entries.slice(0, limit));
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function appendUniqueHistoryLines(existing, incoming) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  incoming.forEach((line) => {
    if (!merged.includes(line)) merged.push(line);
  });
  return merged;
}

function upsertStructuredHistoryLines(existing, incoming) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  const identity = (line) => {
    const match = String(line || '').match(/^(.+?):\s*Set\s+(\d+)\s*-/i);
    return match ? `${exerciseGoalKey(match[1])}::${Number(match[2])}` : null;
  };
  (Array.isArray(incoming) ? incoming : []).forEach((line) => {
    const key = identity(line);
    if (key) {
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        if (identity(merged[index]) === key) merged.splice(index, 1);
      }
    } else if (merged.includes(line)) return;
    merged.push(line);
  });
  return merged;
}

function csvCell(value) {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(values) {
  return values.map(csvCell).join(",");
}

function formatCardioHistoryLine(name, set, fallbackSetNumber = 1) {
  const setNumber = set && set.set ? set.set : fallbackSetNumber;
  const distanceValue = Number(set && set.distance);
  const distance =
    set && set.distance !== null && set.distance !== undefined && Number.isFinite(distanceValue)
      ? `${distanceValue} mi in `
      : '';
  const duration = formatSecondsHuman(set && set.duration);
  return `${name}: Set ${setNumber} - ${distance}${duration}`;
}

// Merge imported exercises into wt_history lines (for charts and history)
function mergeIntoHistory(payload) {
  const hist = wtStorage.get(WT_KEYS.history, {});
  const day = String(payload.date);
  const lines = [];

  for (const ex of payload.exercises) {
    if (ex.isSuperset) {
      for (const [setIdx, s] of ex.sets.entries()) {
        const setNumber = s.set || setIdx + 1;
        for (const sub of s.exercises || []) {
          const role = normalizeSetRole(sub.role ?? s.role);
          lines.push(role === 'failed_attempt'
            ? `${sub.name}: Set ${setNumber} - Failed attempt at ${coercePositiveNumber(sub.weight)} lbs`
            : `${sub.name}: Set ${setNumber} - ${coercePositiveNumber(sub.weight)} lbs × ${Math.max(
              1,
              Math.floor(coercePositiveNumber(sub.reps)),
            )} reps`);
        }
      }
    } else if (ex.isCardio) {
      for (const [setIdx, s] of ex.sets.entries()) {
        lines.push(formatCardioHistoryLine(ex.name, s, setIdx + 1));
      }
    } else {
      for (const [setIdx, s] of ex.sets.entries()) {
        const setNumber = s.set || setIdx + 1;
        lines.push(normalizeSetRole(s.role) === 'failed_attempt'
          ? `${ex.name}: Set ${setNumber} - Failed attempt at ${coercePositiveNumber(s.weight)} lbs`
          : `${ex.name}: Set ${setNumber} - ${coercePositiveNumber(s.weight)} lbs × ${Math.max(
            1,
            Math.floor(coercePositiveNumber(s.reps)),
          )} reps`);
      }
    }
  }
  const curr = Array.isArray(hist[day]) ? hist[day] : [];
  hist[day] = upsertStructuredHistoryLines(curr, lines);
  wtStorage.set(WT_KEYS.history, hist);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('wt-history-updated'));
  }
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

function hasLocalStorage() {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

// in-memory fallback for tests / SSR
const memStore = new Map();

function lsGetRaw(k) {
  if (!hasLocalStorage()) return memStore.get(k) ?? null;
  return localStorage.getItem(k);
}
function lsSetRaw(k, v) {
  if (!hasLocalStorage()) { memStore.set(k, v); return; }
  localStorage.setItem(k, v);
}

function backupKey(k, n) { return `${k}.backup${n}`; } // .backup1..3

function writeWithBackups(key, valueStr, keepBackups = true) {
  // roll backups: 3 <- 2 <- 1 <- current
  const cur = lsGetRaw(key);
  if (keepBackups && cur !== null) {
    const backup2 = lsGetRaw(backupKey(key, 2));
    const backup1 = lsGetRaw(backupKey(key, 1));
    if (backup2 !== null) lsSetRaw(backupKey(key, 3), backup2);
    if (backup1 !== null) lsSetRaw(backupKey(key, 2), backup1);
    lsSetRaw(backupKey(key,1), cur);
  }
  // atomic-ish: write new value last
  lsSetRaw(key, valueStr);
}

function reportStorageFailure(error) {
  if (typeof console !== 'undefined') console.error('Workout Tracker could not save data.', error);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('wt-storage-error'));
  }
}

const wtStorage = {
  get(key, fallback) {
    const raw = lsGetRaw(key);
    if (raw === null) return fallback;
    return safeParse(raw, fallback);
  },
  set(key, obj) {
    try {
      const str = JSON.stringify(obj);
      // The archive is already a bounded derived history. Replicating it four times
      // can exhaust localStorage and prevent an active set from being saved.
      writeWithBackups(key, str, key !== WT_KEYS.archive && key !== WT_KEYS.completed);
      return true;
    } catch (error) {
      reportStorageFailure(error);
      return false;
    }
  },
  getRaw(key) { return lsGetRaw(key); },
  restoreBackup(key, validator = () => true) {
    // try newest → oldest
    for (let i=1;i<=3;i++) {
      const b = lsGetRaw(backupKey(key,i));
      if (b === null) continue;
      const parsed = safeParse(b, undefined);
      if (parsed !== undefined && validator(parsed)) {
        lsSetRaw(key, b);
        return true;
      }
    }
    return false;
  },
  clear(key) {
    if (!hasLocalStorage()) { memStore.delete(key); return; }
    localStorage.removeItem(key);
    for (let i=1;i<=3;i++) localStorage.removeItem(backupKey(key,i));
  }
};

function migrateSetRoleProvenance(value) {
  let changed = false;
  const visit = (input) => {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== 'object') return input;
    const out = {};
    Object.entries(input).forEach(([key, child]) => {
      out[key] = visit(child);
    });
    const setLike = Object.prototype.hasOwnProperty.call(out, 'set')
      || Object.prototype.hasOwnProperty.call(out, 'weight')
      || Object.prototype.hasOwnProperty.call(out, 'reps')
      || (Array.isArray(out.exercises) && out.exercises.some(
        (inner) => inner && typeof inner === 'object' && 'weight' in inner,
      ));
    if (!setLike || out.roleSource) return out;
    const role = out.role == null ? 'auto' : normalizeSetRole(out.role);
    if (role === 'working') {
      out.roleSource = 'legacy_default';
      out.recordedRole = 'working';
      changed = true;
    } else if (role === 'auto' || out.role == null) {
      out.role = 'auto';
      out.roleSource = 'auto';
      out.recordedRole = 'auto';
      changed = true;
    } else {
      out.roleSource = role === 'failed_attempt' ? 'system' : 'manual';
      changed = true;
    }
    if (out.roleSource === 'legacy_default' && Array.isArray(out.exercises)) {
      out.exercises = out.exercises.map((inner) => {
        if (!inner || typeof inner !== 'object' || !('weight' in inner)) return inner;
        return {
          ...inner,
          role: 'working',
          roleSource: 'legacy_default',
          recordedRole: 'working',
        };
      });
    }
    return out;
  };
  return { value: visit(value), changed };
}

// schema versioning (simple bootstrap)
(function ensureSchema() {
  const v = Number(lsGetRaw(WT_KEYS.schema)) || 0;
  if (v < WT_SCHEMA_VERSION) {
    if (v < 9) {
      [WT_KEYS.session, WT_KEYS.current, WT_KEYS.last, WT_KEYS.archive].forEach((key) => {
        const raw = lsGetRaw(key);
        if (raw === null) return;
        const parsed = safeParse(raw, null);
        if (parsed === null) return;
        const migrated = migrateSetRoleProvenance(parsed);
        if (migrated.changed) wtStorage.set(key, migrated.value);
      });
    }
    lsSetRaw(WT_KEYS.schema, String(WT_SCHEMA_VERSION));
  }
})();

/* ------------------ STATE ------------------ */
let session = { exercises: [], startedAt: null };
let currentExercise = null;
let needsRecoverSession = false;
let needsRecoverCurrent = false;
let needsSaveAfterNormalize = false;
let goals = sanitizeGoals(wtStorage.get(WT_KEYS.goals, []));
let constraints = sanitizeConstraints(wtStorage.get(WT_KEYS.constraints, DEFAULT_CONSTRAINTS));
let archivedSessions = wtStorage.get(WT_KEYS.archive, {});
if (!archivedSessions || typeof archivedSessions !== 'object' || Array.isArray(archivedSessions)) {
  archivedSessions = {};
}
let dayType = wtStorage.get(WT_KEYS.dayType, '');
let dayCompare = wtStorage.get(WT_KEYS.dayCompare, 'none');
let progressionGuard = !!wtStorage.get(WT_KEYS.progressionGuard, false);
if (progressionGuard && dayCompare === 'none') {
  dayCompare = '3';
  wtStorage.set(WT_KEYS.dayCompare, dayCompare);
}
const storedSessionStatus = wtStorage.get(WT_KEYS.sessionStatus, null);
let sessionStatus = normalizeSessionStatus(
  storedSessionStatus
    && storedSessionStatus.date === getLocalDateString()
    ? storedSessionStatus.value
    : 'complete',
);
let nextWorkoutMinutes = normalizeWorkoutMinutes(
  wtStorage.get(WT_KEYS.nextWorkoutMinutes, null),
);
let exerciseGoals = sanitizeExerciseGoals(wtStorage.get(WT_KEYS.exerciseGoals, {}));
if (Object.keys(exerciseGoals).length) {
  progressionGuard = true;
  wtStorage.set(WT_KEYS.progressionGuard, true);
  if (dayCompare === 'none') {
    dayCompare = '3';
    wtStorage.set(WT_KEYS.dayCompare, dayCompare);
  }
}
let exerciseProfiles = sanitizeExerciseProfiles(
  wtStorage.get(WT_KEYS.exerciseProfiles, {}),
);
if (typeof localStorage !== "undefined") {
  const s = wtStorage.get(WT_KEYS.session, null);
  const c = wtStorage.get(WT_KEYS.current, null);
  if (!s || typeof s !== 'object' || !Array.isArray(s.exercises)) needsRecoverSession = true;
  const currentRaw = wtStorage.getRaw(WT_KEYS.current);
  if (
    currentRaw !== null
    && c !== null
    && (typeof c !== 'object' || !Array.isArray(c.sets))
  ) needsRecoverCurrent = true;
  if (currentRaw !== null && c === null && currentRaw.trim() !== 'null') needsRecoverCurrent = true;
  session = s && typeof s === 'object' ? s : { exercises: [], startedAt: null };
  currentExercise = c || null;

  // sanity shape
  if (!Array.isArray(session.exercises)) session.exercises = [];
  if (session.startedAt) {
    const normalizedStartedAt = normalizeSessionStartedAt(session.startedAt);
    if (!normalizedStartedAt) {
      session.startedAt = null;
      needsSaveAfterNormalize = true;
    }
  }

  const normSession = session.exercises.map(normalizeExercise);
  if (JSON.stringify(normSession) !== JSON.stringify(session.exercises)) {
    session.exercises = normSession;
    needsSaveAfterNormalize = true;
  }
  if (currentExercise) {
    const normCurrent = normalizeExercise(currentExercise);
    if (JSON.stringify(normCurrent) !== JSON.stringify(currentExercise)) {
      currentExercise = normCurrent;
      needsSaveAfterNormalize = true;
    }
  }
}

let restTimer = null;
let restSecondsRemaining = 0;
let restStartMs = 0;
let restDeadlineMs = 0;
let restSetIndex = null;
let restTargetSet = null;

function canLogSet(w, r) {
  return Number.isFinite(w) && Number.isInteger(r) && w >= 0 && w <= 9999 && r > 0 && r <= 999;
}

function parseWorkoutNumber(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function canLogStrengthEntry(w, r, role = 'auto') {
  if (normalizeSetRole(role) === 'failed_attempt') {
    return Number.isFinite(w) && w >= 0 && w <= 9999 && r === 0;
  }
  return canLogSet(w, r);
}

function canLogCardio(distance, duration, name) {
  const durationOk = Number.isFinite(duration) && duration > 0 && duration <= 604800;
  const distanceMissing = distance === null;
  const allowsNoDistance = name === "Jump Rope" || name === "Plank";
  const distanceOk = allowsNoDistance
    ? distanceMissing || (Number.isFinite(distance) && distance >= 0 && distance <= 100000)
    : Number.isFinite(distance) && distance >= 0 && distance <= 100000;
  return distanceOk && durationOk;
}

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== "undefined" && document.getElementById("today")) {
  const todayEl = document.getElementById("today");
  const darkToggle = document.getElementById("darkToggle");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");
  const exerciseSelect = document.getElementById("exerciseSelect");
  const interfaceBox = document.getElementById("interface");
  const exerciseNameEl = document.getElementById("exerciseName");
  const setCounterEl = document.getElementById("setCounter");
  const weightInput = document.getElementById("weight");
  const repsInput = document.getElementById("reps");
  const logBtn = document.getElementById("logBtn");
  const setsList = document.getElementById("setsList");
  const summaryText = document.getElementById("summaryText");
  const nextExerciseBtn = document.getElementById("nextExerciseBtn");
  const finishBtn = document.getElementById("finishBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");
  const restBox = document.getElementById("restBox");
  const restDisplay = document.getElementById("restDisplay");
  const useTimerEl = document.getElementById("useTimer");
  const restSecsInput = document.getElementById("restSecsInput");
  const addExerciseBtn = document.getElementById("addExercise");
  const customExerciseInput = document.getElementById("customExercise");
  const startSupersetBtn = document.getElementById("startSuperset");
  const supersetInputs = document.getElementById("supersetInputs");
  const standardInputs = document.getElementById("standardInputs");
  const cardioInputs = document.getElementById("cardioInputs");
  const distanceInput = document.getElementById("distance");
  const durationMinInput = document.getElementById("durationMin");
  const durationSecInput = document.getElementById("durationSec");
  const supersetBuilder = document.getElementById("supersetBuilder");
  const supersetSelect1 = document.getElementById("supersetSelect1");
  const supersetSelect2 = document.getElementById("supersetSelect2");
  const beginSupersetBtn = document.getElementById("beginSuperset");
  const exerciseSearch = document.getElementById("exerciseSearch");
  const exerciseList = document.getElementById("exerciseList");
  const muscleFilter = document.getElementById("muscleFilter");
  const goalInput = document.getElementById("goalInput");
  const addGoalBtn = document.getElementById("addGoalBtn");
  const goalsChips = document.getElementById("goalsChips");
  const goalsEmpty = document.getElementById("goalsEmpty");
  const constraintInput = document.getElementById("constraintInput");
  const addConstraintBtn = document.getElementById("addConstraintBtn");
  const constraintsList = document.getElementById("constraintsList");
  const constraintsEmpty = document.getElementById("constraintsEmpty");
  const avoidAreaButtons = Array.from(
    document.querySelectorAll('[data-constraint-group="avoidAreas"] .chip-option'),
  );
  const dayTypeButtons = Array.from(
    document.querySelectorAll('.daytype-option'),
  );
  const compareButtons = Array.from(
    document.querySelectorAll('.compare-option'),
  );
  const dayTypeCustomInput = document.getElementById('dayTypeCustomInput');
  const addDayTypeCustomBtn = document.getElementById('addDayTypeCustomBtn');
  const exportHint = document.getElementById('exportHint');
  const resetContextBtn = document.getElementById('resetContextBtn');
  const progressionGuardToggle = document.getElementById('progressionGuardToggle');
  const sessionStatusSelect = document.getElementById('sessionStatus');
  const nextWorkoutMinutesInput = document.getElementById('nextWorkoutMinutes');
  const autoSetNote = document.getElementById('autoSetNote');
  const accuracyDetails = document.getElementById('accuracyDetails');
  const setAccuracyFields = document.getElementById('setAccuracyFields');
  const setRoleInput = document.getElementById('setRole');
  const setRirInput = document.getElementById('setRir');
  const setTechniqueInput = document.getElementById('setTechnique');
  const setPainInput = document.getElementById('setPain');
  const exercisePurposeInput = document.getElementById('exercisePurpose');
  const exerciseRepMinInput = document.getElementById('exerciseRepMin');
  const exerciseRepMaxInput = document.getElementById('exerciseRepMax');
  const exerciseTargetRirInput = document.getElementById('exerciseTargetRir');
  const exerciseLoadStepInput = document.getElementById('exerciseLoadStep');
  const exerciseCoachingModeInput = document.getElementById('exerciseCoachingMode');
  const customProfileFields = document.getElementById('customProfileFields');
  const automaticCoachingSummary = document.getElementById('automaticCoachingSummary');
  const saveExerciseProfileBtn = document.getElementById('saveExerciseProfile');
  const exerciseStage = document.getElementById('exerciseStage');
  const exerciseStageType = document.getElementById('exerciseStageType');
  const exerciseGoalPanel = document.getElementById('exerciseGoalPanel');
  const exerciseGoalToggle = document.getElementById('exerciseGoalToggle');
  const exerciseGoalHeading = document.getElementById('exerciseGoalHeading');
  const exerciseGoalAction = document.getElementById('exerciseGoalAction');
  const exerciseGoalStatus = document.getElementById('exerciseGoalStatus');
  const exerciseGoalBest = document.getElementById('exerciseGoalBest');
  const exerciseGoalTarget = document.getElementById('exerciseGoalTarget');
  const exerciseGoalRemaining = document.getElementById('exerciseGoalRemaining');
  const exerciseGoalProgressBar = document.getElementById('exerciseGoalProgressBar');
  const exerciseGoalInsight = document.getElementById('exerciseGoalInsight');
  const exerciseGoalCoachPlan = document.getElementById('exerciseGoalCoachPlan');
  const exerciseGoalForm = document.getElementById('exerciseGoalForm');
  const exerciseGoalExercise = document.getElementById('exerciseGoalExercise');
  const exerciseGoalExerciseLabel = document.getElementById('exerciseGoalExerciseLabel');
  const exerciseGoalType = document.getElementById('exerciseGoalType');
  const exerciseGoalPath = document.getElementById('exerciseGoalPath');
  const exerciseGoalPathField = document.getElementById('exerciseGoalPathField');
  const exerciseGoalPathHint = document.getElementById('exerciseGoalPathHint');
  const exerciseGoalValue = document.getElementById('exerciseGoalValue');
  const exerciseGoalValueLabel = document.getElementById('exerciseGoalValueLabel');
  const saveExerciseGoal = document.getElementById('saveExerciseGoal');
  const removeExerciseGoal = document.getElementById('removeExerciseGoal');
  const themePackButton = document.getElementById('themePackButton');
  const themePackLabel = document.getElementById('themePackLabel');
  const themePackSheet = document.getElementById('themePackSheet');
  const themePackBackdrop = document.getElementById('themePackBackdrop');
  const themePackClose = document.getElementById('themePackClose');
  const themePackOptions = Array.from(document.querySelectorAll('.theme-pack-option'));
  const themeTransition = document.getElementById('themeTransition');

  // --- Import UI ---
  function createConfirmModal(doc) {
    return (message, options = {}) => {
      const { title = 'Confirm', yesText = 'OK', noText = 'Cancel' } = options;
      return new Promise((resolve) => {
        const previousFocus = doc.activeElement;
        const modal = doc.createElement('div');
        modal.style.cssText = `
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 14000;
          display: flex; align-items: center; justify-content: center; padding: 12px;
        `;
        const dialog = doc.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', title);
        dialog.style.cssText = `
          background: #fff; color: #000; padding: 16px 20px; border-radius: 8px; width: 100%;
          max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        `;
        modal.dataset.wtModal = 'true';
        const heading = doc.createElement('h3');
        heading.style.cssText = 'margin:0 0 10px 0; font-size:18px;';
        heading.textContent = String(title);
        const body = doc.createElement('p');
        body.style.cssText = 'margin:0 0 16px 0; line-height:1.4;';
        body.textContent = String(message);
        const actions = doc.createElement('div');
        actions.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
        const cancelButton = doc.createElement('button');
        cancelButton.id = 'cmCancel';
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = String(noText);
        const okButton = doc.createElement('button');
        okButton.id = 'cmOk';
        okButton.type = 'button';
        okButton.className = 'btn';
        okButton.textContent = String(yesText);
        actions.appendChild(cancelButton);
        actions.appendChild(okButton);
        dialog.appendChild(heading);
        dialog.appendChild(body);
        dialog.appendChild(actions);
        modal.appendChild(dialog);
        doc.body.appendChild(modal);
        const cleanup = () => {
          doc.removeEventListener('keydown', handleKeydown);
          if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }
          if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
          }
        };
        const handleKeydown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            cleanup();
            resolve(false);
          } else if (event.key === 'Tab') {
            const first = cancelButton;
            const last = okButton;
            if (event.shiftKey && doc.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && doc.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        };
        doc.addEventListener('keydown', handleKeydown);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            cleanup();
            resolve(false);
          }
        });
        cancelButton.addEventListener('click', () => {
          cleanup();
          resolve(false);
        });
        okButton.addEventListener('click', () => {
          cleanup();
          resolve(true);
        });
        cancelButton.focus();
      });
    };
  }

  const confirmModal =
    typeof window !== 'undefined' && typeof window.wtConfirmModal === 'function'
      ? window.wtConfirmModal
      : createConfirmModal(document);

  if (typeof window !== 'undefined') {
    window.wtConfirmModal = confirmModal;
  }

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import JSON';
  importBtn.className = 'btn btn-secondary';
  exportBtn.insertAdjacentElement('afterend', importBtn);

  const pasteBtn = document.createElement('button');
  pasteBtn.textContent = 'Paste JSON';
  pasteBtn.className = 'btn btn-secondary';
  importBtn.insertAdjacentElement('afterend', pasteBtn);

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await handleImportText(ev.target.result);
    };
    reader.onerror = () => showToast('Import failed: invalid file');
    reader.readAsText(file);
    importInput.value = '';
  });

  /* ------------------ SESSION TIME PREF TOGGLE ------------------ */
  const toggleSessionPrefBtn = document.getElementById('toggleSessionPrefBtn');
  function updateSessionPrefButton() {
    const on = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
    toggleSessionPrefBtn.textContent = `Auto-include session time in export: ${on ? 'ON' : 'OFF'}`;
  }
  if (toggleSessionPrefBtn) {
    updateSessionPrefButton();
    toggleSessionPrefBtn.addEventListener('click', () => {
      const on = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
      wtStorage.set(WT_KEYS.prefSessionTime, !on);
      updateSessionPrefButton();
      showToast(`Always include session time ${!on ? 'enabled' : 'disabled'}.`);
    });
  }

  const toggleGoalProgressPrefBtn = document.getElementById('toggleGoalProgressPrefBtn');
  function updateGoalProgressPrefButton() {
    if (!toggleGoalProgressPrefBtn) return;
    const on = !!wtStorage.get(WT_KEYS.prefExerciseGoalProgress, false);
    toggleGoalProgressPrefBtn.textContent =
      `Include logged goal progress in export: ${on ? 'ON' : 'OFF'}`;
  }
  if (toggleGoalProgressPrefBtn) {
    updateGoalProgressPrefButton();
    toggleGoalProgressPrefBtn.addEventListener('click', () => {
      const on = !!wtStorage.get(WT_KEYS.prefExerciseGoalProgress, false);
      wtStorage.set(WT_KEYS.prefExerciseGoalProgress, !on);
      updateGoalProgressPrefButton();
      showToast(
        `Logged goal progress export ${!on ? 'enabled' : 'disabled'}.`,
      );
    });
  }

  pasteBtn.addEventListener('click', openPasteImport);

  // Paste dialog overlay
  const pasteOverlay = document.createElement('div');
  pasteOverlay.id = 'wt-paste-overlay';
  pasteOverlay.setAttribute('role', 'dialog');
  pasteOverlay.setAttribute('aria-modal', 'true');
  pasteOverlay.setAttribute('aria-labelledby', 'wt-paste-title');
  pasteOverlay.innerHTML =
    '<div class="wt-paste-box"><h3 id="wt-paste-title">Paste workout JSON</h3><label for="wt-paste-area">Workout data</label><textarea id="wt-paste-area" aria-describedby="wt-paste-error"></textarea><p id="wt-paste-error" role="alert"></p><div class="wt-paste-actions"><button id="wt-paste-import" class="btn btn-secondary">Import</button><button id="wt-paste-cancel" class="btn btn-secondary">Cancel</button></div></div>';
  document.body.appendChild(pasteOverlay);

  if (!document.getElementById('wt-import-style')) {
    const style = document.createElement('style');
    style.id = 'wt-import-style';
    style.textContent =
      '#wt-paste-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:13000;padding:12px;}#wt-paste-overlay.show{display:flex;}#wt-paste-overlay .wt-paste-box{background:#fff;color:#222;padding:16px;border-radius:8px;width:90%;max-width:500px;box-shadow:0 2px 8px rgba(0,0,0,.3);}#wt-paste-overlay h3{margin:0 0 10px;}#wt-paste-overlay label{display:block;font-weight:700;margin-bottom:6px;}#wt-paste-overlay textarea{width:100%;height:150px;}#wt-paste-error{min-height:1.25em;margin:6px 0;color:#b42318;font-size:13px;}#wt-paste-overlay .wt-paste-actions{margin-top:8px;display:flex;gap:8px;justify-content:flex-end;}body.dark #wt-paste-overlay .wt-paste-box{background:#333;color:#f5f6fa;}';
    document.head.appendChild(style);
  }

  function openPasteImport() {
    pasteOverlay.classList.add('show');
    pasteOverlay.dataset.wtModal = 'true';
    const ta = document.getElementById('wt-paste-area');
    ta.value = '';
    document.getElementById('wt-paste-error').textContent = '';
    ta.focus();
  }
  if (typeof window !== 'undefined') window.openPasteImport = openPasteImport;

  function closePasteImport() {
    pasteOverlay.classList.remove('show');
    delete pasteOverlay.dataset.wtModal;
    pasteBtn.focus();
  }

  pasteOverlay.addEventListener('click', (e) => {
    if (e.target === pasteOverlay) closePasteImport();
  });

  pasteOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePasteImport();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('wt-paste-import').click();
    }
  });

  document
    .getElementById('wt-paste-cancel')
    .addEventListener('click', closePasteImport);

  document.getElementById('wt-paste-import').addEventListener('click', async () => {
    const text = document.getElementById('wt-paste-area').value;
    const imported = await handleImportText(text);
    if (imported) closePasteImport();
    else document.getElementById('wt-paste-error').textContent = 'The workout could not be imported. Check the JSON and try again.';
  });

  /* ------------------ GOALS, RECOVERY, CONSTRAINTS ------------------ */
  function persistGoals() {
    goals = sanitizeGoals(goals);
    wtStorage.set(WT_KEYS.goals, goals);
    renderGoals();
    updateExportHint();
  }

  function renderGoals() {
    if (!goalsChips || !goalsEmpty) return;
    goalsChips.innerHTML = "";
    goals = sanitizeGoals(goals);
    const activeCount = goals.filter((g) => g.active).length;
    goalsEmpty.classList.toggle("hidden", goals.length > 0);
    goals.forEach((goal, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip goal-chip";
      if (goal.active) chip.classList.add("active");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "chip-goal-toggle";
      toggle.dataset.index = String(idx);
      toggle.textContent = goal.text;
      toggle.setAttribute("aria-pressed", goal.active ? "true" : "false");
      chip.appendChild(toggle);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.dataset.index = String(idx);
      remove.setAttribute("aria-label", `Remove goal ${goal.text}`);
      remove.textContent = "×";
      chip.appendChild(remove);

      goalsChips.appendChild(chip);
    });

    bindChipKeyboard(Array.from(goalsChips.querySelectorAll('.chip-goal-toggle')));
  }

  function handleAddGoal() {
    if (!goalInput) return;
    const value = trimString(goalInput.value, 140);
    if (!value) return;
    goals.push({ text: value, active: true });
    persistGoals();
    goalInput.value = "";
    updateGoalBtnState();
  }

  function updateGoalBtnState() {
    if (!addGoalBtn || !goalInput) return;
    addGoalBtn.disabled = !goalInput.value.trim();
  }

  if (goalsChips) {
    goalsChips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove");
      if (btn) {
        const idx = Number(btn.dataset.index);
        if (Number.isInteger(idx)) {
          goals.splice(idx, 1);
          persistGoals();
          updateGoalBtnState();
        }
        return;
      }
      const toggle = e.target.closest('.chip-goal-toggle');
      if (toggle) {
        const idx = Number(toggle.dataset.index);
        if (Number.isInteger(idx) && goals[idx]) {
          goals[idx].active = !goals[idx].active;
          persistGoals();
          updateGoalBtnState();
        }
      }
    });
    renderGoals();
  }
  if (goalInput && addGoalBtn) {
    goalInput.addEventListener("input", updateGoalBtnState);
    goalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddGoal();
      }
    });
    addGoalBtn.addEventListener("click", handleAddGoal);
    updateGoalBtnState();
  }

  function persistConstraints() {
    constraints = sanitizeConstraints(constraints);
    wtStorage.set(WT_KEYS.constraints, constraints);
    renderConstraintsList();
    renderAvoidAreas();
  }

  function renderConstraintsList() {
    if (!constraintsList || !constraintsEmpty) return;
    constraintsList.innerHTML = "";
    const notes = Array.isArray(constraints.scheduleNotes)
      ? constraints.scheduleNotes
      : [];
    const hasAvoid = Array.isArray(constraints.avoidAreas) && constraints.avoidAreas.length > 0;
    constraintsEmpty.classList.toggle("hidden", notes.length > 0 || hasAvoid);
    notes.forEach((note, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      const label = document.createElement("span");
      label.textContent = note;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.dataset.index = String(idx);
      remove.setAttribute("aria-label", `Remove note ${note}`);
      remove.textContent = "×";
      chip.appendChild(label);
      chip.appendChild(remove);
      constraintsList.appendChild(chip);
    });
  }

  function handleAddConstraint() {
    if (!constraintInput) return;
    const value = trimString(constraintInput.value, MAX_NOTE_LENGTH);
    if (!value) return;
    constraints.scheduleNotes = constraints.scheduleNotes || [];
    constraints.scheduleNotes.push(value);
    persistConstraints();
    constraintInput.value = "";
    updateConstraintBtnState();
  }

  function updateConstraintBtnState() {
    if (!addConstraintBtn || !constraintInput) return;
    addConstraintBtn.disabled = !constraintInput.value.trim();
  }

  if (constraintsList) {
    constraintsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove");
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (Number.isInteger(idx)) {
        constraints.scheduleNotes.splice(idx, 1);
        persistConstraints();
        updateConstraintBtnState();
      }
    });
    renderConstraintsList();
  }

  if (constraintInput && addConstraintBtn) {
    constraintInput.addEventListener("input", updateConstraintBtnState);
    constraintInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddConstraint();
      }
    });
    addConstraintBtn.addEventListener("click", handleAddConstraint);
    updateConstraintBtnState();
  }

  function renderAvoidAreas() {
    if (!avoidAreaButtons.length) return;
    const active = new Set(
      (constraints.avoidAreas || []).map((area) => area.toLowerCase()),
    );
    avoidAreaButtons.forEach((btn) => {
      const value = trimString(btn.dataset.value, 40);
      if (!value) return;
      const isActive = active.has(value.toLowerCase());
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    constraintsEmpty?.classList.toggle(
      "hidden",
      (constraints.scheduleNotes && constraints.scheduleNotes.length > 0) ||
        (constraints.avoidAreas && constraints.avoidAreas.length > 0),
    );
  }

  if (avoidAreaButtons.length) {
    avoidAreaButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = trimString(btn.dataset.value, 40);
        if (!value) return;
        const list = constraints.avoidAreas || [];
        const idx = list.findIndex(
          (entry) => entry.toLowerCase() === value.toLowerCase(),
        );
        if (idx >= 0) {
          list.splice(idx, 1);
        } else {
          list.push(value);
        }
        constraints.avoidAreas = list;
        persistConstraints();
      });
    });
    renderAvoidAreas();
  }


  /* ------------------ DAY TYPE ------------------ */
  function renderDayType() {
    if (dayTypeButtons.length) {
      dayTypeButtons.forEach((btn) => {
        const v = String(btn.dataset.value || '');
        const active = v.toLowerCase() === String(dayType || '').toLowerCase();
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    if (compareButtons.length) {
      compareButtons.forEach((btn) => {
        const v = String(btn.dataset.value || '');
        const active = v === String(dayCompare || '3');
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function persistDayType() {
    wtStorage.set(WT_KEYS.dayType, dayType);
    // Sync to calendar titles for today
    try {
      const TITLE_KEY = 'wt_history_titles';
      const raw = localStorage.getItem(TITLE_KEY);
      const titles = raw ? JSON.parse(raw) : {};
      const today = getLocalDateString();
      if (dayType) titles[today] = String(dayType);
      else delete titles[today];
      localStorage.setItem(TITLE_KEY, JSON.stringify(titles));
      window.dispatchEvent(new Event('wt-history-updated'));
    } catch {}
  }

  if (dayTypeButtons.length) {
    dayTypeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = String(btn.dataset.value || '').trim();
        dayType = dayType && dayType.toLowerCase() === v.toLowerCase() ? '' : v;
        persistDayType();
        renderDayType();
        updateExportHint();
      });
    });
  }
  if (compareButtons.length) {
    compareButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        dayCompare = String(btn.dataset.value || '3');
        wtStorage.set(WT_KEYS.dayCompare, dayCompare);
        if (dayCompare === 'none' && progressionGuard) {
          progressionGuard = false;
          wtStorage.set(WT_KEYS.progressionGuard, false);
          if (progressionGuardToggle) progressionGuardToggle.checked = false;
          showToast('Progression guard turned off because comparison is None.');
        }
        renderDayType();
        updateExportHint();
      });
    });
  }
  renderDayType();

  function updateExportHint() {
    if (!exportHint) return;
    const day = dayType ? `Day: ${dayType}` : 'Day: —';
    let win = 'Compare: —';
    if (dayCompare === 'none') win = 'Compare: None';
    else if (dayCompare === '3') win = 'Compare: Last 3';
    else if (dayCompare === '7') win = 'Compare: Last 7';
    else if (dayCompare === 'all') win = 'Compare: All';
    const goalCount = goals.filter((g) => g.active).length
      + Object.keys(exerciseGoals).length;
    const goalText = goalCount ? `Goals: ${goalCount}` : 'Goals: None';
    const progText = progressionGuard ? 'Progression Guard: ON' : 'Progression Guard: OFF';
    const statusText = sessionStatus === 'complete'
      ? 'Session: Complete'
      : `Session: ${SESSION_STATUS_OPTIONS[sessionStatus]}`;
    const timeText = nextWorkoutMinutes == null
      ? 'Next time: —'
      : `Next time: ${nextWorkoutMinutes}m`;
    exportHint.textContent = `${day} • ${win} • ${goalText} • ${progText} • ${statusText} • ${timeText}`;
  }
  updateExportHint();

  if (progressionGuardToggle) {
    progressionGuardToggle.checked = progressionGuard;
    progressionGuardToggle.addEventListener('change', () => {
      progressionGuard = progressionGuardToggle.checked;
      if (progressionGuard && dayCompare === 'none') {
        dayCompare = '3';
        wtStorage.set(WT_KEYS.dayCompare, dayCompare);
        renderDayType();
        showToast('Progression guard will compare the last 3 sessions.');
      }
      wtStorage.set(WT_KEYS.progressionGuard, progressionGuard);
      updateExportHint();
    });
  }

  if (sessionStatusSelect) {
    sessionStatusSelect.value = sessionStatus;
    sessionStatusSelect.addEventListener('change', () => {
      sessionStatus = normalizeSessionStatus(sessionStatusSelect.value);
      wtStorage.set(WT_KEYS.sessionStatus, {
        date: getLocalDateString(),
        value: sessionStatus,
      });
      updateExportHint();
      showToast(`Session status: ${SESSION_STATUS_OPTIONS[sessionStatus]}.`);
    });
  }

  if (nextWorkoutMinutesInput) {
    nextWorkoutMinutesInput.value = nextWorkoutMinutes == null
      ? ''
      : String(nextWorkoutMinutes);
    const syncNextWorkoutMinutes = (finalize = false) => {
      const rawMinutes = nextWorkoutMinutesInput.value.trim();
      nextWorkoutMinutes = normalizeWorkoutMinutes(rawMinutes);
      if (nextWorkoutMinutes == null) {
        wtStorage.clear(WT_KEYS.nextWorkoutMinutes);
        if (finalize && rawMinutes) {
          nextWorkoutMinutesInput.value = '';
          showToast('Enter 15–360 minutes, or leave it blank.');
        }
        updateExportHint();
        return;
      }
      wtStorage.set(WT_KEYS.nextWorkoutMinutes, nextWorkoutMinutes);
      updateExportHint();
      if (finalize) {
        nextWorkoutMinutesInput.value = String(nextWorkoutMinutes);
        showToast(`Next workout time budget: ${nextWorkoutMinutes} minutes.`);
      }
    };
    nextWorkoutMinutesInput.addEventListener('input', () => {
      syncNextWorkoutMinutes(false);
    });
    nextWorkoutMinutesInput.addEventListener('change', () => {
      syncNextWorkoutMinutes(true);
    });
  }

  if (addDayTypeCustomBtn && dayTypeCustomInput) {
    const updateBtn = () => {
      addDayTypeCustomBtn.disabled = !dayTypeCustomInput.value.trim();
    };
    dayTypeCustomInput.addEventListener('input', updateBtn);
    dayTypeCustomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDayTypeCustomBtn.click();
      }
    });
    addDayTypeCustomBtn.addEventListener('click', () => {
      const v = trimString(dayTypeCustomInput.value, 40);
      if (!v) return;
      dayType = v;
      persistDayType();
      renderDayType();
      updateExportHint();
      dayTypeCustomInput.value = '';
      updateBtn();
    });
    updateBtn();
  }

  if (resetContextBtn) {
    resetContextBtn.addEventListener('click', async () => {
      const ok = await confirmModal('Reset goals, constraints, day type, comparison, progression guard, and planning context?', { yesText: 'Reset', noText: 'Cancel', title: 'Reset Context' });
      if (!ok) return;
      goals = [];
      constraints = { ...DEFAULT_CONSTRAINTS };
      exerciseGoals = {};
      exerciseProfiles = {};
      dayType = '';
      dayCompare = 'none';
      progressionGuard = false;
      sessionStatus = 'complete';
      nextWorkoutMinutes = null;
      wtStorage.set(WT_KEYS.goals, goals);
      wtStorage.set(WT_KEYS.constraints, constraints);
      wtStorage.set(WT_KEYS.exerciseGoals, exerciseGoals);
      wtStorage.set(WT_KEYS.exerciseProfiles, exerciseProfiles);
      persistDayType();
      wtStorage.set(WT_KEYS.dayCompare, dayCompare);
      wtStorage.set(WT_KEYS.progressionGuard, progressionGuard);
      wtStorage.clear(WT_KEYS.sessionStatus);
      wtStorage.clear(WT_KEYS.nextWorkoutMinutes);
      if (sessionStatusSelect) sessionStatusSelect.value = sessionStatus;
      if (nextWorkoutMinutesInput) nextWorkoutMinutesInput.value = '';
      if (progressionGuardToggle) progressionGuardToggle.checked = false;
      renderGoals();
      renderConstraintsList();
      renderAvoidAreas();
      renderDayType();
      updateExportHint();
      showToast('Context reset.');
    });
  }

  // Accessibility: Space/Enter toggles for chip buttons
  function bindChipKeyboard(group) {
    group.forEach((btn) => {
      btn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }
  bindChipKeyboard(avoidAreaButtons);
  bindChipKeyboard(dayTypeButtons);
  bindChipKeyboard(compareButtons);

  // Screen reader live region
  const srStatus = document.createElement("div");
  srStatus.setAttribute("aria-live", "polite");
  srStatus.setAttribute("aria-atomic", "true");
  srStatus.style.position = "absolute";
  srStatus.style.width = "1px";
  srStatus.style.height = "1px";
  srStatus.style.overflow = "hidden";
  srStatus.style.clip = "rect(1px, 1px, 1px, 1px)";
  srStatus.style.whiteSpace = "nowrap";
  document.body.appendChild(srStatus);
  function announce(msg) {
    srStatus.textContent = msg;
  }

  // --- Toast / Snackbar Utility ---
  let toastRoot = null;
  let toastTimer = null;
  let toastRestoreFocus = null;
  let toastLiveRegion = null;

  function ensureToastElements() {
    if (!toastRoot) {
      toastRoot = document.getElementById("wt-toast-root");
      if (!toastRoot) {
        toastRoot = document.createElement("div");
        toastRoot.id = "wt-toast-root";
        toastRoot.setAttribute("role", "status");
        document.body.appendChild(toastRoot);
      }
    }
    if (!document.getElementById("wt-toast-style")) {
      const style = document.createElement("style");
      style.id = "wt-toast-style";
      style.textContent = `#wt-toast-root{position:fixed;bottom:calc(94px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);background:#fff;color:#222;padding:10px 16px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);display:none;align-items:center;gap:12px;z-index:12000;font-size:15px;}#wt-toast-root.show{display:flex;}#wt-toast-root button{background:none;border:none;color:#007bff;font-weight:600;cursor:pointer;}body.dark #wt-toast-root{background:#333;color:#f5f6fa;}body.dark #wt-toast-root button{color:#8ab4ff;}`;
      document.head.appendChild(style);
    }
  }

  function showToast(message, { actionLabel, onAction, duration = 10000 } = {}) {
    ensureToastElements();
    toastRoot.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    toastRoot.appendChild(msgSpan);
    if (actionLabel) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel;
      btn.addEventListener("click", () => {
        if (onAction) onAction();
        hideToast();
      });
      toastRoot.appendChild(btn);
    }
    toastRoot.classList.add("show");
    toastRestoreFocus = null;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);

    if (typeof announce === "function") {
      announce(message);
    } else {
      if (!toastLiveRegion) {
        toastLiveRegion = document.createElement("div");
        toastLiveRegion.setAttribute("aria-live", "polite");
        toastLiveRegion.setAttribute("aria-atomic", "true");
        toastLiveRegion.style.position = "absolute";
        toastLiveRegion.style.width = "1px";
        toastLiveRegion.style.height = "1px";
        toastLiveRegion.style.overflow = "hidden";
        toastLiveRegion.style.clip = "rect(1px,1px,1px,1px)";
        document.body.appendChild(toastLiveRegion);
      }
      toastLiveRegion.textContent = message;
    }
  }

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastRoot) {
      toastRoot.classList.remove("show");
      toastRoot.innerHTML = "";
    }
    toastRestoreFocus = null;
  }

  window.addEventListener('wt-storage-error', () => {
    showToast('Storage is full. Export your workout now; the latest change may not be saved.');
  });

  // --- Undo Stack ---
  let lastAction = null; // {type,payload,timestamp}

  const undoStorageKeys = [
    WT_KEYS.last,
    WT_KEYS.lastMeta,
    WT_KEYS.completed,
    WT_KEYS.history,
    WT_KEYS.archive,
    WT_KEYS.exerciseGoals,
    WT_KEYS.exerciseProfiles,
    WT_KEYS.goals,
    WT_KEYS.constraints,
    WT_KEYS.sessionStatus,
    WT_KEYS.nextWorkoutMinutes,
  ];

  function captureUndoStorage() {
    return Object.fromEntries(undoStorageKeys.map((key) => [key, wtStorage.getRaw(key)]));
  }

  function restoreUndoStorage(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    undoStorageKeys.forEach((key) => {
      const raw = snapshot[key];
      if (raw === null || raw === undefined) wtStorage.clear(key);
      else lsSetRaw(key, raw);
    });
    archivedSessions = wtStorage.get(WT_KEYS.archive, {});
    exerciseGoals = sanitizeExerciseGoals(wtStorage.get(WT_KEYS.exerciseGoals, {}));
    exerciseProfiles = sanitizeExerciseProfiles(wtStorage.get(WT_KEYS.exerciseProfiles, {}));
    goals = sanitizeGoals(wtStorage.get(WT_KEYS.goals, []));
    constraints = sanitizeConstraints(wtStorage.get(WT_KEYS.constraints, DEFAULT_CONSTRAINTS));
    const restoredStatus = wtStorage.get(WT_KEYS.sessionStatus, null);
    sessionStatus = normalizeSessionStatus(restoredStatus?.status || restoredStatus);
    nextWorkoutMinutes = normalizeWorkoutMinutes(
      wtStorage.get(WT_KEYS.nextWorkoutMinutes, restoredStatus?.nextWorkoutMinutes),
    );
    renderGoals();
    renderConstraintsList();
    renderAvoidAreas();
    renderSessionStatus();
    window.dispatchEvent(new Event('wt-history-updated'));
  }

  function pushUndo(action) {
    lastAction = { ...action, timestamp: Date.now() };
  }

  async function performUndo() {
    if (!lastAction) return;
    if (Date.now() - lastAction.timestamp > 12000) {
      lastAction = null;
      showToast("Undo expired");
      return;
    }
    const { type, payload } = lastAction;
    lastAction = null;
    hideToast();
    switch (type) {
      case "deleteSet": {
        const { exerciseName, exerciseIndex, removedSet, removedIndex } = payload;
        let target = null;
        if (exerciseIndex !== null && exerciseIndex !== undefined) {
          target = session.exercises[exerciseIndex];
        } else if (currentExercise && currentExercise.name === exerciseName) {
          target = currentExercise;
        } else {
          target = session.exercises.find((e) => e.name === exerciseName) || null;
        }
        if (target) {
          target.sets.splice(removedIndex, 0, removedSet);
          if (target === currentExercise) {
            renumberSets();
            rebuildSetsList();
            updateSetCounter();
          } else {
            target.sets.forEach((s, i) => (s.set = i + 1));
          }
          updateSummary();
          updateSetsToday();
          refreshExerciseGoalProgress(target);
          renderExerciseGoalPanel();
          saveState();
        }
        break;
      }
      case "finish":
      case "reset":
      case "import": {
        restoreUndoStorage(payload.storageSnapshot);
        session = payload.prevSession;
        currentExercise = payload.prevCurrent;
        if (session.startedAt) startSessionTimer(); else stopSessionTimer();
        if (currentExercise) {
          showInterface();
          rebuildSetsList();
          updateSetCounter();
        } else {
          interfaceBox.classList.add("hidden");
          setsList.innerHTML = "";
        }
        updateSummary();
        updateSetsToday();
        updateLogButtonState();
        saveState();
        break;
      }
    }
  }

  async function handleImportText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast('Import failed: invalid JSON');
      return false;
    }
    let normalized;
    try {
      normalized = normalizePayload(parsed);
    } catch {
      showToast('Import failed: unsupported workout data');
      return false;
    }
    if (normalized.totalSets === 0) {
      showToast('Nothing to import: no valid logged sets were found');
      return false;
    }
    const hasActiveWorkout = session.exercises.some((exercise) => exercise.sets?.length)
      || !!currentExercise?.sets?.length;
    if (hasActiveWorkout) {
      const replace = await confirmModal(
        'Importing this file will replace the active workout. Continue?',
        { title: 'Replace Active Workout?', yesText: 'Import', noText: 'Cancel' },
      );
      if (!replace) return false;
    }
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({
      type: 'import',
      payload: {
        prevSession,
        prevCurrent,
        storageSnapshot: captureUndoStorage(),
      },
    });
    finishRest({ announceCompletion: false, hide: true });
    restDisplay.textContent = '00:00';
    stopSessionTimer();
    session = { exercises: normalized.exercises, startedAt: null };
    currentExercise = null;
    wtStorage.set(WT_KEYS.last, normalized.exercises);
    wtStorage.set(WT_KEYS.lastMeta, {
      date: normalized.date,
      timestamp: normalized.timestamp,
      sessionContext: normalized.sessionContext || null,
    });
    normalized.exercises.forEach((exercise) => {
      const goalSnapshots = [
        ...(exercise.goal ? [exercise.goal] : []),
        ...(exercise.exerciseGoals || []),
      ];
      goalSnapshots.forEach((goal) => {
        const importedGoal = normalizeExerciseGoal(goal, goal?.exerciseName);
        if (!importedGoal) return;
        const key = exerciseGoalKey(importedGoal.exerciseName);
        const existing = exerciseGoals[key];
        if (!existing || String(importedGoal.lastUpdated) >= String(existing.lastUpdated)) {
          exerciseGoals[key] = importedGoal;
        }
      });
      if (exercise.isSuperset && exercise.progressionProfiles) {
        Object.assign(exerciseProfiles, exercise.progressionProfiles);
      } else if (!exercise.isCardio && exercise.name) {
        exerciseProfiles[exerciseGoalKey(exercise.name)] = normalizeExerciseProfile(
          exercise.progressionProfile,
        );
      }
    });
    if (Array.isArray(normalized.goals)) {
      goals = sanitizeGoals([
        ...goals,
        ...normalized.goals.map((text) => ({ text, active: true })),
      ]);
      wtStorage.set(WT_KEYS.goals, goals);
      renderGoals();
    }
    if (normalized.constraints) {
      const importedConstraints = sanitizeConstraints(normalized.constraints);
      constraints = sanitizeConstraints({
        scheduleNotes: [
          ...(constraints.scheduleNotes || []),
          ...(importedConstraints.scheduleNotes || []),
        ],
        avoidAreas: [
          ...(constraints.avoidAreas || []),
          ...(importedConstraints.avoidAreas || []),
        ],
      });
      wtStorage.set(WT_KEYS.constraints, constraints);
      renderConstraintsList();
      renderAvoidAreas();
    }
    persistExerciseGoals();
    wtStorage.set(WT_KEYS.exerciseProfiles, exerciseProfiles);
    if (normalized.sessionContext) {
      sessionStatus = normalizeSessionStatus(normalized.sessionContext.status);
      nextWorkoutMinutes = normalizeWorkoutMinutes(normalized.sessionContext.nextWorkoutMinutes);
      persistSessionStatus();
      renderSessionStatus();
    }
    archivedSessions[normalized.date] = normalized;
    archivedSessions = pruneArchive(archivedSessions, 120);
    wtStorage.set(WT_KEYS.archive, archivedSessions);
    mergeIntoHistory(normalized);
    interfaceBox.classList.add('hidden');
    document.body.classList.remove('workout-active', 'resting');
    setsList.innerHTML = '';
    updateSummary();
    updateSetsToday();
    updateLogButtonState();
    saveState();
    showToast('Imported workout', { actionLabel: 'Undo', onAction: performUndo });
    announce('Imported workout');
    return true;
  }

  // Button aria-labels
  logBtn.setAttribute("aria-label", "Log set");
  nextExerciseBtn.setAttribute(
    "aria-label",
    "Finish exercise and choose next",
  );
  finishBtn.setAttribute("aria-label", "Finish workout");
  resetBtn.setAttribute("aria-label", "Reset workout");

  const sessionTimerEl = document.createElement("span");
  sessionTimerEl.className = "header-metric";
  sessionTimerEl.style.display = "none";
  const setsTodayEl = document.createElement("span");
  setsTodayEl.className = "header-metric";
  const sessionMetricsEl = document.getElementById("sessionMetrics");
  const sessionPulseEl = document.getElementById("sessionPulse");
  const heroSetCountEl = document.getElementById("heroSetCount");
  if (sessionMetricsEl) {
    sessionMetricsEl.append(sessionTimerEl, setsTodayEl);
  } else {
    todayEl.after(sessionTimerEl, setsTodayEl);
  }

  let sessionTimerInterval = null;

  function formatHMS(totalSeconds) {
    const h = Math.min(99, Math.floor(totalSeconds / 3600));
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startSessionTimer() {
    if (!session.startedAt || session.finishedAt) return;
    const normalizedStartedAt = normalizeSessionStartedAt(session.startedAt);
    if (!normalizedStartedAt) {
      session.startedAt = null;
      stopSessionTimer();
      saveState();
      return;
    }
    const startMs = new Date(normalizedStartedAt).getTime();
    const tick = () => {
      const secs = Math.floor((Date.now() - startMs) / 1000);
      sessionTimerEl.textContent = `Session: ${formatHMS(secs)}`;
    };
    tick();
    sessionTimerEl.style.display = "inline-flex";
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(tick, 1000);
  }

  function stopSessionTimer() {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
    sessionTimerEl.style.display = "none";
    sessionTimerEl.textContent = "";
  }

  function computeTotalSets() {
    let total = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    if (currentExercise && currentExercise.sets) {
      total += currentExercise.sets.length;
    }
    return total;
  }

  function updateSetsToday() {
    const total = computeTotalSets();
    setsTodayEl.textContent = `${total} set${total === 1 ? '' : 's'} this session`;
    if (heroSetCountEl) heroSetCountEl.textContent = String(total);
    if (sessionPulseEl) {
      const degrees = Math.min(total / 12, 1) * 360;
      sessionPulseEl.style.setProperty('--set-progress', `${degrees}deg`);
      sessionPulseEl.classList.toggle('is-active', total > 0);
      sessionPulseEl.setAttribute(
        'aria-label',
        `${total} set${total === 1 ? '' : 's'} completed this session`,
      );
    }
  }

  let allExercises = [];

  function tryRecoverState() {
    if (needsRecoverSession) {
      wtStorage.restoreBackup(
        WT_KEYS.session,
        (value) => value && typeof value === 'object' && Array.isArray(value.exercises),
      );
    }
    if (needsRecoverCurrent) {
      wtStorage.restoreBackup(
        WT_KEYS.current,
        (value) => value === null
          || (value && typeof value === 'object' && Array.isArray(value.sets)),
      );
    }
    const recoveredSession = wtStorage.get(WT_KEYS.session, { exercises: [], startedAt: null });
    const recoveredCurrent = wtStorage.get(WT_KEYS.current, null);
    session = recoveredSession && Array.isArray(recoveredSession.exercises)
      ? {
        ...recoveredSession,
        exercises: recoveredSession.exercises.map(normalizeExercise),
      }
      : { exercises: [], startedAt: null };
    currentExercise = recoveredCurrent && Array.isArray(recoveredCurrent.sets)
      ? normalizeExercise(recoveredCurrent)
      : null;
  }

  if (needsRecoverSession || needsRecoverCurrent) {
    // Delay recovery until functions are defined
    setTimeout(() => {
      tryRecoverState();
      if (currentExercise) {
        rebuildSetsList();
        updateSetCounter();
        updateSummary();
      }
    }, 0);
  }

  function updateLogButtonState() {
    if (!currentExercise) {
      logBtn.disabled = true;
      return;
    }

    if (currentExercise.isSuperset) {
      const ok = currentExercise.exercises.every((_, i) => {
        const w = parseWorkoutNumber(document.getElementById(`weight${i}`).value);
        const r = parseWorkoutNumber(document.getElementById(`reps${i}`).value);
        return canLogSet(w, r);
      });
      logBtn.disabled = !ok;
      return;
    }

    if (currentExercise.isCardio) {
      const d =
        distanceInput.classList.contains("hidden") || distanceInput.value === ""
          ? null
          : parseFloat(distanceInput.value);
      const m = parseInt(durationMinInput.value, 10) || 0;
      const s = parseInt(durationSecInput.value, 10) || 0;
      const t = m * 60 + s;
      logBtn.disabled = !canLogCardio(d, t, currentExercise.name);
      return;
    }

    const w = parseWorkoutNumber(weightInput.value);
    const r = parseWorkoutNumber(repsInput.value);
    logBtn.disabled = !canLogStrengthEntry(w, r, setRoleInput?.value);
  }

  function getPlannedRestSeconds() {
    if (!useTimerEl.checked) return null;
    const parsed = Number.parseInt(restSecsInput.value, 10);
    const seconds = Number.isFinite(parsed) ? parsed : 90;
    const clamped = Math.min(3600, Math.max(5, seconds));
    if (String(clamped) !== restSecsInput.value) {
      restSecsInput.value = String(clamped);
    }
    return clamped;
  }

  function debounce(fn, delay = 100) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  async function loadExercises() {
    allExercises = [];
    const jsonPaths = [
      "data/exercises.json",
      "./data/exercises.json",
      "./exercises.json",
    ];
    for (const p of jsonPaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const loaded = await res.json();
          if (Array.isArray(loaded)) {
            allExercises = loaded;
            break;
          }
        }
      } catch (e) {
        console.warn(`Failed to load exercises from ${p}:`, e);
      }
    }
    if (!allExercises.length) {
      const jsPaths = ["./data/exercises.js", "./exercises.js"];
      for (const p of jsPaths) {
        try {
          const mod = await import(p);
          allExercises = mod.default;
          break;
        } catch (e) {
          console.warn(`Failed to load exercises from ${p}:`, e);
        }
      }
    }
    if (!Array.isArray(allExercises)) {
      allExercises = [];
      console.warn('No exercise database found, using empty list');
    }
    allExercises = allExercises.filter(ex => ex && typeof ex.name === 'string' && ex.name.trim());
    const storedCustom = wtStorage.get(WT_KEYS.custom, []);
    const custom = Array.isArray(storedCustom) ? storedCustom.filter(name => typeof name === 'string' && name.trim()) : [];
    custom.forEach((n) =>
      allExercises.push({
        name: n,
        category: "Custom",
        equipment: "",
        custom: true,
      }),
    );
    populateMuscleFilter();
    renderExerciseOptions();
  }

  function populateMuscleFilter() {
    const cats = Array.from(
      new Set(allExercises.map((e) => e.category)),
    ).sort();
    muscleFilter.innerHTML = '<option value="">All Categories</option>';
    cats.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      muscleFilter.appendChild(opt);
    });
  }

  function renderExerciseOptions() {
    exerciseSelect.innerHTML = '<option value="">Select Exercise</option>';
    exerciseList.innerHTML = "";
    const q = exerciseSearch.value.trim().toLowerCase();
    const cat = muscleFilter.value;
    const groups = {};
    const matches = [];
    allExercises.forEach((ex) => {
      if (cat && ex.category !== cat) return;
      if (q && !ex.name.toLowerCase().includes(q)) return;
      if (!groups[ex.category]) groups[ex.category] = [];
      groups[ex.category].push(ex);
      matches.push(ex);
    });
    Object.keys(groups)
      .sort()
      .forEach((catName) => {
        const og = document.createElement("optgroup");
        og.label = catName;
        groups[catName]
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((ex) => {
            const opt = document.createElement("option");
            opt.value = ex.name;
            opt.textContent = ex.name;
            opt.dataset.category = ex.category;
            og.appendChild(opt);
          });
        exerciseSelect.appendChild(og);
      });
    matches
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ex) => {
        const opt = document.createElement("option");
        opt.value = ex.name;
        exerciseList.appendChild(opt);
      });
  }

  function saveCustomExercises() {
    const custom = allExercises.filter((e) => e.custom).map((e) => e.name);
    wtStorage.set(WT_KEYS.custom, custom);
  }

  const renderExerciseOptionsDebounced = debounce(renderExerciseOptions, 150);
  exerciseSearch.addEventListener("input", renderExerciseOptionsDebounced);
  muscleFilter.addEventListener("change", renderExerciseOptions);
  exerciseSearch.addEventListener("change", () => {
    const val = exerciseSearch.value.trim();
    if (!val) return;
    const match = allExercises.find(
      (e) => e.name.toLowerCase() === val.toLowerCase(),
    );
    if (match) {
      exerciseSelect.value = match.name;
      exerciseSelect.dispatchEvent(new Event("change"));
    }
  });

  loadExercises();

  weightInput.addEventListener("input", updateLogButtonState);
  repsInput.addEventListener("input", updateLogButtonState);
  distanceInput.addEventListener("input", updateLogButtonState);
  durationMinInput.addEventListener("input", updateLogButtonState);
  durationSecInput.addEventListener("input", updateLogButtonState);
  supersetInputs.addEventListener("input", updateLogButtonState);

  /* ------------------ INIT ------------------ */
  todayEl.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (currentExercise) {
    showInterface();
    if (currentExercise.isSuperset) {
      setupSupersetInputs(currentExercise.exercises);
      standardInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      supersetInputs.classList.remove("hidden");
    } else if (currentExercise.isCardio) {
      supersetInputs.classList.add("hidden");
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
    } else {
      supersetInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    rebuildSetsList();
    updateSetCounter();
  }
  updateSummary();
  updateSetsToday();
  if (session.startedAt) startSessionTimer();
  updateLogButtonState();

  /* ------------------ THEME ------------------ */
  if (wtStorage.getRaw(WT_KEYS.theme) === "dark") {
    document.body.classList.add("dark");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light";
  }

  function syncThemeColor() {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const pack = getThemePack(document.body.dataset.themePack);
      themeMeta.content = document.body.classList.contains("dark")
        ? pack.darkColor
        : pack.lightColor;
    }
  }

  function playThemeTransition() {
    if (!themeTransition || prefersReducedMotion) return;
    themeTransition.classList.remove('is-active');
    void themeTransition.offsetWidth;
    themeTransition.classList.add('is-active');
    window.setTimeout(() => themeTransition.classList.remove('is-active'), 720);
  }

  function applyThemePack(value, { persist = true, syncMode = false, animate = false } = {}) {
    const pack = getThemePack(value);
    if (animate) playThemeTransition();
    document.body.dataset.themePack = pack.id;
    if (themePackLabel) themePackLabel.textContent = pack.label;
    themePackOptions.forEach((option) => {
      const selected = option.dataset.themePack === pack.id;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    if (syncMode) {
      const dark = pack.mode === 'dark';
      document.body.classList.toggle('dark', dark);
      themeIcon.textContent = dark ? '☀️' : '🌙';
      themeLabel.textContent = dark ? 'Light' : 'Dark';
      lsSetRaw(WT_KEYS.theme, dark ? 'dark' : 'light');
    }
    if (persist) lsSetRaw(WT_KEYS.themePack, pack.id);
    syncThemeColor();
    return pack;
  }

  let themeSheetPreviousFocus = null;
  function openThemeSheet() {
    themeSheetPreviousFocus = document.activeElement;
    themePackSheet.classList.add('is-open');
    themePackBackdrop.classList.add('is-open');
    themePackSheet.setAttribute('aria-hidden', 'false');
    themePackBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('theme-sheet-open');
    const selected = themePackSheet.querySelector('.theme-pack-option.is-selected');
    window.setTimeout(() => (selected || themePackClose).focus(), 80);
  }

  function closeThemeSheet() {
    if (!themePackSheet.classList.contains('is-open')) return;
    themePackSheet.classList.remove('is-open');
    themePackBackdrop.classList.remove('is-open');
    themePackSheet.setAttribute('aria-hidden', 'true');
    themePackBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('theme-sheet-open');
    if (themeSheetPreviousFocus?.focus) themeSheetPreviousFocus.focus();
  }

  const storedPack = wtStorage.getRaw(WT_KEYS.themePack);
  applyThemePack(storedPack || 'aurora', { persist: false });
  syncThemeColor();

  darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    themeIcon.textContent = dark ? "☀️" : "🌙";
    themeLabel.textContent = dark ? "Light" : "Dark";
    lsSetRaw(WT_KEYS.theme, dark ? "dark" : "light");
    syncThemeColor();
  });

  themePackButton.addEventListener('click', openThemeSheet);
  themePackClose.addEventListener('click', closeThemeSheet);
  themePackBackdrop.addEventListener('click', closeThemeSheet);
  themePackOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const pack = applyThemePack(option.dataset.themePack, {
        persist: true,
        syncMode: true,
        animate: true,
      });
      announce(`${pack.label} theme applied`);
      showToast(`${pack.label} atmosphere activated`, { duration: 2400 });
      window.setTimeout(closeThemeSheet, 180);
    });
  });

  themePackSheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeThemeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(themePackSheet.querySelectorAll('button:not(:disabled)'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ------------------ IMMERSIVE UI ------------------ */
  const scrollProgressBar = document.getElementById('scrollProgressBar');
  const dockActions = Array.from(document.querySelectorAll('.dock-action[data-scroll-target]'));
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function updateScrollProgress() {
    if (!scrollProgressBar) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    scrollProgressBar.style.transform = `scaleX(${progress})`;
  }

  let scrollFrame = null;
  window.addEventListener('scroll', () => {
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(() => {
      updateScrollProgress();
      scrollFrame = null;
    });
  }, { passive: true });
  updateScrollProgress();

  function setActiveDock(targetId) {
    dockActions.forEach((button) => {
      const active = button.dataset.scrollTarget === targetId;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
  }

  dockActions.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.scrollTarget;
      const target = document.getElementById(targetId);
      if (!target) return;
      setActiveDock(targetId);
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });

  const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));
  document.body.classList.add('app-ready');
  if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
    revealTargets.forEach((target) => target.classList.add('in-view'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach((target) => revealObserver.observe(target));
  }

  const dockSections = dockActions
    .map((button) => document.getElementById(button.dataset.scrollTarget))
    .filter(Boolean);
  if (typeof IntersectionObserver !== 'undefined') {
    const dockObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveDock(visible.target.id);
    }, { rootMargin: '-28% 0px -58% 0px', threshold: [0.01, 0.25, 0.5] });
    dockSections.forEach((section) => dockObserver.observe(section));
  }

  /* ------------------ CUSTOM EXERCISE ------------------ */
  addExerciseBtn.addEventListener("click", () => {
    const name = trimString(customExerciseInput.value, 80).replace(/\s+/g, ' ');
    if (!name) return;
    const existingExercise = allExercises.find(
      (exercise) => exerciseGoalKey(exercise.name) === exerciseGoalKey(name),
    );
    const canonicalName = existingExercise?.name || name;
    if (!existingExercise) {
      allExercises.push({
        name: canonicalName,
        category: "Custom",
        equipment: "",
        custom: true,
      });
      saveCustomExercises();
      populateMuscleFilter();
      renderExerciseOptions();
    }
    exerciseSearch.value = "";
    muscleFilter.value = "";
    renderExerciseOptions();
    exerciseSelect.value = canonicalName;
    customExerciseInput.value = "";
    startExercise(canonicalName);
  });

  /* ------------------ SUPERSET ------------------ */
  function populateSupersetSelects() {
    [supersetSelect1, supersetSelect2].forEach((sel) => {
      sel.innerHTML = exerciseSelect.innerHTML;
      Array.from(sel.options).forEach((option) => {
        if (!option.value) return;
        const meta = allExercises.find((exercise) => exercise.name === option.value);
        if ((meta && meta.category === 'Cardio') || option.value === 'Plank') {
          option.disabled = true;
        }
      });
      sel.value = "";
    });
  }

  startSupersetBtn.addEventListener("click", () => {
    supersetBuilder.classList.toggle("hidden");
    if (!supersetBuilder.classList.contains("hidden")) {
      exerciseSearch.value = "";
      muscleFilter.value = "";
      renderExerciseOptions();
      populateSupersetSelects();
    }
  });

  beginSupersetBtn.addEventListener("click", () => {
    const n1 = supersetSelect1.value;
    const n2 = supersetSelect2.value;
    if (!n1 || !n2) {
      showToast("Choose two exercises");
      return;
    }
    if (exerciseGoalKey(n1) === exerciseGoalKey(n2)) {
      showToast('Choose two different exercises');
      return;
    }
    const unsupported = [n1, n2].some((name) => {
      const meta = allExercises.find((exercise) => exercise.name === name);
      return (meta && meta.category === 'Cardio') || name === 'Plank';
    });
    if (unsupported) {
      showToast('Supersets currently support strength exercises only');
      return;
    }
    supersetBuilder.classList.add("hidden");
    startSuperset([n1, n2]);
  });

  /* ------------------ EXERCISE GOALS ------------------ */
  function persistExerciseGoals() {
    exerciseGoals = sanitizeExerciseGoals(exerciseGoals);
    wtStorage.set(WT_KEYS.exerciseGoals, exerciseGoals);
  }

  function getExerciseGoalTargetNames() {
    if (!currentExercise) return [];
    return currentExercise.isSuperset
      ? (currentExercise.exercises || []).filter(Boolean)
      : [currentExercise.name];
  }

  function getSelectedExerciseGoalName() {
    const names = getExerciseGoalTargetNames();
    if (!names.length) return '';
    if (currentExercise && currentExercise.isSuperset && exerciseGoalExercise.value) {
      return exerciseGoalExercise.value;
    }
    return names[0];
  }

  function getAllowedGoalTypes(exerciseName = getSelectedExerciseGoalName()) {
    const normalizedName = exerciseGoalKey(exerciseName);
    if (['jump rope', 'plank'].includes(normalizedName)) return ['duration'];
    if (currentExercise?.isCardio && !currentExercise?.isSuperset) {
      return ['distance', 'duration'];
    }
    return ['weight', 'reps'];
  }

  function syncExerciseGoalTypeOptions(preferredType = exerciseGoalType.value) {
    const allowed = getAllowedGoalTypes();
    Array.from(exerciseGoalType.options).forEach((option) => {
      const enabled = allowed.includes(option.value);
      option.disabled = !enabled;
      option.hidden = !enabled;
    });
    exerciseGoalType.value = allowed.includes(preferredType) ? preferredType : allowed[0];
  }

  function updateExerciseGoalValueField() {
    const type = EXERCISE_GOAL_TYPES[exerciseGoalType.value]
      ? exerciseGoalType.value
      : 'weight';
    const meta = EXERCISE_GOAL_TYPES[type];
    exerciseGoalValueLabel.textContent = `Goal ${meta.label.toLowerCase()} (${meta.unit})`;
    exerciseGoalValue.step = String(meta.step);
    const examples = {
      weight: 'e.g. 225',
      reps: 'e.g. 20',
      distance: 'e.g. 3.1',
      duration: 'e.g. 30',
    };
    exerciseGoalValue.placeholder = examples[type] || 'Enter target';
  }

  function updateExerciseGoalPathField() {
    const goalType = EXERCISE_GOAL_TYPES[exerciseGoalType.value]
      ? exerciseGoalType.value
      : 'weight';
    const isPerformanceGoal = goalType === 'distance' || goalType === 'duration';
    exerciseGoalPathField.classList.toggle('hidden', isPerformanceGoal);
    if (isPerformanceGoal) {
      exerciseGoalPath.value = 'balanced';
      return;
    }
    const path = normalizeGoalPath(exerciseGoalPath.value, goalType);
    exerciseGoalPath.value = path === 'performance'
      ? normalizeGoalPath(null, goalType)
      : path;
    exerciseGoalPathHint.textContent = GOAL_PATHS[exerciseGoalPath.value].description;
  }

  function refreshExerciseGoalProgress(exercise = currentExercise) {
    if (!exercise) return;
    let changed = false;
    const names = exercise.isSuperset ? exercise.exercises || [] : [exercise.name];
    names.filter(Boolean).forEach((name) => {
      const key = exerciseGoalKey(name);
      const previous = exerciseGoals[key];
      if (!previous) return;
      const currentPerformance = getGoalPerformanceFromExercise(
        exercise,
        previous.goalType,
        name,
      );
      const historicalBest = getBestHistoricalGoalPerformance(name, previous.goalType);
      const best = Math.max(currentPerformance, historicalBest);
      const snapshot = normalizeExerciseGoal({
        ...previous,
        currentBestPerformance: best,
        lastUpdated: best !== previous.currentBestPerformance
          ? new Date().toISOString()
          : previous.lastUpdated,
      }, name);
      if (snapshot && JSON.stringify(previous) !== JSON.stringify(snapshot)) {
        exerciseGoals[key] = snapshot;
        changed = true;
      }
    });
    if (changed) persistExerciseGoals();
  }

  function getBestHistoricalGoalPerformance(exerciseName, goalType) {
    let best = 0;
    const inspectExercises = (exercises) => {
      (Array.isArray(exercises) ? exercises : []).forEach((exercise) => {
        if (!exercise) return;
        if (
          exercise.isSuperset ||
          exerciseGoalKey(exercise.name) === exerciseGoalKey(exerciseName)
        ) {
          best = Math.max(
            best,
            getGoalPerformanceFromExercise(exercise, goalType, exerciseName),
          );
        }
      });
    };
    Object.values(archivedSessions || {}).forEach((workout) => {
      inspectExercises(workout && workout.exercises);
    });
    inspectExercises(session.exercises);
    return best;
  }

  function renderExerciseGoalPanel() {
    if (!exerciseGoalPanel || !currentExercise) return;
    const names = getExerciseGoalTargetNames();
    const previousSelection = exerciseGoalExercise.value;
    exerciseGoalExercise.innerHTML = '';
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      exerciseGoalExercise.appendChild(option);
    });
    if (names.includes(previousSelection)) exerciseGoalExercise.value = previousSelection;
    const isSuperset = currentExercise.isSuperset && names.length > 1;
    exerciseGoalExercise.classList.toggle('hidden', !isSuperset);
    exerciseGoalExerciseLabel.classList.toggle('hidden', !isSuperset);

    refreshExerciseGoalProgress(currentExercise);
    const name = getSelectedExerciseGoalName();
    const goal = exerciseGoals[exerciseGoalKey(name)] || null;
    exerciseGoalHeading.textContent = goal
      ? `${name} goal`
      : 'Set your goal';
    exerciseGoalAction.textContent = goal ? 'Edit' : 'Start';
    exerciseGoalStatus.classList.toggle('hidden', !goal);
    removeExerciseGoal.classList.toggle('hidden', !goal);

    if (goal) {
      const bestText = `${formatGoalNumber(goal.currentBestPerformance)} ${goal.unit}`;
      const targetText = `${formatGoalNumber(goal.goalValue)} ${goal.unit}`;
      const remainingText = `${formatGoalNumber(goal.remainingDistanceToGoal)} ${goal.unit}`;
      exerciseGoalBest.textContent = bestText;
      exerciseGoalTarget.textContent = targetText;
      exerciseGoalRemaining.textContent = remainingText;
      exerciseGoalProgressBar.style.width = `${goal.progressPercentage}%`;
      const track = exerciseGoalProgressBar.parentElement;
      track.setAttribute('aria-valuenow', String(Math.round(goal.progressPercentage)));
      exerciseGoalInsight.textContent = buildGoalInsight(goal);
      exerciseGoalCoachPlan.textContent = `Automatic plan: ${goal.goalPathLabel}. Log the workout, export it, and follow the next prescription.`;
      syncExerciseGoalTypeOptions(goal.goalType);
      exerciseGoalPath.value = goal.goalPath === 'performance'
        ? 'balanced'
        : goal.goalPath;
      exerciseGoalValue.value = formatGoalNumber(goal.goalValue);
    } else {
      exerciseGoalBest.textContent = '—';
      exerciseGoalTarget.textContent = '—';
      exerciseGoalRemaining.textContent = '—';
      exerciseGoalProgressBar.style.width = '0%';
      syncExerciseGoalTypeOptions();
      exerciseGoalPath.value = currentExercise.isCardio ? 'balanced' : 'strength';
      exerciseGoalValue.value = '';
      exerciseGoalCoachPlan.textContent = '';
    }
    updateExerciseGoalValueField();
    updateExerciseGoalPathField();
  }

  function setExerciseGoalFormOpen(open) {
    exerciseGoalForm.classList.toggle('hidden', !open);
    exerciseGoalToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderExerciseGoalPanel();
      window.setTimeout(() => exerciseGoalValue.focus(), 0);
    }
  }

  exerciseGoalToggle.addEventListener('click', () => {
    setExerciseGoalFormOpen(exerciseGoalForm.classList.contains('hidden'));
  });
  exerciseGoalExercise.addEventListener('change', renderExerciseGoalPanel);
  exerciseGoalType.addEventListener('change', () => {
    updateExerciseGoalValueField();
    if (exerciseGoalType.value === 'weight') exerciseGoalPath.value = 'strength';
    else if (exerciseGoalType.value === 'reps') exerciseGoalPath.value = 'balanced';
    updateExerciseGoalPathField();
  });
  exerciseGoalPath.addEventListener('change', updateExerciseGoalPathField);
  exerciseGoalValue.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveExerciseGoal.click();
    }
  });
  saveExerciseGoal.addEventListener('click', () => {
    const exerciseName = getSelectedExerciseGoalName();
    const goalType = exerciseGoalType.value;
    const goalPath = normalizeGoalPath(exerciseGoalPath.value, goalType);
    const goalValue = Number(exerciseGoalValue.value);
    if (
      !exerciseName
      || !EXERCISE_GOAL_TYPES[goalType]
      || !getAllowedGoalTypes(exerciseName).includes(goalType)
      || !Number.isFinite(goalValue)
      || goalValue <= 0
    ) {
      showToast('Enter a valid goal value');
      return;
    }
    const key = exerciseGoalKey(exerciseName);
    const previous = exerciseGoals[key];
    const now = new Date().toISOString();
    const performance = getGoalPerformanceFromExercise(currentExercise, goalType, exerciseName);
    const historicalBest = getBestHistoricalGoalPerformance(exerciseName, goalType);
    exerciseGoals[key] = normalizeExerciseGoal({
      exerciseName,
      goalType,
      goalPath,
      goalValue,
      unit: EXERCISE_GOAL_TYPES[goalType].unit,
      dateCreated: previous ? previous.dateCreated : now,
      lastUpdated: now,
      currentBestPerformance: previous && previous.goalType === goalType
        ? Math.max(previous.currentBestPerformance, performance, historicalBest)
        : Math.max(performance, historicalBest),
    }, exerciseName, now);
    const previousProfile = normalizeExerciseProfile(
      exerciseProfiles[key] || currentExercise.progressionProfile,
    );
    const automaticProfile = buildAutomaticExerciseProfile(
      exerciseName,
      exerciseGoals[key],
      previousProfile,
    );
    exerciseProfiles[key] = automaticProfile;
    if (currentExercise.isSuperset) {
      currentExercise.progressionProfiles = currentExercise.progressionProfiles || {};
      currentExercise.progressionProfiles[key] = automaticProfile;
    } else currentExercise.progressionProfile = automaticProfile;
    wtStorage.set(WT_KEYS.exerciseProfiles, exerciseProfiles);
    progressionGuard = true;
    wtStorage.set(WT_KEYS.progressionGuard, true);
    if (progressionGuardToggle) progressionGuardToggle.checked = true;
    if (dayCompare === 'none') {
      dayCompare = '3';
      wtStorage.set(WT_KEYS.dayCompare, dayCompare);
      renderDayType();
    }
    persistExerciseGoals();
    saveState();
    setExerciseGoalFormOpen(false);
    renderExerciseGoalPanel();
    renderAccuracyDetails();
    updateExportHint();
    announce(`Saved ${exerciseName} goal`);
    showToast(`Automatic coaching started for ${exerciseName}.`);
  });
  removeExerciseGoal.addEventListener('click', async () => {
    const exerciseName = getSelectedExerciseGoalName();
    const key = exerciseGoalKey(exerciseName);
    if (!exerciseGoals[key]) return;
    const ok = await confirmModal(`Remove the saved goal for ${exerciseName}?`, {
      title: 'Remove Goal',
      yesText: 'Remove',
      noText: 'Cancel',
    });
    if (!ok) return;
    delete exerciseGoals[key];
    persistExerciseGoals();
    setExerciseGoalFormOpen(false);
    renderExerciseGoalPanel();
    announce(`Removed ${exerciseName} goal`);
    showToast(`Goal removed for ${exerciseName}`);
  });

  function renderAccuracyDetails() {
    if (!accuracyDetails || !currentExercise) return;
    const isCardio = !!currentExercise.isCardio;
    if (autoSetNote) autoSetNote.classList.toggle('hidden', isCardio);
    accuracyDetails.classList.toggle('hidden', isCardio);
    if (isCardio) return;

    const key = exerciseGoalKey(currentExercise.name);
    const goal = exerciseGoals[key] || null;
    const savedProfile = normalizeExerciseProfile(
      exerciseProfiles[key] || currentExercise.progressionProfile,
    );
    const profile = savedProfile.mode === 'auto'
      ? buildAutomaticExerciseProfile(currentExercise.name, goal, savedProfile)
      : savedProfile;
    currentExercise.progressionProfile = profile;
    exerciseCoachingModeInput.value = profile.mode;
    customProfileFields.classList.toggle('hidden', profile.mode !== 'custom');
    exercisePurposeInput.value = profile.purpose;
    exerciseRepMinInput.value = String(profile.repMin);
    exerciseRepMaxInput.value = String(profile.repMax);
    exerciseTargetRirInput.value = String(profile.targetRir);
    exerciseLoadStepInput.value = String(profile.loadStep);
    automaticCoachingSummary.textContent = goal
      ? `Automatic ${goal.goalPathLabel} plan: ${profile.repMin}–${profile.repMax} reps, usually stopping with ${formatGoalNumber(profile.targetRir)} clean reps left. You only need to log your workout and export it.`
      : `No goal is saved yet. The app is using a general ${profile.repMin}–${profile.repMax} rep plan until you set a goal above.`;

    const failedOption = setRoleInput.querySelector('option[value="failed_attempt"]');
    if (failedOption) failedOption.disabled = !!currentExercise.isSuperset;
    if (currentExercise.isSuperset && setRoleInput.value === 'failed_attempt') {
      setRoleInput.value = 'auto';
    }
  }

  function getPendingSetContext() {
    const role = normalizeSetRole(setRoleInput?.value || 'auto');
    return {
      role,
      roleSource: role === 'auto' ? 'auto' : 'manual',
      ...(role === 'auto' ? { recordedRole: 'auto' } : {}),
      outcome: role === 'failed_attempt' ? 'failed' : 'completed',
      completed: role !== 'failed_attempt',
      rir: role === 'failed_attempt' ? null : normalizeRir(setRirInput?.value),
      technique: normalizeTechnique(setTechniqueInput?.value),
      pain: normalizePain(setPainInput?.value),
    };
  }

  function updateSetContextControls() {
    if (!setRoleInput || !repsInput) return;
    const failed = setRoleInput.value === 'failed_attempt';
    repsInput.min = failed ? '0' : '1';
    repsInput.placeholder = failed ? 'Completed reps (0)' : 'Reps';
    if (failed) {
      repsInput.value = '0';
      setRirInput.value = '';
      setRirInput.disabled = true;
    } else {
      if (repsInput.value === '0') repsInput.value = '';
      setRirInput.disabled = false;
    }
    updateLogButtonState();
  }

  function resetPendingSetContext({ clearMeasurements = false } = {}) {
    if (setRoleInput) setRoleInput.value = 'auto';
    if (setRirInput) setRirInput.value = '';
    if (setTechniqueInput) setTechniqueInput.value = 'unknown';
    if (setPainInput) setPainInput.value = 'unknown';
    if (clearMeasurements) {
      weightInput.value = '';
      repsInput.value = '';
      distanceInput.value = '';
      durationMinInput.value = '';
      durationSecInput.value = '';
    }
    updateSetContextControls();
  }

  if (setRoleInput) setRoleInput.addEventListener('change', updateSetContextControls);
  [setRirInput, setTechniqueInput, setPainInput].forEach((control) => {
    if (control) control.addEventListener('change', updateLogButtonState);
  });

  if (exercisePurposeInput) {
    exercisePurposeInput.addEventListener('change', () => {
      const defaults = defaultExerciseProfile(exercisePurposeInput.value);
      exerciseRepMinInput.value = String(defaults.repMin);
      exerciseRepMaxInput.value = String(defaults.repMax);
      exerciseTargetRirInput.value = String(defaults.targetRir);
      if (!exerciseLoadStepInput.value) exerciseLoadStepInput.value = String(defaults.loadStep);
    });
  }

  if (exerciseCoachingModeInput) {
    exerciseCoachingModeInput.addEventListener('change', () => {
      const custom = exerciseCoachingModeInput.value === 'custom';
      customProfileFields.classList.toggle('hidden', !custom);
      if (!custom && currentExercise) {
        const key = exerciseGoalKey(currentExercise.name);
        const profile = buildAutomaticExerciseProfile(
          currentExercise.name,
          exerciseGoals[key],
          exerciseProfiles[key] || currentExercise.progressionProfile,
        );
        exercisePurposeInput.value = profile.purpose;
        exerciseRepMinInput.value = String(profile.repMin);
        exerciseRepMaxInput.value = String(profile.repMax);
        exerciseTargetRirInput.value = String(profile.targetRir);
        exerciseLoadStepInput.value = String(profile.loadStep);
      }
    });
  }

  if (saveExerciseProfileBtn) {
    saveExerciseProfileBtn.addEventListener('click', () => {
      if (!currentExercise || currentExercise.isCardio) return;
      const key = exerciseGoalKey(currentExercise.name);
      if (exerciseCoachingModeInput.value === 'auto') {
        const profile = buildAutomaticExerciseProfile(
          currentExercise.name,
          exerciseGoals[key],
          exerciseProfiles[key] || currentExercise.progressionProfile,
        );
        exerciseProfiles[key] = profile;
        currentExercise.progressionProfile = profile;
        wtStorage.set(WT_KEYS.exerciseProfiles, exerciseProfiles);
        saveState();
        renderAccuracyDetails();
        showToast(`Automatic coaching is on for ${currentExercise.name}.`);
        announce(`Automatic coaching enabled for ${currentExercise.name}`);
        return;
      }
      const repMin = Math.floor(Number(exerciseRepMinInput.value));
      const repMax = Math.floor(Number(exerciseRepMaxInput.value));
      const targetRir = Number(exerciseTargetRirInput.value);
      const loadStep = Number(exerciseLoadStepInput.value);
      if (
        !Number.isFinite(repMin) || !Number.isFinite(repMax)
        || repMin < 1 || repMax < repMin || repMax > 100
        || !Number.isFinite(targetRir) || targetRir < 0 || targetRir > 10
        || !Number.isFinite(loadStep) || loadStep < 0.25 || loadStep > 100
      ) {
        showToast('Check the advanced numbers and try again.');
        return;
      }
      const profile = normalizeExerciseProfile({
        mode: 'custom',
        purpose: exercisePurposeInput.value,
        repMin,
        repMax,
        targetRir,
        loadStep,
      });
      exerciseProfiles[key] = profile;
      currentExercise.progressionProfile = profile;
      wtStorage.set(WT_KEYS.exerciseProfiles, exerciseProfiles);
      saveState();
      renderAccuracyDetails();
      showToast(`Custom AI settings saved for ${currentExercise.name}.`);
      announce(`Saved custom AI settings for ${currentExercise.name}`);
    });
  }

  /* ------------------ SELECT EXERCISE ------------------ */
  exerciseSelect.addEventListener("change", (e) => {
    const chosen = e.target.value;
    if (!chosen) return;

    // Clear filters so the list is fresh next time
    exerciseSearch.value = "";
    muscleFilter.value = "";

    // Start the exercise BEFORE re-rendering, so we don't lose the selected value
    startExercise(chosen);

    // Rebuild the options list
    renderExerciseOptions();

    // Optional: clear the dropdown so it's ready for the next pick
    exerciseSelect.value = "";
  });

  function startExercise(name) {
    finishRest({ announceCompletion: false, hide: true });
    if (!session.startedAt) session.startedAt = new Date().toISOString();
    startSessionTimer();
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    const meta = allExercises.find((e) => e.name === name);
    const isCardio = (meta && meta.category === "Cardio") || name === "Plank";
    const key = exerciseGoalKey(name);
    const savedProfile = normalizeExerciseProfile(exerciseProfiles[key]);
    const resolvedProfile = savedProfile.mode === 'auto'
      ? buildAutomaticExerciseProfile(name, exerciseGoals[key], savedProfile)
      : savedProfile;
    currentExercise = {
      name,
      sets: [],
      nextSet: 1,
      isCardio,
      progressionProfile: resolvedProfile,
    };
    resetPendingSetContext({ clearMeasurements: true });
    supersetInputs.classList.add("hidden");
    if (currentExercise.isCardio) {
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
      if (name === "Jump Rope" || name === "Plank") {
        distanceInput.classList.add("hidden");
        distanceInput.value = "";
        durationMinInput.focus();
      } else {
        distanceInput.classList.remove("hidden");
        distanceInput.focus();
      }
    } else {
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    supersetBuilder.classList.add("hidden");
    saveState();
    showInterface();
    rebuildSetsList();
    updateSetCounter();
    updateSummary();
    updateSetsToday();
    if (!currentExercise.isCardio) {
      weightInput.focus();
    }
    updateLogButtonState();
  }

  function startSuperset(namesArr) {
    finishRest({ announceCompletion: false, hide: true });
    if (!session.startedAt) session.startedAt = new Date().toISOString();
    startSessionTimer();
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    const clean = namesArr
      .map((name) => trimString(name, 80))
      .filter((name, index, names) => name && names.findIndex(
        (candidate) => exerciseGoalKey(candidate) === exerciseGoalKey(name),
      ) === index);
    if (clean.length < 2) {
      showToast('Choose two different strength exercises');
      return;
    }
    const progressionProfiles = {};
    clean.forEach((name) => {
      const key = exerciseGoalKey(name);
      const saved = normalizeExerciseProfile(exerciseProfiles[key]);
      progressionProfiles[key] = saved.mode === 'auto'
        ? buildAutomaticExerciseProfile(name, exerciseGoals[key], saved)
        : saved;
    });
    currentExercise = {
      name: clean.join(" + "),
      isSuperset: true,
      exercises: [...clean],
      sets: [],
      nextSet: 1,
      progressionProfiles,
      progressionProfile: normalizeExerciseProfile(
        exerciseProfiles[exerciseGoalKey(clean.join(" + "))],
      ),
    };
    resetPendingSetContext({ clearMeasurements: true });
    setupSupersetInputs(clean);
    standardInputs.classList.add("hidden");
    cardioInputs.classList.add("hidden");
    supersetInputs.classList.remove("hidden");
    supersetBuilder.classList.add("hidden");
    saveState();
    showInterface();
    rebuildSetsList();
    updateSetCounter();
    updateSummary();
    updateSetsToday();
    document.querySelector("#weight0").focus();
    updateLogButtonState();
  }

  function setupSupersetInputs(arr) {
    supersetInputs.innerHTML = "";
    arr.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "inline-row";
      const weightField = document.createElement("input");
      weightField.type = "number";
      weightField.id = `weight${i}`;
      weightField.className = "field superset-field";
      weightField.placeholder = `${name} weight`;
      weightField.setAttribute("aria-label", `${name} weight in pounds`);
      weightField.min = "0";
      weightField.step = "0.5";
      const repsField = document.createElement("input");
      repsField.type = "number";
      repsField.id = `reps${i}`;
      repsField.className = "field superset-field";
      repsField.placeholder = `${name} reps`;
      repsField.setAttribute("aria-label", `${name} repetitions`);
      repsField.min = "1";
      repsField.step = "1";
      row.appendChild(weightField);
      row.appendChild(repsField);
      supersetInputs.appendChild(row);
    });
  }

  function getStagePresentation(exercise) {
    if (exercise.isSuperset) return { label: 'Superset', tone: 'superset' };
    if (exercise.isCardio) return { label: 'Cardio', tone: 'cardio' };
    const meta = allExercises.find((item) => item.name === exercise.name);
    const category = String(meta?.category || 'Strength');
    const normalized = category.toLowerCase();
    const tone = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].find((value) =>
      normalized.includes(value),
    ) || 'strength';
    return { label: category === 'Strength' ? 'Strength' : `${category} · Strength`, tone };
  }

  function pulseExerciseStage() {
    if (!exerciseStage) return;
    exerciseStage.classList.remove('set-celebrate');
    void exerciseStage.offsetWidth;
    exerciseStage.classList.add('set-celebrate');
    window.setTimeout(() => exerciseStage.classList.remove('set-celebrate'), 760);
  }

  function showInterface() {
    interfaceBox.classList.remove("hidden");
    interfaceBox.classList.remove('interface-enter');
    void interfaceBox.offsetWidth;
    interfaceBox.classList.add('interface-enter');
    document.body.classList.add("workout-active");
    exerciseNameEl.textContent = currentExercise.name;
    const presentation = getStagePresentation(currentExercise);
    exerciseStage.dataset.stageTone = presentation.tone;
    exerciseStageType.textContent = presentation.label;
    exerciseStage.style.setProperty('--set-energy', String(Math.min(1, .2 + ((currentExercise.nextSet || 1) - 1) * .16)));
    setExerciseGoalFormOpen(false);
    renderExerciseGoalPanel();
    renderAccuracyDetails();
    updateSetContextControls();
  }

  /* ------------------ LOG SET ------------------ */
  logBtn.addEventListener("click", function () {
    if (currentExercise.isSuperset) {
      const setGroup = currentExercise.exercises.map((ex, i) => {
        const w = parseWorkoutNumber(document.getElementById(`weight${i}`).value);
        const r = parseWorkoutNumber(document.getElementById(`reps${i}`).value);
        return { name: ex, weight: w, reps: r };
      });
      if (setGroup.some((s) => !canLogSet(s.weight, s.reps))) {
        showToast("Enter weight & reps for all exercises");
        return;
      }
      const planned = getPlannedRestSeconds();
      const setContext = getPendingSetContext();
      // Normalize inner exercises and wrap in normalized set object
      const supersetSet = normalizeSet({
        set: currentExercise.nextSet,
        exercises: setGroup,
        time: new Date().toLocaleTimeString(),
        ts: Date.now(),
        restPlanned: planned,
        restActual: null,
        ...setContext,
      });
      currentExercise.sets.push(supersetSet);
      currentExercise.nextSet++;
      rebuildSetsList();
      updateSetCounter();
      pulseExerciseStage();

      currentExercise.exercises.forEach((_, i) => {
        document.getElementById(`weight${i}`).value = "";
        document.getElementById(`reps${i}`).value = "";
      });
      resetPendingSetContext();
      if (planned != null) {
        startRest(planned, currentExercise.sets.length - 1);
      }
      updateSummary();
      updateSetsToday();
      refreshExerciseGoalProgress();
      renderExerciseGoalPanel();
      saveState();
      updateLogButtonState();
      announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
      document.getElementById("weight0").focus();
      return;
    }

    if (currentExercise.isCardio) {
      const rawD = parseFloat(distanceInput.value);
      const d = distanceInput.value === "" ? null : rawD;
      const m = parseInt(durationMinInput.value, 10) || 0;
      const s = parseInt(durationSecInput.value, 10) || 0;
      const t = m * 60 + s;
      if (!canLogCardio(d, t, currentExercise.name)) {
        showToast(
          ["Jump Rope", "Plank"].includes(currentExercise.name)
            ? "Enter duration"
            : "Enter distance & duration",
        );
        return;
      }
      const planned = getPlannedRestSeconds();
      const cardioSet = normalizeSet({
        set: currentExercise.nextSet,
        distance: d,
        duration: t,
        time: new Date().toLocaleTimeString(),
        ts: Date.now(),
        restPlanned: planned,
        restActual: null,
      });
      currentExercise.sets.push(cardioSet);
      addSetElement(
        currentExercise.sets[currentExercise.sets.length - 1],
        currentExercise.sets.length - 1,
      );
      currentExercise.nextSet++;
      updateSetCounter();
      pulseExerciseStage();
      distanceInput.value = "";
      durationMinInput.value = "";
      durationSecInput.value = "";
      if (planned != null) {
        startRest(planned, currentExercise.sets.length - 1);
      }
      updateSummary();
      updateSetsToday();
      refreshExerciseGoalProgress();
      renderExerciseGoalPanel();
      saveState();
      updateLogButtonState();
      announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
      if (distanceInput.classList.contains("hidden")) {
        durationMinInput.focus();
      } else {
        distanceInput.focus();
      }
      return;
    }

    const w = parseWorkoutNumber(weightInput.value);
    const r = parseWorkoutNumber(repsInput.value);
    const setContext = getPendingSetContext();

    if (!canLogStrengthEntry(w, r, setContext.role)) {
      showToast(
        setContext.role === 'failed_attempt'
          ? 'Enter the attempted weight; completed reps must be 0.'
          : 'Enter weight & reps',
      );
      return;
    }

    const planned = getPlannedRestSeconds();

    const strengthSet = normalizeSet({
      set: currentExercise.nextSet,
      weight: w,
      reps: r,
      time: new Date().toLocaleTimeString(),
      ts: Date.now(),
      restPlanned: planned,
      restActual: null,
      ...setContext,
    });
    currentExercise.sets.push(strengthSet);
    currentExercise.nextSet++;
    rebuildSetsList();
    updateSetCounter();
    pulseExerciseStage();

    weightInput.focus();
    weightInput.select();
    repsInput.value = "";
    resetPendingSetContext();

    if (planned != null) {
      startRest(planned, currentExercise.sets.length - 1);
    }

    updateSummary();
    updateSetsToday();
    refreshExerciseGoalProgress();
    renderExerciseGoalPanel();
    saveState();
    updateLogButtonState();
    announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
  });

  function addSetElement(setObj, index) {
    const hint = setsList.querySelector(".empty-hint");
    if (hint) hint.remove();
    const item = document.createElement("div");
    item.className = "set-item set-pop";
    item.dataset.index = index;

    const restInfo =
      setObj.restActual != null
        ? ` • Rest: ${formatSec(setObj.restActual)}`
        : setObj.restPlanned != null
          ? ` • Rest planned: ${formatSec(setObj.restPlanned)}`
          : "";
    const setContextInfo = formatSetContext(setObj, {
      includeRole: !currentExercise.isSuperset
        && normalizeSetRole(setObj.role) !== 'failed_attempt',
    });

    let meta = "";
    if (currentExercise.isSuperset) {
      meta = setObj.exercises
        .map((e) => {
          const innerContext = formatSetContext({ ...setObj, ...e, exercises: undefined });
          return `${e.name}: ${e.weight}×${e.reps}${innerContext ? ` (${innerContext})` : ''}`;
        })
        .join(" |");
    } else if (currentExercise.isCardio) {
      const dist = setObj.distance != null ? `${setObj.distance} mi` : "";
      const dur = formatSec(setObj.duration);
      meta = dist ? `${dist} in ${dur}` : dur;
    } else {
      meta = normalizeSetRole(setObj.role) === 'failed_attempt'
        ? `Failed attempt at ${setObj.weight} lbs`
        : `${setObj.weight} lbs × ${setObj.reps} rep${Number(setObj.reps) === 1 ? '' : 's'}`;
    }

    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.minWidth = "150px";
    const label = document.createElement("div");
    label.className = "set-label";
    label.textContent = `${currentExercise.name} – Set ${setObj.set}`;
    const metaEl = document.createElement("div");
    metaEl.className = "set-meta";
    metaEl.textContent = `${meta}${setContextInfo ? ` • ${setContextInfo}` : ''}${restInfo}`;
    content.appendChild(label);
    content.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "set-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn-mini edit";
    editButton.dataset.action = "edit";
    editButton.textContent = "Edit";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-mini del";
    deleteButton.dataset.action = "del";
    deleteButton.textContent = "Del";
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    item.appendChild(content);
    item.appendChild(actions);
    const editBtn = item.querySelector('button[data-action="edit"]');
    editBtn.setAttribute(
      "aria-label",
      `Edit set ${setObj.set} for ${currentExercise.name}`,
    );
    const delBtn = item.querySelector('button[data-action="del"]');
    delBtn.setAttribute(
      "aria-label",
      `Delete set ${setObj.set} for ${currentExercise.name}`,
    );
    setsList.appendChild(item);
  }

  function rebuildSetsList() {
    setsList.innerHTML = "";
    if (!currentExercise) return;
    if (!currentExercise.sets.length) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = currentExercise.isCardio
        ? 'No efforts yet. Enter duration and distance when applicable, then press Log Set.'
        : currentExercise.isSuperset
          ? 'No rounds yet. Enter weight and reps for both exercises, then press Log Set.'
          : 'No sets yet. Enter weight & reps, then press Log Set.';
      hint.style.color = "#888";
      hint.style.fontSize = "0.9em";
      setsList.appendChild(hint);
      return;
    }
    const displayExercise = classifyExerciseSets(currentExercise);
    displayExercise.sets.forEach((s, i) => addSetElement(s, i));
  }

  /* ------------------ EDIT / DELETE ------------------ */
  setsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const item = btn.closest(".set-item");
    if (!action || !item) return;
    const idx = parseInt(item.dataset.index, 10);
    if (action === "del") deleteSet(idx);
    else if (action === "edit") openEditForm(item, idx);
  });

  async function deleteSet(idx) {
    const ok = await confirmModal("Delete this set?", { yesText: 'Delete', noText: 'Cancel' });
    if (!ok) return;
    if (restTargetSet === currentExercise?.sets?.[idx]) {
      finishRest({ announceCompletion: false, hide: true });
    }
    pushUndo({
      type: "deleteSet",
      payload: {
        exerciseName: currentExercise?.name,
        exerciseIndex: null,
        removedSet: deepClone(currentExercise.sets[idx]),
        removedIndex: idx,
      },
    });
    announce(`Deleted set ${idx + 1} for ${currentExercise.name}`);
    currentExercise.sets.splice(idx, 1);
    renumberSets();
    rebuildSetsList();
    updateSetCounter();
    updateSummary();
    updateSetsToday();
    refreshExerciseGoalProgress();
    renderExerciseGoalPanel();
    saveState();
    showToast("Set deleted", {
      actionLabel: "Undo",
      onAction: performUndo,
    });
  }

  /* === FIXED EDIT FORM === */
  function addSetContextEditor(form, set) {
    if (!form || !set) return;
    const role = normalizeSetRole(set.role);
    const selectedRole = isAutomaticRole(set) ? 'auto' : role;
    const technique = normalizeTechnique(set.technique);
    const pain = normalizePain(set.pain);
    const roleOptions = Object.entries(SET_ROLE_OPTIONS)
      .filter(([value]) => !(currentExercise?.isSuperset && value === 'failed_attempt'))
      .map(([value, label]) => `<option value="${value}"${value === selectedRole ? ' selected' : ''}>${label}</option>`)
      .join('');
    const techniqueOptions = Object.entries(TECHNIQUE_OPTIONS)
      .map(([value, label]) => `<option value="${value}"${value === technique ? ' selected' : ''}>${label}</option>`)
      .join('');
    const painOptions = Object.entries(PAIN_OPTIONS)
      .map(([value, label]) => `<option value="${value}"${value === pain ? ' selected' : ''}>${label}</option>`)
      .join('');
    const context = document.createElement('div');
    context.className = 'set-context-editor';
    context.innerHTML = `
      <div class="row">
        <select class="editRole" aria-label="Set role">${roleOptions}</select>
        <input type="number" class="editRir" value="${normalizeRir(set.rir) ?? ''}" min="0" max="10" step="0.5" placeholder="RIR">
      </div>
      <div class="row">
        <select class="editTechnique" aria-label="Technique quality">${techniqueOptions}</select>
        <select class="editPain" aria-label="Pain status">${painOptions}</select>
      </div>
    `;
    const actions = form.querySelector('.row2');
    form.insertBefore(context, actions || null);
    const roleInput = context.querySelector('.editRole');
    roleInput.addEventListener('change', () => {
      const failed = roleInput.value === 'failed_attempt';
      form.querySelectorAll('[class^="editR"]').forEach((input) => {
        if (!(input instanceof HTMLInputElement) || input.classList.contains('editRestPlanned') || input.classList.contains('editRestActual') || input.classList.contains('editRir')) return;
        input.min = failed ? '0' : '1';
        if (failed) input.value = '0';
        else if (input.value === '0') input.value = '';
      });
      const rirInput = context.querySelector('.editRir');
      rirInput.disabled = failed;
      if (failed) rirInput.value = '';
    });
  }

  function openEditForm(item, idx) {
    if (item.querySelector(".edit-form")) return;
    const s = currentExercise.sets[idx];

    const form = document.createElement("div");
    form.className = "edit-form";
    if (currentExercise.isSuperset) {
      s.exercises.forEach((ex, i) => {
        const row = document.createElement("div");
        row.className = "row";
        const label = document.createElement("span");
        label.style.fontSize = "12px";
        label.style.flexBasis = "100%";
        label.textContent = ex.name;
        const weightField = document.createElement("input");
        weightField.type = "number";
        weightField.className = `editW${i}`;
        weightField.value = ex.weight;
        weightField.min = "0";
        weightField.step = "0.5";
        const repsField = document.createElement("input");
        repsField.type = "number";
        repsField.className = `editR${i}`;
        repsField.value = ex.reps;
        repsField.min = "1";
        repsField.step = "1";
        row.appendChild(label);
        row.appendChild(weightField);
        row.appendChild(repsField);
        form.appendChild(row);
      });
      const actionsRow = document.createElement("div");
      actionsRow.className = "row2";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-mini edit";
      saveBtn.setAttribute("data-edit-save", "");
      saveBtn.textContent = "Save";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-mini del";
      cancelBtn.setAttribute("data-edit-cancel", "");
      cancelBtn.textContent = "Cancel";
      actionsRow.appendChild(saveBtn);
      actionsRow.appendChild(cancelBtn);
      form.appendChild(actionsRow);
    } else if (currentExercise.isCardio) {
      if (
        currentExercise.name === "Jump Rope" ||
        currentExercise.name === "Plank"
      ) {
        const mins = Math.floor(s.duration / 60);
        const secs = s.duration % 60;
        form.innerHTML = `
        <div class="row">
          <input type="number" class="editDurMin" value="${mins}" min="0">
          <input type="number" class="editDurSec" value="${secs}" min="0" max="59">
        </div>
        <div class="row">
          <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
          <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
        </div>
        <div class="row2">
          <button type="button" class="btn-mini edit" data-edit-save>Save</button>
          <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
        </div>
      `;
      } else {
        form.innerHTML = `
        <div class="row">
          <input type="number" class="editD" value="${s.distance ?? ""}" min="0" step="0.01">
          <input type="number" class="editDur" value="${s.duration}" min="1">
        </div>
        <div class="row">
          <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
          <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
        </div>
        <div class="row2">
          <button type="button" class="btn-mini edit" data-edit-save>Save</button>
          <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
        </div>
      `;
      }
    } else {
      form.innerHTML = `
      <div class="row">
        <input type="number" class="editW" value="${s.weight}" min="0" step="0.5">
        <input type="number" class="editR" value="${s.reps}"   min="1" step="1">
      </div>
      <div class="row">
        <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
        <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
      </div>
      <div class="row2">
        <button type="button" class="btn-mini edit" data-edit-save>Save</button>
        <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
      </div>
      `;
    }
    if (!currentExercise.isCardio) addSetContextEditor(form, s);
    item.appendChild(form);
    const firstField = form.querySelector("input");
    if (firstField) firstField.focus();

    form.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (ev.target.hasAttribute("data-edit-save")) {
        if (currentExercise.isSuperset) {
          const updates = s.exercises.map((ex, i) => {
            const w = parseWorkoutNumber(form.querySelector(`.editW${i}`).value);
            const r = parseWorkoutNumber(form.querySelector(`.editR${i}`).value);
            return { ex, w, r };
          });
          if (updates.some(({ w, r }) => !canLogSet(w, r))) {
            showToast("Enter valid numbers for all exercises");
            return;
          }
          updates.forEach(({ ex, w, r }) => {
            const norm = normalizeSet({ name: ex.name, weight: w, reps: r });
            ex.weight = norm.weight;
            ex.reps = norm.reps;
          });
        } else if (currentExercise.isCardio) {
          const dField = form.querySelector(".editD");
          const rawD = dField ? parseFloat(dField.value) : null;
          const newD = dField ? (dField.value === "" ? null : rawD) : null;
          const durField = form.querySelector(".editDur");
          let newDur;
          if (durField) {
            newDur = parseInt(durField.value, 10);
          } else {
            const m =
              parseInt(form.querySelector(".editDurMin").value, 10) || 0;
            const se =
              parseInt(form.querySelector(".editDurSec").value, 10) || 0;
            newDur = m * 60 + se;
          }
          const vPlanned = form.querySelector(".editRestPlanned").value;
          const vActual = form.querySelector(".editRestActual").value;
          const newPlanned = vPlanned === "" ? null : parseInt(vPlanned, 10);
          const newActual = vActual === "" ? null : parseInt(vActual, 10);
          if (!canLogCardio(newD, newDur, currentExercise.name)) {
            showToast(
              ["Jump Rope", "Plank"].includes(currentExercise.name)
                ? "Enter valid duration"
                : "Enter valid distance & duration",
            );
            return;
          }
          const norm = normalizeSet({
            distance: newD,
            duration: newDur,
            restPlanned: newPlanned,
            restActual: newActual,
          });
          s.distance = norm.distance;
          s.duration = norm.duration;
          s.restPlanned = norm.restPlanned;
          s.restActual = norm.restActual;
        } else {
          const newW = parseWorkoutNumber(form.querySelector(".editW").value);
          const newR = parseWorkoutNumber(form.querySelector(".editR").value);
          const vPlanned = form.querySelector(".editRestPlanned").value;
          const vActual = form.querySelector(".editRestActual").value;

          const newPlanned = vPlanned === "" ? null : parseInt(vPlanned, 10);
          const newActual = vActual === "" ? null : parseInt(vActual, 10);

          const editRole = form.querySelector('.editRole')?.value || s.role;
          if (!canLogStrengthEntry(newW, newR, editRole)) {
            showToast("Enter valid weight & reps");
            return;
          }

          const norm = normalizeSet({
            weight: newW,
            reps: newR,
            restPlanned: newPlanned,
            restActual: newActual,
            role: editRole,
            roleSource: editRole === 'auto' ? 'auto' : 'manual',
            ...(editRole === 'auto' ? { recordedRole: 'auto' } : {}),
            outcome: editRole === 'failed_attempt' ? 'failed' : 'completed',
            rir: form.querySelector('.editRir')?.value,
            technique: form.querySelector('.editTechnique')?.value,
            pain: form.querySelector('.editPain')?.value,
          });
          s.weight = norm.weight;
          s.reps = norm.reps;
          s.restPlanned = norm.restPlanned;
          s.restActual = norm.restActual;
          s.role = norm.role;
          s.roleSource = norm.roleSource;
          if (norm.recordedRole) s.recordedRole = norm.recordedRole;
          else delete s.recordedRole;
          delete s.roleConfidence;
          delete s.roleReason;
          delete s.classificationVersion;
          s.completed = norm.completed;
          s.outcome = norm.outcome;
          s.rir = norm.rir;
          s.technique = norm.technique;
          s.pain = norm.pain;
        }

        if (currentExercise.isSuperset) {
          const contextNorm = normalizeSet({
            exercises: s.exercises,
            role: form.querySelector('.editRole')?.value,
            roleSource: form.querySelector('.editRole')?.value === 'auto' ? 'auto' : 'manual',
            ...(form.querySelector('.editRole')?.value === 'auto'
              ? { recordedRole: 'auto' }
              : {}),
            rir: form.querySelector('.editRir')?.value,
            technique: form.querySelector('.editTechnique')?.value,
            pain: form.querySelector('.editPain')?.value,
          });
          s.role = contextNorm.role;
          s.roleSource = contextNorm.roleSource;
          if (contextNorm.recordedRole) s.recordedRole = contextNorm.recordedRole;
          else delete s.recordedRole;
          delete s.roleConfidence;
          delete s.roleReason;
          delete s.classificationVersion;
          s.completed = contextNorm.completed;
          s.outcome = contextNorm.outcome;
          s.rir = contextNorm.rir;
          s.technique = contextNorm.technique;
          s.pain = contextNorm.pain;
          s.exercises.forEach((inner) => {
            inner.role = contextNorm.role;
            inner.roleSource = contextNorm.roleSource;
            if (contextNorm.recordedRole) inner.recordedRole = contextNorm.recordedRole;
            else delete inner.recordedRole;
            delete inner.roleConfidence;
            delete inner.roleReason;
            delete inner.classificationVersion;
          });
        }

        saveState();
        rebuildSetsList();
        updateSummary();
        updateSetsToday();
        refreshExerciseGoalProgress();
        renderExerciseGoalPanel();
        form.remove();
        const editBtn = setsList.querySelector(
          `.set-item[data-index="${idx}"] button[data-action="edit"]`,
        );
        if (editBtn) editBtn.focus();
      }
      if (ev.target.hasAttribute("data-edit-cancel")) {
        form.remove();
        const editBtn = item.querySelector('button[data-action="edit"]');
        if (editBtn) editBtn.focus();
        return;
      }
    });
  }

  function renumberSets() {
    currentExercise.sets.forEach((s, i) => (s.set = i + 1));
    currentExercise.nextSet = currentExercise.sets.length + 1;
  }

  function updateSetCounter() {
    if (!currentExercise) return;
    setCounterEl.textContent = currentExercise.nextSet;
    exerciseNameEl.textContent = currentExercise.name;
    if (exerciseStage) {
      exerciseStage.style.setProperty('--set-energy', String(Math.min(1, .2 + ((currentExercise.nextSet || 1) - 1) * .16)));
    }
  }

  /* ------------------ NEXT EXERCISE ------------------ */
  nextExerciseBtn.addEventListener("click", () => {
    finishRest({ announceCompletion: false, hide: true });
    const finishedName = currentExercise ? currentExercise.name : "";
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    currentExercise = null;
    exerciseSelect.value = "";
    interfaceBox.classList.add("hidden");
    document.body.classList.remove("workout-active", "resting");
    weightInput.value = "";
    repsInput.value = "";
    distanceInput.value = "";
    durationMinInput.value = "";
    durationSecInput.value = "";
    resetPendingSetContext();
    cardioInputs.classList.add("hidden");

    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
    if (finishedName) announce(`Finished ${finishedName}`);
  });

  function pushOrMergeExercise(ex) {
    const existing = session.exercises.find(
      (candidate) => exerciseGoalKey(candidate.name) === exerciseGoalKey(ex.name)
        && !!candidate.isSuperset === !!ex.isSuperset
        && !!candidate.isCardio === !!ex.isCardio,
    );
    if (existing) {
      existing.progressionProfile = normalizeExerciseProfile(ex.progressionProfile);
      if (ex.progressionProfiles) {
        existing.progressionProfiles = {
          ...(existing.progressionProfiles || {}),
          ...ex.progressionProfiles,
        };
      }
      ex.sets.forEach((s) => {
        const norm = normalizeSet({ ...s, set: existing.sets.length + 1 });
        existing.sets.push(norm);
      });
    } else {
      session.exercises.push({
        name: ex.name,
        isSuperset: ex.isSuperset || false,
        isCardio: ex.isCardio || false,
        exercises: ex.exercises ? [...ex.exercises] : undefined,
        progressionProfiles: ex.progressionProfiles
          ? deepClone(ex.progressionProfiles)
          : undefined,
        progressionProfile: normalizeExerciseProfile(ex.progressionProfile),
        sets: ex.sets.map((s) => normalizeSet({ ...s })),
      });
    }
  }

  /* ------------------ REST TIMER ------------------ */
  function startRest(seconds, setIndex) {
    if (restTargetSet) finishRest({ announceCompletion: false, hide: true });
    stopRest();
    document.body.classList.add("resting");
    restSecondsRemaining = seconds;
    restStartMs = Date.now();
    restDeadlineMs = restStartMs + (seconds * 1000);
    restSetIndex = setIndex;
    restTargetSet = currentExercise?.sets?.[setIndex] || null;
    updateRestDisplay();
    restBox.classList.remove("hidden");
    announce(`Rest started for ${formatSec(seconds)}`);
    const tick = () => {
      restSecondsRemaining = Math.max(0, Math.ceil((restDeadlineMs - Date.now()) / 1000));
      updateRestDisplay();
      if (restSecondsRemaining <= 0) {
        finishRest();
        restDisplay.textContent = "Ready!";
        setTimeout(() => restBox.classList.add("hidden"), 1500);
      }
    };
    restTimer = setInterval(tick, 250);
  }

  function stopRest() {
    if (restTimer) {
      clearInterval(restTimer);
      restTimer = null;
    }
    document.body.classList.remove("resting");
  }

  function finishRest({ announceCompletion = true, hide = false } = {}) {
    if (!restTargetSet && !restStartMs) {
      stopRest();
      if (hide) restBox.classList.add('hidden');
      return;
    }
    stopRest();
    if (announceCompletion) announce("Rest finished");
    const elapsed = Math.min(86400, Math.max(0, Math.round((Date.now() - restStartMs) / 1000)));
    if (restTargetSet) {
      restTargetSet.restActual = elapsed;
      saveState();
      if (currentExercise) rebuildSetsList();
    }
    restSetIndex = null;
    restTargetSet = null;
    restStartMs = 0;
    restDeadlineMs = 0;
    restSecondsRemaining = 0;
    if (hide) restBox.classList.add('hidden');
  }

  function updateRestDisplay() {
    const m = Math.floor(restSecondsRemaining / 60);
    const s = restSecondsRemaining % 60;
    restDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  restBox.addEventListener("click", function () {
    finishRest({ hide: true });
  });
  restBox.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    finishRest({ hide: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && restTargetSet && restDeadlineMs) {
      restSecondsRemaining = Math.max(0, Math.ceil((restDeadlineMs - Date.now()) / 1000));
      updateRestDisplay();
      if (restSecondsRemaining <= 0) finishRest({ hide: false });
    }
  });
  window.addEventListener('beforeunload', () => {
    if (restTargetSet) finishRest({ announceCompletion: false, hide: true });
  });

  /* ------------------ CALENDAR SAVE ------------------ */
  function saveSessionLinesToHistory(){
    const snapshot = getSessionSnapshot();
    if(!snapshot.length) return;
    const lines = [];
    snapshot.forEach(ex => {
      if(ex.isSuperset){
        ex.sets.forEach((set, setIdx) => {
          set.exercises.forEach(sub => {
            const setNumber = set.set || setIdx + 1;
            const role = normalizeSetRole(sub.role ?? set.role);
            lines.push(role === 'failed_attempt'
              ? `${sub.name}: Set ${setNumber} - Failed attempt at ${sub.weight} lbs`
              : `${sub.name}: Set ${setNumber} - ${sub.weight} lbs × ${sub.reps} rep${Number(sub.reps) === 1 ? '' : 's'}`);
          });
        });
      } else if(ex.isCardio){
        ex.sets.forEach((set, setIdx) => {
          lines.push(formatCardioHistoryLine(ex.name, set, setIdx + 1));
        });
      } else {
        ex.sets.forEach((set, setIdx) => {
          const setNumber = set.set || setIdx + 1;
          lines.push(normalizeSetRole(set.role) === 'failed_attempt'
            ? `${ex.name}: Set ${setNumber} - Failed attempt at ${set.weight} lbs`
            : `${ex.name}: Set ${setNumber} - ${set.weight} lbs × ${set.reps} rep${Number(set.reps) === 1 ? '' : 's'}`);
        });
      }
    });
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const history = wtStorage.get(WT_KEYS.history, {});
    history[dateStr] = upsertStructuredHistoryLines(history[dateStr], lines);
    wtStorage.set(WT_KEYS.history, history);
    window.dispatchEvent(new Event('wt-history-updated'));
  }

  // Build a deep copy of all exercises including the in-progress one
  function buildExportExercises() {
    return mergeWorkoutExercises([
      ...session.exercises,
      ...(currentExercise && currentExercise.sets.length ? [currentExercise] : []),
    ]);
  }

  function endWorkout({ persistCompleted = true } = {}) {
    finishRest({ announceCompletion: false, hide: true });
    const date = getLocalDateString();
    const snapshot = attachExerciseGoalSnapshots(
      buildExportExercises(),
      exerciseGoals,
      date,
    );
    if (persistCompleted && snapshot.length) {
      const completedId = session.completedId || `workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const savedWorkouts = wtStorage.get(WT_KEYS.completed, null) || { ...archivedSessions };
      const record = normalizePayload({ date, timestamp: new Date().toISOString(), exercises: snapshot,
        goals: sanitizeGoals(goals).filter(goal => goal.active).map(goal => goal.text),
        constraints: sanitizeConstraints(constraints),
        sessionContext: buildSessionPlanningContext(sessionStatus, nextWorkoutMinutes) });
      if (!wtStorage.set(WT_KEYS.completed, { ...savedWorkouts, [completedId]: record })) {
        showToast('Could not save the workout. Your sets are still here. Export a backup before trying again.');
        return false;
      }
      session.completedId = completedId;
      if (!wtStorage.set(WT_KEYS.last, snapshot)) return false;
      if (!wtStorage.set(WT_KEYS.lastMeta, {
        date,
        timestamp: new Date().toISOString(),
        sessionContext: buildSessionPlanningContext(sessionStatus, nextWorkoutMinutes),
      })) return false;
      saveSessionLinesToHistory();
      const completed = normalizePayload({
        date,
        timestamp: new Date().toISOString(),
        exercises: snapshot,
        goals: sanitizeGoals(goals).filter((goal) => goal.active).map((goal) => goal.text),
        constraints: sanitizeConstraints(constraints),
        sessionContext: buildSessionPlanningContext(sessionStatus, nextWorkoutMinutes),
      });
      if (session.startedAt) {
        const startMs = new Date(session.startedAt).getTime();
        const endMs = Date.now();
        if (Number.isFinite(startMs) && endMs >= startMs) {
          completed.session = {
            sessionStart: new Date(startMs).toISOString(),
            sessionEnd: new Date(endMs).toISOString(),
            sessionDurationSec: Math.round((endMs - startMs) / 1000),
          };
        }
      }
      archivedSessions[date] = {
        ...(archivedSessions[date] || {}),
        ...completed,
        sessionContext: buildSessionPlanningContext(sessionStatus, nextWorkoutMinutes),
      };
      archivedSessions = pruneArchive(archivedSessions, 120);
      if (!wtStorage.set(WT_KEYS.archive, archivedSessions)) return false;
      // Finishing saves the workout without clearing the visible or persisted sets.
      session.finishedAt = new Date().toISOString();
      stopSessionTimer();
      saveState();
      updateSummary();
      return true;
    }
    stopRest();
    restSetIndex = null;
    restTargetSet = null;
    restSecondsRemaining = 0;
    restStartMs = 0;
    restDeadlineMs = 0;
    restBox.classList.add("hidden");
    restDisplay.textContent = "00:00";
    stopSessionTimer();
    session = { exercises: [], startedAt: null };
    currentExercise = null;
    exerciseSelect.value = "";
    interfaceBox.classList.add("hidden");
    document.body.classList.remove("workout-active", "resting");
    setsList.innerHTML = "";
    weightInput.value = "";
    repsInput.value = "";
    distanceInput.value = "";
    durationMinInput.value = "";
    durationSecInput.value = "";
    resetPendingSetContext();
    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
    return true;
  }

  /* ------------------ RESET WORKOUT ------------------ */
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmModal("Clear the current workout and start fresh? Saved workouts and goals will stay saved.", { yesText: 'Reset', noText: 'Cancel', title: 'Reset Workout' });
    if (!ok) return;
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({ type: "reset", payload: { prevSession, prevCurrent } });
    endWorkout({ persistCompleted: false });
    announce("Workout reset");
    document.getElementById('exerciseSelect').scrollIntoView({ block: 'center', behavior: 'smooth' });
    showToast("Current workout cleared. Choose an exercise to begin.", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ FINISH WORKOUT ------------------ */
  finishBtn.addEventListener("click", async () => {
    if (!buildExportExercises().some(ex => ex.sets.length)) {
      showToast('Log at least one set before finishing.');
      return;
    }
    const ok = await confirmModal("Save this workout as finished? All your sets will stay visible and available to export.", { yesText: 'Save Workout', noText: 'Cancel', title: 'Finish Workout' });
    if (!ok) return;
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({
      type: "finish",
      payload: {
        prevSession,
        prevCurrent,
        storageSnapshot: captureUndoStorage(),
      },
    });
    if (!endWorkout({ persistCompleted: true })) return;
    announce("Workout finished");
    showToast("Workout saved. Your sets are still available below.", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ SUMMARY ------------------ */
  function updateSummary() {
    let totalSets = 0;
    summaryText.innerHTML = "";
    if (session.finishedAt) {
      const saved = document.createElement('p');
      saved.textContent = 'Workout saved. Review or export your sets below. If you change any sets, finish again to update the saved copy. Start a new workout when you are ready.';
      const next = document.createElement('button');
      next.className = 'btn';
      next.textContent = 'Start New Workout';
      next.addEventListener('click', async () => {
        if (!await confirmModal('Start a new empty workout? This finished workout remains saved.', { title: 'New Workout', yesText: 'Start New', noText: 'Cancel' })) return;
        endWorkout({ persistCompleted: false });
      });
      summaryText.append(saved, next);
    }
    session.exercises.forEach((ex, i) => {
      totalSets += ex.sets.length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.appendChild(
        document.createTextNode(`${ex.name}: ${ex.sets.length} sets `),
      );
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-mini edit";
      editBtn.dataset.summaryEdit = String(i);
      editBtn.textContent = "Edit";
      item.appendChild(editBtn);
      summaryText.appendChild(item);
    });
    if (currentExercise && currentExercise.sets.length) {
      totalSets += currentExercise.sets.length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.textContent = `${currentExercise.name}: ${currentExercise.sets.length} sets (in progress)`;
      summaryText.appendChild(item);
    }

    if (totalSets === 0) {
      summaryText.textContent = "Start your first exercise to begin tracking.";
    } else {
      const total = document.createElement("strong");
      total.textContent = `Total Sets: ${totalSets}`;
      summaryText.prepend(document.createElement("br"));
      summaryText.prepend(total);
    }
    const savedRecords = Object.values(wtStorage.get(WT_KEYS.completed, null) || archivedSessions)
      .filter(record => record && Array.isArray(record.exercises))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    if (savedRecords.length) {
      const savedPanel = document.createElement('details');
      savedPanel.className = 'saved-workouts';
      const heading = document.createElement('summary');
      heading.textContent = `Saved Workouts (${savedRecords.length})`;
      savedPanel.appendChild(heading);
      summaryText.appendChild(savedPanel);
      savedRecords.forEach(record => {
        const row = document.createElement('div');
        row.className = 'saved-workout-row';
        const count = record.exercises.reduce((sum, ex) => sum + (Array.isArray(ex?.sets) ? ex.sets.filter(Boolean).length : 0), 0);
        const label = document.createElement('span');
        label.textContent = `${record.date || 'Undated workout'} · ${count} sets`;
        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'saved-workout-download';
        download.textContent = 'Download Workout';
        download.addEventListener('click', () => triggerDownload(
          new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
          `workout_${record.date}_${String(record.timestamp).replace(/[^0-9]/g, '')}.json`,
        ));
        row.append(label, download);
        savedPanel.appendChild(row);
      });
    }
  }

  summaryText.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-summary-edit]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.summaryEdit, 10);
    finishRest({ announceCompletion: false, hide: true });
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    currentExercise = session.exercises.splice(idx, 1)[0];
    resetPendingSetContext({ clearMeasurements: true });
    showInterface();
    if (currentExercise.isSuperset) {
      setupSupersetInputs(currentExercise.exercises);
      standardInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      supersetInputs.classList.remove("hidden");
    } else if (currentExercise.isCardio) {
      supersetInputs.classList.add("hidden");
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
    } else {
      supersetInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    rebuildSetsList();
    updateSetCounter();
    updateLogButtonState();
    updateSummary();
    updateSetsToday();
  });

  /* ------------------ EXPORT (JSON + AI + CSV) ------------------ */
  exportBtn.addEventListener("click", async () => {
    let exportExercises = buildExportExercises();
    let exportDate = getLocalDateString();
    if (exportExercises.length) {
      wtStorage.set(WT_KEYS.last, exportExercises);
      wtStorage.set(WT_KEYS.lastMeta, {
        date: exportDate,
        timestamp: new Date().toISOString(),
        sessionContext: buildSessionPlanningContext(sessionStatus, nextWorkoutMinutes),
      });
      saveSessionLinesToHistory();
    } else {
      const last = wtStorage.get(WT_KEYS.last, null);
      if (last && last.length) {
        const lastMeta = wtStorage.get(WT_KEYS.lastMeta, {});
        exportDate = /^\d{4}-\d{2}-\d{2}$/.test(String(lastMeta?.date || ''))
          ? lastMeta.date
          : getLocalDateString();
        const reExport = await confirmModal(
          `There is no active workout. Re-export the saved workout from ${formatShortDate(exportDate)}?`,
          {
            yesText: 'Re-export',
            noText: 'Cancel',
            title: 'Re-export Saved Workout',
          },
        );
        if (!reExport) return;
        exportExercises = last;
      } else {
        showToast("No workout data yet.");
        return;
      }
    }
    
    // Ask whether to include notes first, then ask for session time
    confirmModal("Include workout notes in export?", {
      yesText: "Yes",
      noText: "No",
      title: "Export Options",
    }).then((includeNotes) => {
      // Honor preference: if ON include without asking; if OFF exclude without asking
      const alwaysSession = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
      performExport(exportExercises, includeNotes, alwaysSession, exportDate);
    });
  });
  
  function performExport(
    exportExercises,
    includeNotes,
    includeSessionTime,
    currentDate = getLocalDateString(),
  ) {
    const includeExerciseGoalProgress = !!wtStorage.get(
      WT_KEYS.prefExerciseGoalProgress,
      false,
    );
    const goalsForExport = sanitizeGoals(goals)
      .filter((g) => g.active)
      .map((g) => g.text);
    const constraintsForExport = sanitizeConstraints(constraints);

    const normalized = normalizePayload({
      date: currentDate,
      timestamp: new Date().toISOString(),
      exercises: attachExerciseGoalSnapshots(
        exportExercises,
        exerciseGoals,
        currentDate,
      ),
      goals: goalsForExport,
      constraints: constraintsForExport,
    });

    const performedGoalSnapshots = [];
    normalized.exercises.forEach((exercise) => {
      if (exercise.goal) performedGoalSnapshots.push(exercise.goal);
      (exercise.exerciseGoals || []).forEach((goal) => performedGoalSnapshots.push(goal));
    });
    const payload = {
      ...normalized,
      exercises: prepareExerciseGoalsForExport(
        normalized.exercises,
        includeExerciseGoalProgress,
      ),
      sessionContext: buildSessionPlanningContext(
        sessionStatus,
        nextWorkoutMinutes,
      ),
    };

    let workoutNotes = [];
    if (includeNotes) {
      const history = wtStorage.get(WT_KEYS.history, {});
      workoutNotes = Array.isArray(history[currentDate]) ? history[currentDate] : [];
      const logLineRe = /^.+:\s*Set\s*\d+\s*[-–]\s*(?:Failed attempt at\b|.*(?:lbs\s*[×xX]|mi\s+in\b|\d+(?:\.\d+)?\s*[hms]\b))/i;
      workoutNotes = workoutNotes.filter((line) =>
        !logLineRe.test(String(line).trim()),
      );
      if (workoutNotes.length) {
        payload.workoutNotes = workoutNotes;
      }
    }

    let sessionMeta = null;
    if (includeSessionTime) {
      const timestamps = [];
      payload.exercises.forEach((ex) => {
        ex.sets.forEach((s) => {
          if (s && typeof s.ts === 'number') timestamps.push(s.ts);
        });
      });
      let startTs = null;
      let endTs = null;
      if (session && session.startedAt) {
        startTs = new Date(session.startedAt).getTime();
        endTs = Date.now();
      } else if (timestamps.length) {
        startTs = Math.min(...timestamps);
        endTs = Math.max(...timestamps);
      }
      if (startTs != null && endTs >= startTs) {
        const durationSec = Math.max(0, Math.round((endTs - startTs) / 1000));
        sessionMeta = {
          sessionStart: new Date(startTs).toISOString(),
          sessionEnd: new Date(endTs).toISOString(),
          sessionDurationSec: durationSec,
        };
        payload.session = sessionMeta;
      }
    }

    // Load calendar titles to match day type
    let titlesByDate = {};
    try {
      const rawTitles = localStorage.getItem('wt_history_titles');
      titlesByDate = rawTitles ? JSON.parse(rawTitles) : {};
    } catch {}

    let previousSessions = Object.entries(archivedSessions || {})
      .filter(([date]) => date !== payload.date)
      .map(([date, data]) =>
        normalizePayload({
          ...data,
          date: data && data.date ? data.date : date,
        }),
      )
      .sort((a, b) => (a.date > b.date ? -1 : 1));

    // If a day type is selected, filter to matching titles
    if (dayType) {
      const target = String(dayType).toLowerCase();
      const keywordMap = {
        back: ['row', 'pull', 'lat', 'pulldown', 'deadlift', 'rear delt'],
        chest: ['bench', 'press', 'push up', 'fly'],
        legs: ['squat', 'leg', 'lunge', 'calf', 'hamstring', 'quad'],
        shoulders: ['overhead', 'ohp', 'shoulder', 'lateral raise', 'rear delt'],
        arms: ['curl', 'tricep', 'bicep', 'extension', 'skullcrusher'],
        push: ['bench', 'press', 'shoulder', 'tricep', 'dip', 'push'],
        pull: ['row', 'pull', 'lat', 'pulldown', 'curl', 'deadlift'],
        upper: ['bench', 'press', 'row', 'pull', 'curl', 'tricep', 'shoulder'],
        lower: ['squat', 'leg', 'lunge', 'calf', 'deadlift', 'hamstring', 'quad'],
        cardio: ['run', 'jog', 'walk', 'bike', 'cycle', 'rower', 'elliptical', 'jump rope', 'plank']
      };
      const kw = keywordMap[target] || [];

      const titleOrHeuristic = (s) => {
        const t = String(titlesByDate[s.date] || '').toLowerCase();
        if (t === target) return true;
        if (!kw.length) return false;
        // Heuristic: count matches by exercise name
        let names = [];
        if (Array.isArray(s.exercises)) {
          s.exercises.forEach((ex) => {
            if (!ex) return;
            if (ex.isSuperset && Array.isArray(ex.sets)) {
              ex.sets.forEach((set) => {
                (set.exercises || []).forEach((inner) => names.push(String(inner.name || '')));
              });
            } else {
              names.push(String(ex.name || ''));
            }
          });
        }
        const total = names.length || 1;
        const hits = names.filter((n) => {
          const low = n.toLowerCase();
          return kw.some((k) => low.includes(k));
        }).length;
        return hits / total >= 0.4; // include if ~40% exercises match
      };

      previousSessions = previousSessions.filter(titleOrHeuristic);
    }

    // Limit by comparison window (or none)
    if (dayCompare === 'none') previousSessions = [];
    else if (dayCompare === '3') previousSessions = previousSessions.slice(0, 3);
    else if (dayCompare === '7') previousSessions = previousSessions.slice(0, 7);

    const exerciseSelection = buildExerciseSelectionReference(payload);
    payload.exerciseSelection = exerciseSelection;

    const currentStats = computeSessionStats(payload);
    const previousStats = previousSessions.map((session) =>
      computeSessionStats(session),
    );
    const highlights = buildExerciseHighlightsForExport(
      currentStats,
      previousStats,
    );
    if (highlights.length) {
      payload.exerciseHighlights = sanitizeExerciseHighlights(highlights);
    }
    const prevByName = new Map();
    const prevHistoryByName = new Map();
    previousStats.forEach((sess) => {
      (sess.exercises || []).forEach((ex) => {
        if (!ex || !ex.name) return;
        const key = exerciseGoalKey(ex.name);
        if (!prevHistoryByName.has(key)) prevHistoryByName.set(key, []);
        prevHistoryByName.get(key).push(ex);
        if (!prevByName.has(key)) prevByName.set(key, ex);
      });
    });
    const progressionLines = [];
    const nextTargetLines = [];
    const progressionDecisions = [];
    (currentStats.exercises || []).forEach((ex) => {
      const prev = prevByName.get(exerciseGoalKey(ex.name));
      if (prev) {
        const currentProgressionVolume = getProgressionVolume(ex);
        const previousProgressionVolume = getProgressionVolume(prev);
        if (currentProgressionVolume <= 0) {
          progressionLines.push(
            `${ex.name} – No classified progression sets; volume and load progression comparison withheld.`,
          );
        } else if (previousProgressionVolume > 0) {
          const volChange = formatPercentChange(
            currentProgressionVolume,
            previousProgressionVolume,
          );
        const topChange = formatPercentChange(
          ex.topSet?.weight ?? null,
          prev.topSet?.weight ?? null,
        );
        const prevTop = formatTopSet(prev.topSet);
        const currTop = formatTopSet(ex.topSet);
        const prevVol = formatVolumeNumber(previousProgressionVolume);
        const currVol = formatVolumeNumber(currentProgressionVolume);
        progressionLines.push(
          `${ex.name} – Progression volume: ${prevVol} → ${currVol} (${volChange}); Top successful set: ${prevTop} → ${currTop} (${topChange})`,
        );
        }
      }

      const history = prevHistoryByName.get(exerciseGoalKey(ex.name)) || [];
      const decisionSupport = buildStrengthDecisionSupport(
        ex,
        prev,
        null,
        history.slice(1),
      );
      if (decisionSupport) {
        nextTargetLines.push(decisionSupport.text);
        progressionDecisions.push({
          exercise: ex.name,
          primaryAction: decisionSupport.decision,
          confidence: decisionSupport.confidence,
          repRange: decisionSupport.repRange,
          targetRir: decisionSupport.targetRir,
          nextLoad: decisionSupport.nextLoad,
          predictedMinimumRepsAtNextLoad: decisionSupport.predictedMinimumRepsAtNextLoad,
          nextLoadPreservesRepMinimum: decisionSupport.nextLoadPreservesRepMinimum,
          evidenceTrace: decisionSupport.evidenceTrace,
        });
      }
    });
    if (progressionDecisions.length) payload.progressionDecisions = progressionDecisions;

    const jsonStr = JSON.stringify(payload, null, 2);
    triggerDownload(
      new Blob([jsonStr], { type: "application/json" }),
      `workout_${payload.date}.json`,
    );

    const csvColumns = [
      "Exercise", "Set", "Weight", "Reps", "Distance", "Duration", "Time",
      "RestPlanned(sec)", "RestActual(sec)", "SetRole", "RoleSource",
      "RoleConfidence", "RoleReason", "Outcome", "RIR",
      "Technique", "Pain", "GoalType", "GoalValue", "GoalUnit",
    ];
    if (includeExerciseGoalProgress) {
      csvColumns.push("CurrentBest", "GoalRemaining", "ProgressPercent");
    }
    const csvHeader = `${csvColumns.join(",")}\n`;
    const goalCsvCells = (goal) => {
      const cells = [
        goal?.goalType ?? "",
        goal?.goalValue ?? "",
        goal?.unit ?? "",
      ];
      if (includeExerciseGoalProgress) {
        cells.push(
          goal?.currentBestPerformance ?? "",
          goal?.remainingDistanceToGoal ?? "",
          goal?.progressPercentage ?? "",
        );
      }
      return cells;
    };
    let csv = csvHeader;
    if (includeSessionTime && sessionMeta) {
      const meta = [
        `SessionStart,${sessionMeta.sessionStart}`,
        `SessionEnd,${sessionMeta.sessionEnd}`,
        `SessionDuration(sec),${sessionMeta.sessionDurationSec}`,
        "",
      ].join("\n");
      csv = meta + "\n" + csvHeader;
    }
    payload.exercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        if (ex.isSuperset) {
          s.exercises.forEach((sub) => {
            const context = { ...s, ...sub, exercises: undefined };
            const goal = (ex.exerciseGoals || []).find(
              (item) => exerciseGoalKey(item.exerciseName) === exerciseGoalKey(sub.name),
            );
            csv += `${csvRow([
              sub.name, s.set, sub.weight, sub.reps, "", "", s.time,
              s.restPlanned ?? "", s.restActual ?? "",
              context.role ?? "unknown", context.roleSource ?? "manual",
              context.roleConfidence ?? "", context.roleReason ?? "",
              context.outcome ?? "completed", context.rir ?? "",
              context.technique ?? "unknown", context.pain ?? "unknown",
              ...goalCsvCells(goal),
            ])}\n`;
          });
        } else if (ex.isCardio) {
          const goal = ex.goal;
          csv += `${csvRow([
            ex.name, s.set, "", "", s.distance ?? "", s.duration ?? "", s.time,
            s.restPlanned ?? "", s.restActual ?? "",
            ...Array(8).fill(""),
            ...goalCsvCells(goal),
          ])}\n`;
        } else {
          const goal = ex.goal;
          csv += `${csvRow([
            ex.name, s.set, s.weight, s.reps, "", "", s.time,
            s.restPlanned ?? "", s.restActual ?? "",
            s.role ?? "unknown", s.roleSource ?? "manual",
            s.roleConfidence ?? "", s.roleReason ?? "",
            s.outcome ?? "completed", s.rir ?? "",
            s.technique ?? "unknown", s.pain ?? "unknown",
            ...goalCsvCells(goal),
          ])}\n`;
        }
      });
    });
    triggerDownload(
      new Blob([csv], { type: "text/csv" }),
      `workout_${payload.date}.csv`,
    );

    if (wtStorage.get(WT_KEYS.prefSessionTime, false)) {
      showToast("Always include session time is ON", {
        actionLabel: "Turn off",
        onAction: () => {
          wtStorage.set(WT_KEYS.prefSessionTime, false);
          showToast("Preference updated: session time won't be auto-included.");
        },
      });
    }

    const constraintLines = describeConstraintsLines(payload.constraints);

    let aiText = `WORKOUT DATA - ${payload.date}\n\n`;
    aiText += `SESSION SNAPSHOT\n`;
    aiText += `- Total logged sets: ${payload.totalSets} (all logged roles; see classification below)\n`;
    aiText += `- Mechanical volume load: ${formatVolumeNumber(currentStats.totalVolume)} (sum weight × reps; useful for comparison, not a direct measure of fatigue or training quality)\n`;
    const explicitProgressionSets = currentStats.roleCounts.working
      + currentStats.roleCounts.top_set
      + currentStats.roleCounts.back_off;
    aiText += `- Strength set-entry classification: ${currentStats.warmupSetCount} warm-up/ramp; ${explicitProgressionSets} working/top/back-off; ${currentStats.roleCounts.technique} technique; ${currentStats.failedAttemptCount} failed; ${currentStats.roleCounts.unknown + currentStats.roleCounts.auto} unclassified. (Each exercise inside a superset is counted separately.)\n`;
    const strengthSetCount = Object.values(currentStats.roleCounts)
      .reduce((sum, count) => sum + Number(count || 0), 0);
    if (strengthSetCount) {
      const inferredCount = currentStats.roleSourceCounts.auto
        + currentStats.roleSourceCounts.legacy_default;
      aiText += `- Classification source: ${inferredCount} automatically inferred; ${currentStats.roleSourceCounts.manual} user-marked; ${currentStats.roleSourceCounts.system} outcome-determined. Automatic labels are transparent estimates, not claims that the user selected those roles.\n`;
    }
    if (currentStats.totalCardioDuration) {
      aiText += `- Cardio duration: ${formatSecondsHuman(currentStats.totalCardioDuration)}\n`;
    }
    if (includeSessionTime && sessionMeta) {
      aiText += `- Session duration: ${formatSecondsHuman(sessionMeta.sessionDurationSec)}\n`;
    }
    aiText += `\n`;

    aiText += `AUTOMATIC COACHING CONTRACT\n`;
    aiText += `- The user has chosen a long-term result and should not have to design the next workout. Do the progression calculations for them.\n`;
    aiText += `- Put a short DO THIS NEXT section first. Give one primary prescription, not a menu of programs or choices.\n`;
    aiText += `- The current exported session is the only source of exercise selection. Include every current-session exercise and do not add exercises from history, another workout day, or earlier AI recommendations.\n`;
    aiText += `- Keep the long-term goal fixed, update the next step from completed evidence after every export, and show the load/repetition/set percentage change used.\n`;
    aiText += `- The user should only need to follow the prescription, log what happened, and export again. Reserve alternatives for pain, unavailable equipment, or a red-readiness safety rule.\n\n`;

    aiText += `SESSION COMPLETION & NEXT-WORKOUT BUDGET\n`;
    aiText += `- Current session status: ${payload.sessionContext.statusLabel}\n`;
    if (payload.sessionContext.status === 'time_limited') {
      aiText += `- Interpretation: Omitted exercises and lower total volume are not regressions. Prescribe every exercise actually logged in this export, but do not recover or add exercises from older workouts merely because time ran out. Put the current-session exercises in priority order and do not add catch-up sets.\n`;
    } else if (payload.sessionContext.status === 'pain_limited') {
      aiText += `- Interpretation: Do not progress or re-prescribe painful movements without a pain-free alternative and an appropriate stop rule.\n`;
    } else if (payload.sessionContext.status === 'recovery_limited') {
      aiText += `- Interpretation: Treat lower output as readiness-limited until comparable recovered-session evidence shows otherwise.\n`;
    } else if (payload.sessionContext.isIncomplete) {
      aiText += `- Interpretation: Do not classify omitted exercises or lower session totals as regressions.\n`;
    }
    if (payload.sessionContext.nextWorkoutMinutes != null) {
      aiText += `- Hard time budget for the next workout: ${payload.sessionContext.nextWorkoutMinutes} minutes, including warm-ups and rest.\n`;
      aiText += `- MUST DO FIRST duration target: at most ${payload.sessionContext.mustDoTargetMinutes} minutes, leaving ${payload.sessionContext.timeBufferMinutes} minutes for normal setup and transition uncertainty. Still display every remaining current-session exercise afterward under CONTINUE IF TIME, with its exact sets, reps, load, rest, and normal per-exercise dose.\n`;
    } else {
      aiText += `- Next-workout time budget: Not provided. Show the complete current-session exercise list and its full estimated duration. Do not omit a current-session exercise merely because this session ran out of time, and do not add an exercise from history. Do not exceed the latest completed comparable session's normal per-exercise workload without a specific recovery-based reason.\n`;
    }
    aiText += `\n`;

    aiText += `CURRENT-SESSION EXERCISE SELECTION (MANDATORY)\n`;
    aiText += `- Required exercise list from this export: ${exerciseSelection.requiredExercises.length ? exerciseSelection.requiredExercises.join('; ') : 'No exercises available'}\n`;
    aiText += `- Historical data controls progression only. It may change the next weight, repetitions, sets, rest, or progression decision for a current-session exercise, but it must never add an exercise that is absent from this export.\n`;
    aiText += `- Include every exercise in the required current-session list and include no other exercise. Do not combine exercises from different workout days, older exports, other conversations, or previous AI recommendations.\n`;
    aiText += `- An exercise may be added, removed, or replaced only when the user explicitly requests it, this export explicitly requests a change, a completed goal has a saved next-step instruction, or pain, safety, or unavailable equipment requires a substitution. Label every permitted substitution and explain why.\n`;
    aiText += `- Time affects priority, not the required current-session list: put the time-fitting portion under MUST DO FIRST, then show every other current-session exercise under CONTINUE IF TIME with exact instructions.\n`;
    aiText += `- Do not turn missed work into catch-up volume. Give each exercise only its normal evidence-based dose.\n\n`;

    aiText += `SESSION GOALS & FOCUS\n`;
    if (goalsForExport.length) {
      goalsForExport.forEach((goal) => {
        aiText += `- ${goal}\n`;
      });
    } else {
      aiText += `- None specified.\n`;
    }
    aiText += `\n`;

    aiText += `PERSONAL EXERCISE GOALS (performed exercises only)\n`;
    if (performedGoalSnapshots.length) {
      performedGoalSnapshots.forEach((goal) => {
        aiText += `${goal.exerciseName}:\n`;
        aiText += `  Goal: ${formatGoalNumber(goal.goalValue)} ${goal.unit} (${goal.goalType})\n`;
        aiText += `  Automatic coaching path: ${goal.goalPathLabel}\n`;
        if (includeExerciseGoalProgress) {
          aiText += `  App-tracked logged best: ${formatGoalNumber(goal.currentBestPerformance)} ${goal.unit}\n`;
          aiText += `  Arithmetic distance from goal: ${formatGoalNumber(goal.remainingDistanceToGoal)} ${goal.unit}\n`;
          aiText += `  Arithmetic goal ratio: ${formatGoalNumber(goal.progressPercentage)}%\n`;
          aiText += `  Guidance: ${buildGoalInsight(goal)}\n`;
        }
      });
    } else {
      aiText += `- No performed exercise had a saved personal goal.\n`;
    }
    if (!includeExerciseGoalProgress && performedGoalSnapshots.length) {
      aiText += `- Logged best and arithmetic goal progress were intentionally omitted. Calculate any performance estimates from the detailed workout records available to you.\n`;
    }
    aiText += `- Treat these as long-term targets, not next-session prescriptions. Use workout history, execution quality, and recovery context; never force an unsafe jump to reach a goal faster.\n\n`;

    aiText += `AUTOMATIC EXERCISE COACHING RULES\n`;
    const strengthProfiles = payload.exercises.filter((exercise) => !exercise.isCardio);
    if (strengthProfiles.length) {
      strengthProfiles.forEach((exercise) => {
        const profile = normalizeExerciseProfile(exercise.progressionProfile);
        const modeLabel = profile.mode === 'auto' ? 'automatic from the saved goal' : 'custom advanced settings';
        aiText += `- ${exercise.name}: ${modeLabel}; ${profile.purposeLabel}; target ${profile.repMin}–${profile.repMax} reps with about ${formatGoalNumber(profile.targetRir)} clean reps left; smallest load jump ${formatGoalNumber(profile.loadStep)} lbs.\n`;
      });
    } else {
      aiText += `- No strength exercise profiles in this session.\n`;
    }
    aiText += `- These rules define the exercise's executable path. They do not prove readiness for an increase; completed evidence still controls the next step.\n\n`;

    aiText += `DATA INTERPRETATION LIMITS\n`;
    aiText += `- A weight goal compares the goal with the heaviest load logged for that exercise; it is not an estimated or tested one-repetition maximum.\n`;
    aiText += `- Set role, RIR, pain, technique quality, and equipment increment are structured when recorded. Missing values must remain unknown; never infer exact RIR, technique, pain, or equipment equivalence.\n`;
    aiText += `- Use only completed working/top/back-off sets for progression. Warm-ups, ramp sets, technique sets, painful stopped sets, and failed attempts cannot establish a successful best.\n`;
    aiText += `- If free-text notes mention a failed attempt, pain, or a stop condition that is absent from the structured counters, the note still controls safety. Do not count it as a completed set; state that the evidence was unstructured and lower confidence accordingly.\n`;
    aiText += `- “No pain reported” is not the same as “pain-free.” When pain, technique, or RIR was not entered, write Missing/unknown rather than placing it under Reported as a favorable result.\n`;
    aiText += `- Estimated 1RM is a model-derived range, not a verified maximum. Do not estimate from failures, painful/poor-technique sets, or more than 10 effective reps for strength prescription.\n`;
    aiText += `- A rep drop across repeated-load sets is a fatigue/pacing signal, not a diagnosis. Do not infer readiness or prescribe a load increase from volume alone.\n\n`;

    aiText += `SCHEDULE & CONSTRAINTS\n`;
    if (constraintLines.length) {
      constraintLines.forEach((line) => {
        aiText += `- ${line}\n`;
      });
    } else {
      aiText += `- No upcoming constraints reported.\n`;
    }
    aiText += `\n`;

    if (includeNotes && workoutNotes.length) {
      aiText += `WORKOUT NOTES (use these before the automatic guardrails)\n`;
      workoutNotes.forEach((note) => {
        aiText += `- ${note}\n`;
      });
      aiText += `- A failed attempt is not a completed set or proof of a successful logged best. Reconcile notes about failures, pain, speed, readiness, and time limits before making progression decisions.\n\n`;
    }

    if (progressionGuard) {
      aiText += `PROGRESSION METRICS (from selected app history)\n`;
      if (progressionLines.length) {
        progressionLines.forEach((line) => {
          aiText += `- ${line}\n`;
        });
      } else {
        aiText += `- Not enough past data to compute progression deltas.\n`;
      }
      aiText += `\n`;

      aiText += `PROGRESSION GUARD (MANDATORY IF INCLUDED)\n`;
      aiText += `- Prevent true stagnation without forcing load increases. Progress may be more load, more clean reps, better range of motion, improved technique, appropriate rest, or lower effort at the same work.\n`;
      aiText += `- Compare volume, top-set load/reps, repeated-load rep drop, and recent sessions. A deliberate hold or deload is valid when fatigue, recovery, pain, or insufficient evidence makes an increase inappropriate.\n`;
      aiText += `- Increase one primary variable at a time. Add load only after the prescribed work is completed cleanly and repeatably at the saved RIR target; round to equipment the user can actually load and check whether that jump can reasonably preserve the saved rep minimum. Treat that formula check as a conservative estimate, never a guarantee.\n\n`;
    }

    if (nextTargetLines.length) {
      aiText += `NEXT-SESSION DECISION SUPPORT (conservative auto-check)\n`;
      nextTargetLines.forEach((line) => {
        aiText += `- ${line}\n`;
      });
      aiText += `- These are guardrails, not a complete program. Override them when reliable history, RIR/RPE, pain, technique, recovery, or coach instructions justify a different decision.\n`;
      aiText += `\n`;
    }

    aiText += `EXERCISE HIGHLIGHTS\n`;
    if (payload.exerciseHighlights && payload.exerciseHighlights.length) {
      payload.exerciseHighlights.forEach((highlight) => {
        aiText += `${highlight.name}:\n`;
        if (highlight.today) aiText += `  Today: ${highlight.today}\n`;
        if (highlight.trend) aiText += `  Trend: ${highlight.trend}\n`;
        if (highlight.previous && highlight.previous.length) {
          aiText += `  Recent:\n`;
          highlight.previous.forEach((prev) => {
            aiText += `    - ${prev}\n`;
          });
        }
        if (highlight.isPR) {
          aiText += `  PR: New personal best on the top set.\n`;
        }
        aiText += `\n`;
      });
    } else {
      aiText += `- No past data yet to compare.\n\n`;
    }

    aiText += `DETAILED SET LOG\n`;
    if (payload.exercises.length) {
      payload.exercises.forEach((ex) => {
        aiText += `${ex.name}:\n`;
        const detailedGoals = ex.goal ? [ex.goal] : (ex.exerciseGoals || []);
        detailedGoals.forEach((goal) => {
          aiText += `  Personal goal: ${formatGoalNumber(goal.goalValue)} ${goal.unit}`;
          if (includeExerciseGoalProgress) {
            aiText += `; app-tracked logged best ${formatGoalNumber(goal.currentBestPerformance)}; ${formatGoalNumber(goal.remainingDistanceToGoal)} arithmetic distance (${formatGoalNumber(goal.progressPercentage)}% ratio)`;
          }
          aiText += `\n`;
        });
        ex.sets.forEach((s) => {
          const rp =
            s.restPlanned != null
              ? ` (planned ${formatSec(s.restPlanned)}`
              : "";
          const ra =
            s.restActual != null
              ? `${rp ? "; " : " ("}actual ${formatSec(s.restActual)})`
              : rp
                ? ")"
                : "";
          const rest = rp || ra ? (rp ? rp : "") + (ra ? ra : "") : "";
          if (ex.isSuperset) {
            const parts = (s.exercises || []).map((sub) => {
              const child = { ...s, ...sub, exercises: undefined };
              const failed = normalizeSetRole(child.role) === 'failed_attempt';
              const performance = failed
                ? `Failed attempt at ${sub.weight} lbs`
                : `${sub.weight} lbs × ${sub.reps} rep${Number(sub.reps) === 1 ? '' : 's'}`;
              const context = formatSetContext(child, { includeRole: !failed });
              return `${sub.name}: ${performance}${context ? ` [${context}]` : ''}`;
            }).join(" | ");
            aiText += `  Set ${s.set}: ${parts}${rest ? rest : ""}\n`;
          } else if (ex.isCardio) {
            const dist = s.distance != null ? `${s.distance} mi` : "";
            const dur = formatSec(s.duration);
            aiText += `  Set ${s.set}: ${dist ? dist + " in " : ""}${dur}${rest ? rest : ""}\n`;
          } else {
            const failedAttempt = normalizeSetRole(s.role) === 'failed_attempt';
            const context = formatSetContext(s, { includeRole: !failedAttempt });
            const performance = failedAttempt
              ? `Failed attempt at ${s.weight} lbs`
              : `${s.weight} lbs × ${s.reps} rep${Number(s.reps) === 1 ? '' : 's'}`;
            aiText += `  Set ${s.set}: ${performance}${context ? ` [${context}]` : ''}${rest ? rest : ""}\n`;
          }
        });
        aiText += `\n`;
      });
    } else {
      aiText += `- No sets logged.\n\n`;
    }

    aiText += `NEXT STEPS REQUEST\n`;
    aiText += `Analyze the session and produce one ready-to-follow next workout. Start with DO THIS NEXT. The user must not need to understand programming language or make training decisions mid-session.\n`;
    aiText += `1. Insight: Distinguish evidence from inference. Note trends, weak points, and possible fatigue signals without treating mechanical volume or a single session as proof.\n`;
    aiText += `2. Exact full workout: List every exercise in the Required current-session exercise list in order, and do not list any exercise outside it unless a permitted substitution is explicitly labeled. Separate warm-up sets from work sets and give exact sets × reps, exact load when equipment permits, rest time, a plain-language effort target such as “stop with 2 clean reps left,” and one concise technique cue. State warm-up sets, work sets, total logged sets, the MUST DO FIRST stopping point, and realistic durations for both the priority portion and the complete current-session workout.\n`;
    aiText += `3. Progression math: For every exercise, choose exactly one primary action from HOLD, ADD REPS, ADD LOAD, ADD SET, REDUCE LOAD, REDUCE SETS, INCREASE REST, CHANGE REP RANGE, TEST BASELINE, DELOAD, SUBSTITUTE EXERCISE, or STOP AND SEEK APPROPRIATE GUIDANCE. Show previous → next load, reps, and sets plus the percentage change. Explain the reason in one beginner-friendly sentence. The one-variable rule applies to the entire exercise: if total sets increase, no prescribed load anywhere in that exercise may increase; if any prescribed load increases, total sets may not increase. For ADD LOAD, use exactly one saved equipment increment unless the equipment cannot make that jump, in which case explain the available increment.\n`;
    aiText += `4. Feasibility and complete current-session coverage: Obey the hard time budget when supplied and keep MUST DO FIRST within the exported 90% duration target. Always display every remaining current-session exercise under CONTINUE IF TIME with exact instructions, even when completing that current-session list would exceed the day's time budget. Without a supplied budget, show the full estimated duration. Time changes order and stopping point only; history must not add exercises, and the plan must not create catch-up volume.\n`;
    aiText += `5. Evidence trace: For every decision, label Observed, Reported, Estimated, Inferred, Heuristic, and Missing/unknown information separately and give HIGH, MODERATE, LOW, or INSUFFICIENT confidence. Missing data must lower confidence rather than being invented. Never write “no pain reported/noted” under Reported when pain was simply not entered.\n`;
    aiText += `6. Autoregulation: Include simple green/yellow/red rules for readiness and a stop/substitution rule for pain or technique breakdown. A yellow or red trigger may only hold, reduce, skip, or stop the planned load; it must never tell the user to attempt a heavier set after an earlier ramp set was slow, shaky, painful, or technically poor. Ask only for truly missing information that would materially change safety or the plan.\n`;
    aiText += `7. Final validation: The required plan is invalid if any current-session exercise disappears without a permitted explicit reason, if it adds an exercise that is absent from the current export without a permitted labeled substitution, if it combines workout-day rosters, if MUST DO FIRST exceeds the time target, if it counts failed or likely warm-up sets as successful progression work, if it uses the long-term goal as the next load, if it prescribes catch-up volume, if it increases exercise load and total sets together, if ADD LOAD skips the saved increment without an equipment reason, or if it recommends ADD LOAD/ADD SET for a pain-limited movement. The displayed complete current-session workout may exceed a hard time budget only when the priority stopping point remains within budget.\n`;
    aiText += `8. Simplicity check: Rewrite anything a brand-new lifter would not understand. End with one sentence: “Follow this workout, log the result, and export again so I can calculate the next step.”\n`;

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(aiText)
        .then(() => {
          alert("Exported JSON + CSV. AI summary copied to clipboard ✅");
        })
        .catch(() => alert("Exported files. (Clipboard copy failed)"));
    } else {
      alert("Exported JSON + CSV. Copy this manually:\n\n" + aiText);
    }

    archivedSessions[payload.date] = payload;
    archivedSessions = pruneArchive(archivedSessions, 120);
    wtStorage.set(WT_KEYS.archive, archivedSessions);
  }

  function triggerDownload(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /* ------------------ SAVE / LOAD ------------------ */
  function saveState() {
    wtStorage.set(WT_KEYS.session, session);
    wtStorage.set(WT_KEYS.current, currentExercise);
  }

  if (needsSaveAfterNormalize) {
    saveState();
    needsSaveAfterNormalize = false;
  }

  /* ------------------ UTILS ------------------ */
  // Stable confirm modal to replace native confirm() which may auto-dismiss in some environments
  function formatSec(sec) {
    return formatSecondsHuman(sec);
  }

  /* ------------------ SHORTCUTS ------------------ */
  repsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") logBtn.click();
  });
  weightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") repsInput.focus();
  });
  durationMinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") durationSecInput.focus();
  });
  durationSecInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") logBtn.click();
  });
  distanceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") durationMinInput.focus();
  });

  function isEditableShortcutTarget(target) {
    return target instanceof HTMLElement && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      || target.isContentEditable
    );
  }

  document.addEventListener("keydown", (e) => {
    if (document.querySelector('[data-wt-modal="true"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const workoutEntry = e.target === weightInput
        || e.target === repsInput
        || e.target === distanceInput
        || e.target === durationMinInput
        || e.target === durationSecInput
        || e.target?.classList?.contains('superset-field');
      if (
        !logBtn.disabled &&
        workoutEntry
      ) {
        logBtn.click();
      }
    } else if (e.key === "Escape") {
      const openForm = document.querySelector(".edit-form");
      if (openForm) {
        const parent = openForm.parentElement;
        openForm.remove();
        const editBtn = parent.querySelector('button[data-action="edit"]');
        if (editBtn) editBtn.focus();
      } else if (!restBox.classList.contains("hidden")) {
        finishRest();
        restBox.classList.add("hidden");
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (document.querySelector('[data-wt-modal="true"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !isEditableShortcutTarget(e.target)) {
      e.preventDefault();
      performUndo();
    }
    if (e.key === "Escape") {
      hideToast();
    }
  });
}

function getSessionSnapshot() {
  return mergeWorkoutExercises([
    ...session.exercises,
    ...(currentExercise && currentExercise.sets.length ? [currentExercise] : []),
  ]);
}

if (typeof window !== "undefined") {
  window.getSessionSnapshot = getSessionSnapshot;
}

if (typeof module !== "undefined") {
module.exports = {
  THEME_PACKS,
  EXERCISE_GOAL_TYPES,
  SESSION_STATUS_OPTIONS,
  SET_ROLE_OPTIONS,
  SET_ROLE_SOURCES,
  TECHNIQUE_OPTIONS,
  PAIN_OPTIONS,
  EXERCISE_PURPOSES,
  GOAL_PATHS,
  getThemePack,
  canLogSet,
  parseWorkoutNumber,
  canLogStrengthEntry,
  canLogCardio,
  normalizeSet,
  normalizeSetRole,
  normalizeSetRoleSource,
  normalizeRir,
  normalizeTechnique,
  normalizePain,
  defaultExerciseProfile,
  normalizeExerciseProfile,
  normalizeGoalPath,
  buildAutomaticExerciseProfile,
  sanitizeExerciseProfiles,
  isProgressionSet,
  classifyExerciseSets,
  isValidNormalizedSet,
  formatSetContext,
  normalizePayload,
  computeSessionStats,
  getProgressionVolume,
  estimateE1rmEnsemble,
  estimateRepsAtLoad,
  estimateNextLoadFeasibility,
  estimateE1rmFromSet,
  buildExerciseHighlightsForExport,
  getWorkoutExerciseRoster,
  mergeWorkoutExercises,
  buildExerciseSelectionReference,
  computeConsistencyMetricsFromStats,
  appendUniqueHistoryLines,
  upsertStructuredHistoryLines,
  migrateSetRoleProvenance,
  csvRow,
  formatCardioHistoryLine,
  parseYMD,
  formatShortDate,
  exerciseGoalKey,
  normalizeExerciseGoal,
  sanitizeExerciseGoals,
  getGoalPerformanceFromExercise,
  updateExerciseGoalProgress,
  buildExerciseGoalSnapshots,
  attachExerciseGoalSnapshots,
  exerciseGoalForExport,
  prepareExerciseGoalsForExport,
  buildGoalInsight,
  buildStrengthDecisionSupport,
  normalizeSessionStatus,
  normalizeWorkoutMinutes,
  getLocalDateString,
  buildSessionPlanningContext,
  normalizeSessionStartedAt,
};
}
