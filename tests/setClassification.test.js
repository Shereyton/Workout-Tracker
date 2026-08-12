const {
  classifyExerciseSets,
  computeSessionStats,
  isProgressionSet,
  getGoalPerformanceFromExercise,
  getProgressionVolume,
  migrateSetRoleProvenance,
  normalizePayload,
  normalizeSet,
  mergeWorkoutExercises,
} = require('../script');

function autoSet(weight, reps, extra = {}) {
  return {
    weight,
    reps,
    role: 'auto',
    roleSource: 'auto',
    ...extra,
  };
}

describe('automatic set classification', () => {
  it('separates a realistic ramp, work block, and back-off block', () => {
    const sets = [
      [45, 10], [135, 8], [185, 5], [225, 3],
      [255, 5], [255, 5], [255, 5], [245, 7], [245, 7],
    ].map(([weight, reps]) => autoSet(weight, reps));
    const exercise = {
      name: 'Squat',
      progressionProfile: { purpose: 'primary_strength', repMin: 1, repMax: 5 },
      sets,
    };
    const classified = classifyExerciseSets(exercise);
    const stats = computeSessionStats({ exercises: [exercise] });

    expect(classified.sets.map((set) => set.role)).toEqual([
      'warmup', 'ramp', 'ramp', 'ramp',
      'top_set', 'working', 'working', 'back_off', 'back_off',
    ]);
    expect(stats.totalVolume).toBe(10385);
    expect(stats.progressionSetCount).toBe(5);
    expect(stats.exercises[0].workingVolume).toBe(7255);
    expect(stats.exercises[0].topSet).toMatchObject({ weight: 255, reps: 5 });
    expect(Object.values(stats.roleCounts).every(Number.isFinite)).toBe(true);
  });

  it('keeps repeated same-load sets as work and does not invent a warm-up', () => {
    const classified = classifyExerciseSets({
      name: 'Machine Press',
      sets: [autoSet(100, 10), autoSet(100, 10), autoSet(100, 10)],
    });
    expect(classified.sets.map((set) => set.role)).toEqual([
      'working', 'working', 'working',
    ]);
  });

  it('keeps a narrow productive pyramid while identifying its top set', () => {
    const classified = classifyExerciseSets({
      name: 'Press',
      sets: [autoSet(100, 12), autoSet(105, 10), autoSet(110, 8)],
    });
    expect(classified.sets.map((set) => set.role)).toEqual([
      'working', 'working', 'top_set',
    ]);
  });

  it('gives a single automatic baseline low confidence', () => {
    const classified = classifyExerciseSets({
      name: 'Deadlift',
      sets: [autoSet(225, 5)],
    });
    expect(classified.sets[0]).toMatchObject({
      role: 'working',
      roleSource: 'auto',
      roleConfidence: 'low',
    });
  });

  it('never overwrites a manual role and is idempotent', () => {
    const exercise = {
      name: 'Bench Press',
      sets: [
        autoSet(45, 10),
        { weight: 135, reps: 8, role: 'working', roleSource: 'manual' },
        autoSet(225, 5),
      ],
    };
    const once = classifyExerciseSets(exercise);
    const twice = classifyExerciseSets(once);
    expect(once.sets[1]).toMatchObject({ role: 'working', roleSource: 'manual' });
    expect(twice).toEqual(once);
    expect(exercise.sets[0].role).toBe('auto');
  });

  it('classifies each exercise inside a superset independently', () => {
    const exercise = {
      name: 'Bench + Row',
      isSuperset: true,
      exercises: ['Bench', 'Row'],
      sets: [
        { role: 'auto', roleSource: 'auto', exercises: [
          { name: 'Bench', weight: 45, reps: 10 },
          { name: 'Row', weight: 100, reps: 10 },
        ] },
        { role: 'auto', roleSource: 'auto', exercises: [
          { name: 'Bench', weight: 135, reps: 5 },
          { name: 'Row', weight: 100, reps: 10 },
        ] },
        { role: 'auto', roleSource: 'auto', exercises: [
          { name: 'Bench', weight: 225, reps: 5 },
          { name: 'Row', weight: 100, reps: 10 },
        ] },
      ],
    };
    const classified = classifyExerciseSets(exercise);
    expect(classified.sets.map((set) => set.exercises[0].role)).toEqual([
      'warmup', 'ramp', 'top_set',
    ]);
    expect(classified.sets.map((set) => set.exercises[1].role)).toEqual([
      'working', 'working', 'working',
    ]);
    const stats = computeSessionStats({ exercises: [exercise] });
    expect(stats.exercises.find((entry) => entry.name === 'Bench').progressionSetCount).toBe(1);
    expect(stats.exercises.find((entry) => entry.name === 'Row').progressionSetCount).toBe(3);
  });
});

