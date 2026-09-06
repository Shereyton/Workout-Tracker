const {
  canLogSet,
  parseWorkoutNumber,
  canLogStrengthEntry,
  canLogCardio,
  normalizeSet,
  normalizePayload,
  appendUniqueHistoryLines,
  upsertStructuredHistoryLines,
  csvRow,
} = require('../script');

describe('canLogSet', () => {
  it('rejects non-numeric values and fractional reps', () => {
    for (const value of [NaN, Infinity, undefined, null, '100']) expect(canLogSet(value, 5)).toBe(false);
    expect(canLogSet(100, 2.5)).toBe(false);
    for (const value of ['', 'NaN', 'Infinity', '10lbs', '5oops']) expect(Number.isNaN(parseWorkoutNumber(value))).toBe(true);
    expect(parseWorkoutNumber('0')).toBe(0);
    expect(parseWorkoutNumber('12.5')).toBe(12.5);
  });
  it('allows zero weight with positive reps', () => {
    expect(canLogSet(0, 5)).toBe(true);
  });
  it('rejects invalid reps', () => {
    expect(canLogSet(50, 0)).toBe(false);
  });
});

describe('canLogStrengthEntry', () => {
  it('allows a failed attempt with weight and zero completed reps', () => {
    expect(canLogStrengthEntry(295, 0, 'failed_attempt')).toBe(true);
  });

  it('still rejects zero reps for a completed set', () => {
    expect(canLogStrengthEntry(295, 0, 'working')).toBe(false);
  });
});

describe('canLogCardio', () => {
  it('allows zero distance with positive duration', () => {
    expect(canLogCardio(0, 1800)).toBe(true); // 30 minutes
  });
  it('rejects invalid duration', () => {
    expect(canLogCardio(1, 0)).toBe(false);
  });
  it('allows missing distance for Jump Rope', () => {
    expect(canLogCardio(null, 15, 'Jump Rope')).toBe(true); // 15 seconds
  });
  it('allows sub-minute durations', () => {
    expect(canLogCardio(0, 45)).toBe(true);
  });
  it('allows missing distance for Plank', () => {
    expect(canLogCardio(null, 30, 'Plank')).toBe(true); // 30 seconds
  });
  it('rejects negative distance', () => {
    expect(canLogCardio(-1, 60, 'Run')).toBe(false);
  });
});

describe('data normalization', () => {
  it('quarantines invalid set values instead of fabricating performance', () => {
    const set = normalizeSet({ weight: -5, reps: -2, duration: -10, restActual: 'NaN' });
    expect(set.weight).toBeNull();
    expect(set.reps).toBeNull();
    expect(set.duration).toBeNull();
    expect(set.restActual).toBeNull();
  });

  it('drops invalid imported sets instead of turning them into one rep', () => {
    const norm = normalizePayload([{ name: 'Bench', sets: [{ weight: '20', reps: '-3' }] }]);
    expect(norm.totalExercises).toBe(1);
    expect(norm.totalSets).toBe(0);
    expect(norm.exercises[0].sets).toEqual([]);
    expect(norm.exercises[0].nextSet).toBe(1);
    expect(norm.schema).toBe(9);
  });
});

describe('history and CSV helpers', () => {
  it('keeps distinct numbered sets while skipping exact duplicates', () => {
    const merged = appendUniqueHistoryLines(
      ['Bench Press: Set 1 - 185 lbs × 5 reps'],
      [
        'Bench Press: Set 1 - 185 lbs × 5 reps',
        'Bench Press: Set 2 - 185 lbs × 5 reps',
      ],
    );
    expect(merged).toEqual([
      'Bench Press: Set 1 - 185 lbs × 5 reps',
      'Bench Press: Set 2 - 185 lbs × 5 reps',
    ]);
  });

  it('quotes CSV fields that contain commas or quotes', () => {
    expect(csvRow(['Curl, Barbell', 1, 75, 10])).toBe('"Curl, Barbell",1,75,10');
    expect(csvRow(['He said "press"', 1])).toBe('"He said ""press""",1');
  });

  it('replaces a corrected exercise/set line without leaving stale history', () => {
    expect(upsertStructuredHistoryLines(
      ['Bench Press: Set 1 - 185 lbs × 5 reps', 'Felt strong'],
      ['bench   press: Set 1 - 190 lbs × 5 reps'],
    )).toEqual([
      'Felt strong',
      'bench   press: Set 1 - 190 lbs × 5 reps',
    ]);
  });
});
