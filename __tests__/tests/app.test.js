const { parseDateLocal } = require('../calendar');

test('parseDateLocal returns exact date', () => {
  const d = parseDateLocal('2025-08-01');
  expect(d.getFullYear()).toBe(2025);
  expect(d.getMonth()).toBe(7); // August is month index 7
  expect(d.getDate()).toBe(1);
});
