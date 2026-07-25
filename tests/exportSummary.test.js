const {
  normalizePayload,
  computeSessionStats,
  buildExerciseHighlightsForExport,
  computeConsistencyMetricsFromStats,
  buildStrengthDecisionSupport,
  formatCardioHistoryLine,
  parseYMD,
  formatShortDate,
} = require('../script');

describe('export summary helpers', () => {
  it('builds highlights with trend and PR detection', () => {
    const current = normalizePayload({
      date: '2025-01-10',
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 200, reps: 5 },
            { weight: 205, reps: 3 },
          ],
        },
      ],
    });
    const previous = [
      normalizePayload({
        date: '2025-01-07',
        exercises: [{ name: 'Bench Press', sets: [{ weight: 195, reps: 5 }] }],
      }),
      normalizePayload({
        date: '2025-01-03',
        exercises: [{ name: 'Bench Press', sets: [{ weight: 185, reps: 5 }] }],
      }),
    ];
    const currentStats = computeSessionStats(current);
    const previousStats = previous.map((session) => computeSessionStats(session));
    const highlights = buildExerciseHighlightsForExport(currentStats, previousStats);
    const benchHighlight = highlights.find((h) => h.name === 'Bench Press');
    expect(benchHighlight).toBeDefined();
    expect(benchHighlight.isPR).toBe(true);
    expect(benchHighlight.trend).toMatch(/volume/);
    expect(benchHighlight.previous.length).toBeGreaterThan(0);
  });

  it('computes consistency metrics over recent window', () => {
    const stats = [
      computeSessionStats(
        normalizePayload({
          date: '2025-01-10',
          exercises: [{ name: 'Bench', sets: [{ weight: 200, reps: 5 }] }],
        }),
      ),
      computeSessionStats(
        normalizePayload({
          date: '2025-01-08',
          exercises: [{ name: 'Squat', sets: [{ weight: 250, reps: 5 }] }],
        }),
      ),
      computeSessionStats(
        normalizePayload({
          date: '2024-12-15',
          exercises: [{ name: 'Bench', sets: [{ weight: 180, reps: 5 }] }],
        }),
      ),
    ];
    const consistency = computeConsistencyMetricsFromStats(stats, '2025-01-10');
    expect(consistency.past7.daysTrained).toBe(2);
    expect(consistency.past7.totalSets).toBe(2);
    expect(consistency.past30.daysTrained).toBe(3);
    expect(consistency.streakDays).toBe(1);
  });

  it('recalculates the supplied 41-set workout and blocks unsupported load jumps', () => {
    const workout = normalizePayload({
      date: '2026-07-24',
      exercises: [
        {
          name: 'Squat',
          sets: [
            [45, 10], [135, 8], [185, 5], [225, 3], [275, 1],
            [295, 1], [315, 1], [325, 1], [325, 1], [295, 2],
            [295, 2], [295, 2], [275, 3], [275, 3], [275, 3],
            [255, 5], [255, 5],
          ].map(([weight, reps]) => ({ weight, reps })),
        },
        {
          name: 'Front Squat',
          sets: [5, 5, 5].map((reps) => ({ weight: 145, reps })),
        },
        {
          name: 'Romanian Deadlift',
          sets: [9, 5, 4].map((reps) => ({ weight: 195, reps })),
        },
        {
          name: 'Straight bar curl',
          sets: [7, 5, 5, 4].map((reps) => ({ weight: 105, reps })),
        },
        {
          name: 'Close Grip Flat Bench',
          sets: [
            { weight: 135, reps: 10 },
            { weight: 185, reps: 6 },
            ...[6, 4, 4, 4].map((reps) => ({ weight: 205, reps })),
          ],
        },
        {
          name: 'Front Barbell Shrugs',
          sets: [8, 6, 6, 5].map((reps) => ({ weight: 225, reps })),
        },
        {
          name: 'Straight bar overhead press',
          sets: [10, 7, 6].map((reps) => ({ weight: 75, reps })),
        },
        {
          name: 'Sit-Ups',
          sets: [{ weight: 20, reps: 20 }],
        },
      ],
    });
    const stats = computeSessionStats(workout);
    const rdl = stats.exercises.find((exercise) => exercise.name === 'Romanian Deadlift');
    const frontSquat = stats.exercises.find((exercise) => exercise.name === 'Front Squat');
    const rdlDecision = buildStrengthDecisionSupport(rdl);
    const frontSquatDecision = buildStrengthDecisionSupport(frontSquat);

    expect(stats.totalSets).toBe(41);
    expect(stats.totalVolume).toBe(33250);
    expect(rdlDecision.decision).toBe('HOLD');
    expect(rdlDecision.repeatedReps).toEqual([9, 5, 4]);
    expect(rdlDecision.repDropPercent).toBe(55.6);
    expect(rdlDecision.text).toMatch(/adding load is not supported/);
    expect(frontSquatDecision.decision).toBe('HOLD');
    expect(frontSquatDecision.text).toMatch(/first comparable session/);
  });

  it('allows review of the smallest standard load step only after comparable improvement', () => {
    const previous = computeSessionStats(normalizePayload({
      date: '2026-07-17',
      exercises: [{
        name: 'Close Grip Flat Bench',
        sets: [{ weight: 205, reps: 5 }, { weight: 205, reps: 5 }],
      }],
    })).exercises[0];
    const current = computeSessionStats(normalizePayload({
      date: '2026-07-24',
      exercises: [{
        name: 'Close Grip Flat Bench',
        sets: [{ weight: 205, reps: 6 }, { weight: 205, reps: 6 }],
      }],
    })).exercises[0];
    const decision = buildStrengthDecisionSupport(current, previous);

    expect(decision.decision).toBe('REVIEW');
    expect(decision.nextLoad).toBe(210);
    expect(decision.text).toMatch(/do not increase volume at the same time/);
  });
});

describe('date and cardio formatting', () => {
  it('formats calendar dates without shifting to the prior local day', () => {
    expect(formatShortDate('2025-01-07')).toBe('Jan 7');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseYMD('2025-02-31')).toBeNull();
  });

  it('creates useful cardio history lines', () => {
    expect(formatCardioHistoryLine('Running', { set: 2, distance: 3.1, duration: 1500 })).toBe(
      'Running: Set 2 - 3.1 mi in 25m 0s',
    );
  });
});
