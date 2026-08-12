const {
  normalizeSet,
  normalizeExerciseProfile,
  computeSessionStats,
  estimateE1rmFromSet,
  buildStrengthDecisionSupport,
  getGoalPerformanceFromExercise,
} = require('../script');

function qualitySet(weight, reps, overrides = {}) {
  return {
    weight,
    reps,
    role: 'working',
    rir: 2,
    technique: 'good',
    pain: 'none',
    ...overrides,
  };
}

describe('set classification and safety', () => {
  it('keeps missing pain information unknown instead of assuming no pain', () => {
    expect(normalizeSet({ weight: 100, reps: 5 }).pain).toBe('unknown');
  });

  it('preserves a failed attempt as zero completed reps', () => {
    expect(normalizeSet({
      weight: 295,
      reps: 0,
      role: 'failed_attempt',
      rir: 0,
    })).toMatchObject({
      weight: 295,
      reps: 0,
      role: 'failed_attempt',
      completed: false,
      outcome: 'failed',
      rir: null,
    });
  });

  it('keeps warm-ups descriptive and excludes failures from top successful work', () => {
    const stats = computeSessionStats({
      exercises: [{
        name: 'Bench Press',
        progressionProfile: { purpose: 'primary_strength', repMin: 1, repMax: 5, loadStep: 2.5 },
        sets: [
          qualitySet(135, 5, { role: 'warmup' }),
          qualitySet(285, 1, { role: 'top_set' }),
          { weight: 295, reps: 0, role: 'failed_attempt', completed: false },
        ],
      }],
    });
    const bench = stats.exercises[0];

    expect(stats.totalSets).toBe(3);
    expect(stats.totalVolume).toBe(960);
    expect(stats.warmupSetCount).toBe(1);
    expect(stats.failedAttemptCount).toBe(1);
    expect(bench.progressionSetCount).toBe(1);
    expect(bench.workingVolume).toBe(285);
    expect(bench.topSet).toMatchObject({ weight: 285, reps: 1 });
  });

  it('never treats a failed attempt as goal progress', () => {
    const performance = getGoalPerformanceFromExercise({
      name: 'Bench Press',
      sets: [
        qualitySet(285, 1, { role: 'top_set' }),
        { weight: 295, reps: 0, role: 'failed_attempt', completed: false },
      ],
    }, 'weight', 'Bench Press');

    expect(performance).toBe(285);
  });
});

describe('exercise profile and model-derived strength estimate', () => {
  it('normalizes a saved exercise-specific progression profile', () => {
    expect(normalizeExerciseProfile({
      purpose: 'primary_strength',
      repMin: 1,
      repMax: 5,
      targetRir: 2.5,
      loadStep: 2.5,
    })).toMatchObject({
      purpose: 'primary_strength',
      repMin: 1,
      repMax: 5,
      targetRir: 2.5,
      loadStep: 2.5,
    });
  });

  it('returns a labeled estimate range only from eligible work', () => {
    const estimate = estimateE1rmFromSet(qualitySet(225, 5));
    expect(estimate.estimate).toBeGreaterThan(225);
    expect(estimate.uncertainty).toBeGreaterThan(0);
    expect(estimate.lowerBound).toBe(225);
    expect(estimate.model).toMatch(/Epley, Brzycki, and Lander/);
    expect(estimate.confidence).toBe('MODERATE');
    expect(estimateE1rmFromSet({ weight: 295, reps: 0, role: 'failed_attempt' })).toBeNull();
    expect(estimateE1rmFromSet(qualitySet(100, 12))).toBeNull();
  });
});

