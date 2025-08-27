const { parseHistoryLine, computeDayTotals } = require('../calendar');

describe('parseHistoryLine', () => {
  test('parses valid line', () => {
    expect(parseHistoryLine('Bench Press: 185 lbs × 5 reps')).toEqual({ name: 'Bench Press', weight: 185, reps: 5 });
  });
  test('returns null for invalid line', () => {
    expect(parseHistoryLine('not valid')).toBeNull();
  });
});

describe('computeDayTotals', () => {
  test('computes sets and volume ignoring invalid lines', () => {
    const lines = [
      'Bench Press: 100 lbs × 5 reps',
      'oops',
      'Squat: 200 lbs × 3 reps'
    ];
    expect(computeDayTotals(lines)).toEqual({ sets: 2, volume: 100*5 + 200*3 });
  });
});
