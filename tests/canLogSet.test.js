const { canLogSet, canLogCardio } = require('../script');

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
  it('allows durations under a minute', () => {
    expect(canLogCardio(0, 45)).toBe(true);
  });
  it('allows missing distance for Plank', () => {
    expect(canLogCardio(null, 30, 'Plank')).toBe(true); // 30 seconds
  });
});
