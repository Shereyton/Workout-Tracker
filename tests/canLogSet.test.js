const { canLogSet, canLogCardio, normalizeSet, normalizePayload } = require('../script');

describe('canLogSet', () => {
  it('allows zero weight with positive reps', () => {
    expect(canLogSet(0, 5)).toBe(true);
  });
  it('rejects invalid reps', () => {
    expect(canLogSet(50, 0)).toBe(false);
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
  it('sanitizes set values', () => {
    const set = normalizeSet({ weight: -5, reps: -2, duration: -10, restActual: 'NaN' });
    expect(set.weight).toBe(0);
    expect(set.reps).toBe(1);
    expect(set.duration).toBe(0);
    expect(set.restActual).toBeNull();
  });

  it('normalizes payload arrays', () => {
    const norm = normalizePayload([{ name: 'Bench', sets: [{ weight: '20', reps: '-3' }] }]);
    expect(norm.totalExercises).toBe(1);
    expect(norm.totalSets).toBe(1);
    expect(norm.exercises[0].sets[0].weight).toBe(20);
    expect(norm.exercises[0].sets[0].reps).toBe(1);
    expect(norm.schema).toBe(2);
  });
});
