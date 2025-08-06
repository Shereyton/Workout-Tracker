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
    expect(canLogCardio(0, 30)).toBe(true);
  });
  it('rejects invalid duration', () => {
    expect(canLogCardio(1, 0)).toBe(false);
  });
});
