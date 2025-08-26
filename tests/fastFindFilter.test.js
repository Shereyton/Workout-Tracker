const { ffMatchesFilter } = require('../script');

describe('fast find filter predicates', () => {
  const strengthEx = { name: 'Bench Press', category: 'Chest' };
  const cardioEx = { name: 'Run', category: 'Cardio', isCardio: true };
  const customEx = { name: 'My Move', category: 'Arms', custom: true };
  const supersetEx = { name: 'Bench + Row', isSuperset: true };

  it('strength filter includes only strength exercises', () => {
    expect(ffMatchesFilter(strengthEx, 'strength')).toBe(true);
    expect(ffMatchesFilter(cardioEx, 'strength')).toBe(false);
    expect(ffMatchesFilter(supersetEx, 'strength')).toBe(false);
  });

  it('cardio filter matches cardio and special cases', () => {
    expect(ffMatchesFilter(cardioEx, 'cardio')).toBe(true);
    expect(ffMatchesFilter({ name: 'Plank', category: 'Core' }, 'cardio')).toBe(true);
    expect(ffMatchesFilter(strengthEx, 'cardio')).toBe(false);
  });

  it('custom filter includes only custom exercises', () => {
    expect(ffMatchesFilter(customEx, 'custom')).toBe(true);
    expect(ffMatchesFilter(strengthEx, 'custom')).toBe(false);
  });
});

