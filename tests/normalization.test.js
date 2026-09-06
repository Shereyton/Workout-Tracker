const {
  normalizeSet,
  normalizePayload,
  normalizeSessionStartedAt,
} = require('../script');

describe('normalizeSet - superset internals', () => {
  it('does not turn missing weights into bodyweight sets after repeated normalization', () => {
    const invalid = normalizeSet({ weight: null, reps: 5 });
    expect(normalizeSet(invalid).weight).toBeNull();
    expect(normalizePayload({ exercises: [{ name: 'Bench', sets: [invalid] }] }).totalSets).toBe(0);
  });
  it('marks invalid inner exercise values instead of fabricating a completed rep', () => {
    const input = {
      set: 1,
      exercises: [
        { name: 'Bench', weight: -5, reps: 0 },
        { name: 'Row', weight: '10', reps: '3.9' },
      ],
      restPlanned: '30',
      restActual: 'NaN',
    };
    const out = normalizeSet(input);
    expect(out.exercises[0].weight).toBeNull();
    expect(out.exercises[0].reps).toBeNull();
    expect(out.exercises[1].weight).toBe(10);
    expect(out.exercises[1].reps).toBe(3);
    expect(out.restPlanned).toBe(30);
    expect(out.restActual).toBeNull();
  });
});

describe('normalizeSessionStartedAt', () => {
  const now = new Date('2026-08-11T16:00:00.000Z').getTime();

  it('keeps a recent active session', () => {
    const startedAt = '2026-08-11T15:00:00.000Z';
    expect(normalizeSessionStartedAt(startedAt, now)).toBe(startedAt);
  });

  it('pauses stale, invalid, and future session timers', () => {
    expect(normalizeSessionStartedAt('2026-08-07T12:00:00.000Z', now)).toBeNull();
    expect(normalizeSessionStartedAt('not-a-date', now)).toBeNull();
    expect(normalizeSessionStartedAt('2026-08-11T16:02:00.000Z', now)).toBeNull();
  });
});

describe('normalizePayload - mixed exercises', () => {
  it('coerces valid values and removes invalid imported efforts', () => {
    const payload = {
      date: '2025-01-01',
      timestamp: '2025-01-01T10:00:00.000Z',
      exercises: [
        { name: 'Squat', sets: [{ weight: '200.7', reps: '5.9' }, { weight: -10, reps: -2 }] },
        { name: 'Jog', isCardio: true, sets: [{ distance: '-1', duration: 0 }, { distance: '2.5', duration: '601.8' }] },
        { name: 'Push+Pull', isSuperset: true, exercises: ['Push', 'Pull'], sets: [ { exercises: [ { name: 'Push', weight: '-5', reps: '0' }, { name: 'Pull', weight: '50.4', reps: '10.2' } ] } ] }
      ]
    };
    const norm = normalizePayload(payload);
    const [squat, jog, sup] = norm.exercises;
    expect(squat.sets[0].weight).toBe(200.7);
    expect(squat.sets[0].reps).toBe(5);
    expect(squat.sets).toHaveLength(1);

    expect(jog.sets).toHaveLength(1);
    expect(jog.sets[0].distance).toBe(2.5);
    expect(jog.sets[0].duration).toBe(601);

    expect(sup.sets).toEqual([]);

    // totals
    expect(norm.totalExercises).toBe(3);
    expect(norm.totalSets).toBe(
      squat.sets.length + jog.sets.length + sup.sets.length
    );
    expect(norm.schema).toBe(9);
  });

  it('preserves structured session planning context in exported payloads', () => {
    const norm = normalizePayload({
      date: '2026-07-30',
      exercises: [],
      sessionContext: {
        status: 'time_limited',
        nextWorkoutMinutes: 90,
      },
    });

    expect(norm.sessionContext).toMatchObject({
      status: 'time_limited',
      isIncomplete: true,
      nextWorkoutMinutes: 90,
    });
  });
});
