const { canLogSet } = require('../../script');

describe('canLogSet', () => {
  it('allows zero weight with positive reps', () => {
    expect(canLogSet(0, 5)).toBe(true);
  });
  it('rejects invalid reps', () => {
    expect(canLogSet(50, 0)).toBe(false);
  });
});
