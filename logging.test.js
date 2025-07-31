const { canLogSet } = require('./script');

test('allows weight zero', () => {
  expect(canLogSet(0, 5)).toBe(true);
});

test('rejects invalid reps', () => {
  expect(canLogSet(0, 0)).toBe(false);
});
