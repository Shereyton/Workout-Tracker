const { e1rm, computeDaily } = require('../charts.js');

describe('e1rm', () => {
  test('calculates Estimated 1RM', () => {
    expect(e1rm(255, 2)).toBe(Math.round(255 * (1 + 2/30)));
    expect(e1rm(100, 10)).toBe(Math.round(100 * (1 + 10/30)));
  });
  test('returns 0 for invalid input', () => {
    expect(e1rm(-1, 5)).toBe(0);
    expect(e1rm(100, 0)).toBe(0);
  });
});

describe('computeDaily', () => {
  const mock = [
    { date: '2024-01-01', lift: 'bench', sets: [{ weight: 100, reps: 5 }] },
    { date: '2024-01-01', lift: 'bench', sets: [{ weight: 110, reps: 3 }] },
    { date: '2024-01-02', lift: 'bench', sets: [{ weight: 120, reps: 2 }] },
  ];
  test('aggregates volume by day', () => {
    const res = computeDaily(mock, 'bench', 'volume');
    expect(res.length).toBe(2);
    const day1 = res.find(r => r.x.getTime() === new Date('2024-01-01').getTime());
    expect(day1.y).toBe(100*5 + 110*3);
  });
});
