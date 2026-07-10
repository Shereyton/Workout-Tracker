const {
  normalizePayload,
  computeSessionStats,
  buildExerciseHighlightsForExport,
  computeConsistencyMetricsFromStats,
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
