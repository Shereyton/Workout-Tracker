const {
  normalizePayload,
  computeSessionStats,
  buildExerciseHighlightsForExport,
  computeConsistencyMetricsFromStats,
  buildStrengthDecisionSupport,
  buildExerciseSelectionReference,
  normalizeWorkoutMinutes,
  getLocalDateString,
  buildSessionPlanningContext,
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
    expect(rdlDecision.text).toMatch(/one session does not diagnose fatigue/);
    expect(frontSquatDecision.decision).toBe('TEST BASELINE');
    expect(frontSquatDecision.text).toMatch(/first comparable session/);
  });

  it('keeps load stable while comparable sessions are still inside the saved rep range', () => {
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

    expect(decision.decision).toBe('ADD REPS');
    expect(decision.nextLoad).toBe(210);
    expect(decision.text).toMatch(/target one additional total clean repetition/);
  });

  it('does not overstate a normal two-rep drop but still flags a major collapse', () => {
    const normalDrop = computeSessionStats(normalizePayload({
      exercises: [{
        name: 'Nautilus Lat Pulldown',
        sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 6 }],
      }],
    })).exercises[0];
    const majorDrop = computeSessionStats(normalizePayload({
      exercises: [{
        name: 'Life Fitness Pullover',
        sets: [{ weight: 110, reps: 8 }, { weight: 110, reps: 3 }],
      }],
    })).exercises[0];

    expect(buildStrengthDecisionSupport(normalDrop).text).not.toMatch(/large within-session drop/);
    expect(buildStrengthDecisionSupport(majorDrop).text).toMatch(/final set below the saved/);
  });

  it('matches comparable exercises despite casing and spacing differences', () => {
    const current = computeSessionStats(normalizePayload({
      date: '2026-07-30',
      exercises: [{
        name: 'Lat Pulldown Close Grip (MAG Grip)',
        sets: [{ weight: 210, reps: 4 }],
      }],
    }));
    const previous = computeSessionStats(normalizePayload({
      date: '2026-07-23',
      exercises: [{
        name: '  lat pulldown close grip (mag grip)  ',
        sets: [{ weight: 195, reps: 5 }],
      }],
    }));
    const highlight = buildExerciseHighlightsForExport(current, [previous])[0];

    expect(highlight.trend).toMatch(/progression volume vs avg last 1/);
    expect(highlight.previous[0]).toMatch(/Jul 23/);
  });

  it('normalizes session completion and a realistic next-workout time budget', () => {
    expect(normalizeWorkoutMinutes('92.4')).toBe(92);
    expect(normalizeWorkoutMinutes('8')).toBeNull();
    expect(buildSessionPlanningContext('time_limited', '90')).toEqual({
      status: 'time_limited',
      statusLabel: 'Stopped because time ran out',
      isIncomplete: true,
      nextWorkoutMinutes: 90,
      mustDoTargetMinutes: 81,
      timeBufferMinutes: 9,
    });
  });

  it('uses only the current exported session to select next-workout exercises', () => {
    const current = normalizePayload({
      date: '2026-08-03',
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 290, reps: 1 }] },
        { name: 'Chest-Supported Row', sets: [{ weight: 360, reps: 3 }] },
        { name: 'Shoulder Press', sets: [] },
      ],
    });

    expect(buildExerciseSelectionReference(current)).toEqual({
      source: 'current_session_only',
      currentExercises: [
        'Bench Press',
        'Chest-Supported Row',
      ],
      requiredExercises: [
        'Bench Press',
        'Chest-Supported Row',
      ],
    });
  });

  it('does not let historical exercises expand the current-session roster', () => {
    const current = normalizePayload({
      exercises: [
        { name: 'Incline Bench Press', sets: [{ weight: 225, reps: 3 }] },
        { name: 'Bench Press', sets: [{ weight: 275, reps: 1 }] },
      ],
    });
    const historyThatMustNotControlSelection = normalizePayload({
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 270, reps: 2 }] },
        { name: 'Chest Dip', sets: [{ weight: 70, reps: 5 }] },
        { name: 'Shoulder Press', sets: [{ weight: 135, reps: 5 }] },
      ],
    });

    expect(historyThatMustNotControlSelection.exercises).toHaveLength(3);
    expect(buildExerciseSelectionReference(current).requiredExercises).toEqual([
      'Incline Bench Press',
      'Bench Press',
    ]);
  });
});

describe('date and cardio formatting', () => {
  it('formats a local Date for per-day session context storage', () => {
    expect(getLocalDateString(new Date(2026, 6, 31, 23, 30))).toBe('2026-07-31');
  });

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