describe('progression evidence safety', () => {
  it('excludes explicit unknown sets from progression, top sets, and goal bests', () => {
    const set = { weight: 100, reps: 12, role: 'unknown', roleSource: 'manual' };
    const stats = computeSessionStats({ exercises: [{ name: 'Press', sets: [set] }] });
    expect(isProgressionSet(set)).toBe(false);
    expect(stats.progressionSetCount).toBe(0);
    expect(stats.exercises[0].topSet).toBeNull();
    expect(stats.exercises[0].workingVolume).toBe(0);
    expect(getGoalPerformanceFromExercise(
      { name: 'Press', sets: [set] },
      'reps',
      'Press',
    )).toBe(0);
  });

  it('does not resurrect warm-up-only volume as progression volume', () => {
    const stats = computeSessionStats({
      exercises: [{ name: 'Squat', sets: [
        { weight: 45, reps: 10, role: 'warmup', roleSource: 'manual' },
      ] }],
    }).exercises[0];
    expect(stats.totalVolume).toBe(450);
    expect(stats.workingVolume).toBe(0);
    expect(getProgressionVolume(stats)).toBe(0);
  });

  it('forces completed false to a failed attempt even with positive reps', () => {
    expect(normalizeSet({
      weight: 225,
      reps: 3,
      role: 'working',
      completed: false,
    })).toMatchObject({
      role: 'failed_attempt',
      roleSource: 'system',
      completed: false,
      outcome: 'failed',
      reps: 0,
    });
  });

  it('drops null, NaN, negative, and overflow imported efforts', () => {
    const normalized = normalizePayload({
      exercises: [null, {
        name: 'Bench',
        sets: [
          null,
          { weight: 100, reps: 'NaN' },
          { weight: -1, reps: 5 },
          { weight: 1e308, reps: 5 },
          { weight: 100, reps: 5 },
        ],
      }],
    });
    expect(normalized.totalExercises).toBe(1);
    expect(normalized.totalSets).toBe(1);
    expect(computeSessionStats(normalized).totalVolume).toBe(500);
  });
});

describe('schema and exercise merging', () => {
  it('marks old default Working roles as legacy automatic evidence', () => {
    const legacy = migrateSetRoleProvenance({
      exercises: [{ name: 'Squat', sets: [{ weight: 45, reps: 10, role: 'working' }] }],
    });
    expect(legacy.changed).toBe(true);
    expect(legacy.value.exercises[0].sets[0]).toMatchObject({
      role: 'working',
      roleSource: 'legacy_default',
      recordedRole: 'working',
    });
  });

  it('automatically migrates declared schema-8 payloads', () => {
    const normalized = normalizePayload({
      schema: 8,
      exercises: [{
        name: 'Squat',
        sets: [
          { weight: 45, reps: 10, role: 'working' },
          { weight: 225, reps: 5, role: 'working' },
        ],
      }],
    });
    expect(normalized.exercises[0].sets.every(
      (set) => set.roleSource === 'legacy_default',
    )).toBe(true);
  });

  it('merges repeated visits to the same exercise and renumbers sets', () => {
    const merged = mergeWorkoutExercises([
      { name: 'Bench Press', sets: [autoSet(185, 5), autoSet(185, 5)] },
      { name: ' bench   press ', sets: [autoSet(190, 5)] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sets.map((set) => set.set)).toEqual([1, 2, 3]);
  });
});