describe('one-variable progression decisions', () => {
  const profile = {
    purpose: 'hypertrophy_compound',
    repMin: 8,
    repMax: 12,
    loadStep: 5,
  };

  function exerciseStats(sets, sessionContext = { status: 'complete' }) {
    return computeSessionStats({
      sessionContext,
      exercises: [{ name: 'Machine Press', progressionProfile: profile, sets }],
    }).exercises[0];
  }

  it('adds only the saved load step after two qualified top-of-range sessions', () => {
    const previous = exerciseStats([
      qualitySet(100, 12),
      qualitySet(100, 12),
    ]);
    const current = exerciseStats([
      qualitySet(100, 12),
      qualitySet(100, 12),
    ]);
    const decision = buildStrengthDecisionSupport(current, previous);

    expect(decision.decision).toBe('ADD LOAD');
    expect(decision.nextLoad).toBe(105);
    expect(decision.predictedMinimumRepsAtNextLoad).toBeGreaterThanOrEqual(8);
    expect(decision.nextLoadPreservesRepMinimum).toBe(true);
    expect(decision.text).toMatch(/do not add sets at the same time/);
  });

  it('holds when the equipment jump is predicted to break the saved rep minimum', () => {
    const largeJumpProfile = { ...profile, loadStep: 20 };
    const makeStats = (sets) => computeSessionStats({
      sessionContext: { status: 'complete' },
      exercises: [{
        name: 'Machine Press',
        progressionProfile: largeJumpProfile,
        sets,
      }],
    }).exercises[0];
    const previous = makeStats([qualitySet(100, 12), qualitySet(100, 12)]);
    const current = makeStats([qualitySet(100, 12), qualitySet(100, 12)]);
    const decision = buildStrengthDecisionSupport(current, previous);

    expect(decision.decision).toBe('HOLD');
    expect(decision.nextLoad).toBe(120);
    expect(decision.nextLoadPreservesRepMinimum).toBe(false);
    expect(decision.text).toMatch(/below the 8-rep minimum/);
  });

  it('requires the saved RIR target before adding load', () => {
    const higherRirProfile = { ...profile, targetRir: 3 };
    const makeStats = (sets) => computeSessionStats({
      sessionContext: { status: 'complete' },
      exercises: [{
        name: 'Machine Press',
        progressionProfile: higherRirProfile,
        sets,
      }],
    }).exercises[0];
    const previous = makeStats([qualitySet(100, 12), qualitySet(100, 12)]);
    const current = makeStats([qualitySet(100, 12), qualitySet(100, 12)]);

    expect(buildStrengthDecisionSupport(current, previous).decision).toBe('HOLD');
  });

  it('uses three successful automatic exposures when optional effort fields are skipped', () => {
    const automaticProfile = { ...profile, mode: 'auto' };
    const makeStats = () => computeSessionStats({
      sessionContext: { status: 'complete' },
      exercises: [{
        name: 'Machine Press',
        progressionProfile: automaticProfile,
        sets: [
          { weight: 100, reps: 12, role: 'working' },
          { weight: 100, reps: 12, role: 'working' },
        ],
      }],
    }).exercises[0];
    const decision = buildStrengthDecisionSupport(
      makeStats(),
      makeStats(),
      null,
      [makeStats()],
    );

    expect(decision.decision).toBe('ADD LOAD');
    expect(decision.confidence).toBe('MODERATE');
    expect(decision.text).toMatch(/without requiring technical effort ratings/);
  });

  it('does not use the beginner fallback for a custom advanced profile', () => {
    const customProfile = { ...profile, mode: 'custom' };
    const makeStats = () => computeSessionStats({
      sessionContext: { status: 'complete' },
      exercises: [{
        name: 'Machine Press',
        progressionProfile: customProfile,
        sets: [{ weight: 100, reps: 12, role: 'working' }],
      }],
    }).exercises[0];

    expect(buildStrengthDecisionSupport(
      makeStats(), makeStats(), null, [makeStats()],
    ).decision).toBe('HOLD');
  });

  it('treats a 20 percent rep loss across three same-load sets as a screen, not a diagnosis', () => {
    const current = exerciseStats([
      qualitySet(100, 10),
      qualitySet(100, 9),
      qualitySet(100, 8),
    ]);
    const decision = buildStrengthDecisionSupport(current);

    expect(decision.decision).toBe('HOLD');
    expect(decision.text).toMatch(/conservative 20% fatigue screen/);
    expect(decision.evidenceTrace.heuristic).toContain(
      '20% repeated-set rep-loss screen; requires confirmation and is not diagnostic',
    );
  });

  it('holds after a failed attempt and uses the successful top set', () => {
    const previous = exerciseStats([qualitySet(100, 10)]);
    const current = exerciseStats([
      qualitySet(100, 10, { role: 'top_set' }),
      { weight: 105, reps: 0, role: 'failed_attempt', completed: false },
    ]);
    const decision = buildStrengthDecisionSupport(current, previous);

    expect(decision.decision).toBe('HOLD');
    expect(decision.topWeight).toBe(100);
    expect(decision.text).toMatch(/not a completed set, PR, or reason to add weight/);
  });

  it('never adds load when discomfort was recorded', () => {
    const previous = exerciseStats([
      qualitySet(100, 12),
      qualitySet(100, 12),
    ]);
    const current = exerciseStats([
      qualitySet(100, 12, { pain: 'discomfort' }),
      qualitySet(100, 12),
    ]);

    expect(buildStrengthDecisionSupport(current, previous).decision).toBe('HOLD');
  });

  it('uses a single stop action when pain ends a set', () => {
    const previous = exerciseStats([qualitySet(100, 10)]);
    const current = exerciseStats([
      qualitySet(100, 8, { pain: 'stopped' }),
      qualitySet(95, 10),
    ]);

    expect(buildStrengthDecisionSupport(current, previous).decision).toBe(
      'STOP AND SEEK APPROPRIATE GUIDANCE',
    );
  });

  it('lets poor technique override a recovery-limited session status', () => {
    const previous = exerciseStats([qualitySet(100, 10)]);
    const current = exerciseStats([
      qualitySet(100, 8, { technique: 'poor' }),
      qualitySet(95, 10),
    ], { status: 'recovery_limited' });

    expect(buildStrengthDecisionSupport(current, previous).decision).toBe('REDUCE LOAD');
  });

  it('does not add reps when a known RIR is below the saved target', () => {
    const previous = exerciseStats([qualitySet(100, 10)]);
    const current = exerciseStats([
      qualitySet(100, 10, { rir: 0 }),
      qualitySet(100, 9, { rir: 1 }),
    ]);
    const decision = buildStrengthDecisionSupport(current, previous);

    expect(decision.decision).toBe('HOLD');
    expect(decision.text).toMatch(/below the saved 2 RIR target/);
  });

  it('does not progress after a recorded minor technique breakdown', () => {
    const previous = exerciseStats([qualitySet(100, 10)]);
    const current = exerciseStats([
      qualitySet(100, 10, { technique: 'minor' }),
      qualitySet(100, 10),
    ]);
    expect(buildStrengthDecisionSupport(current, previous).decision).toBe('HOLD');
  });

  it('attributes short rest to the following repeated set', () => {
    const shortBeforeDrop = exerciseStats([
      qualitySet(100, 10, { restActual: 30, restPlanned: 120 }),
      qualitySet(100, 6, { restActual: 120, restPlanned: 120 }),
    ]);
    const shortAfterDrop = exerciseStats([
      qualitySet(100, 10, { restActual: 120, restPlanned: 120 }),
      qualitySet(100, 6, { restActual: 30, restPlanned: 120 }),
    ]);

    expect(buildStrengthDecisionSupport(shortBeforeDrop).decision).toBe('INCREASE REST');
    expect(buildStrengthDecisionSupport(shortAfterDrop).decision).toBe('HOLD');
  });
});
