const { normalizeSet, normalizePayload } = require('../script');

describe('normalizeSet - superset internals', () => {
  it('normalizes inner exercises weight/reps', () => {
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
    expect(out.exercises[0].weight).toBe(0);
    expect(out.exercises[0].reps).toBe(1);
    expect(out.exercises[1].weight).toBe(10);
    expect(out.exercises[1].reps).toBe(3);
    expect(out.restPlanned).toBe(30);
    expect(out.restActual).toBeNull();
  });
});

describe('normalizePayload - mixed exercises', () => {
  it('coerces values for strength/cardio/superset', () => {
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
    expect(squat.sets[1].weight).toBe(0);
    expect(squat.sets[1].reps).toBe(1);

    // cardio: first set invalid distance becomes null, duration min 0 stays 0 but our normalizer floors; canLogCardio enforces later
    expect(jog.sets[0].distance).toBeNull();
    expect(jog.sets[0].duration).toBe(0);
    expect(jog.sets[1].distance).toBe(2.5);
    expect(jog.sets[1].duration).toBe(601);

    // superset inner normalization
    expect(Array.isArray(sup.sets[0].exercises)).toBe(true);
    expect(sup.sets[0].exercises[0].weight).toBe(0);
    expect(sup.sets[0].exercises[0].reps).toBe(1);
    expect(sup.sets[0].exercises[1].weight).toBe(50.4);
    expect(sup.sets[0].exercises[1].reps).toBe(10);

    // totals
    expect(norm.totalExercises).toBe(3);
    expect(norm.totalSets).toBe(
      squat.sets.length + jog.sets.length + sup.sets.length
    );
    expect(norm.schema).toBe(3);
  });
});
