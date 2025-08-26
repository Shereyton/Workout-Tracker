const { parseDateLocal, parseAiText, snapshotToLines, parseHistoryLines, getMonthGrid, getDayStats } = require('../calendar');

test('parseDateLocal returns exact date', () => {
  const d = parseDateLocal('2025-08-01');
  expect(d.getFullYear()).toBe(2025);
  expect(d.getMonth()).toBe(7);
  expect(d.getDate()).toBe(1);
});

test('parseAiText parses exported AI text format', () => {
  const sample = `WORKOUT DATA - 2024-07-04\n\nBench Press:\n  Set 1: 185 lbs × 5 reps\n  Set 2: 185 lbs × 5 reps\n\nSquat:\n  Set 1: 225 lbs × 5 reps`;
  const res = parseAiText(sample, '2024-07-04');
  expect(res).toEqual({
    '2024-07-04': [
      'Bench Press: 185 lbs × 5 reps',
      'Bench Press: 185 lbs × 5 reps',
      'Squat: 225 lbs × 5 reps'
    ]
  });
});

test('snapshotToLines retains duplicate sets with numbering', () => {
  const snapshot = [
    {
      name: 'Bench Press',
      isSuperset: false,
      isCardio: false,
      sets: [
        { weight: 185, reps: 5 },
        { weight: 185, reps: 5 }
      ]
    }
  ];
  const lines = snapshotToLines(snapshot);
  expect(lines).toEqual([
    'Bench Press: Set 1 - 185 lbs × 5 reps',
    'Bench Press: Set 2 - 185 lbs × 5 reps'
  ]);
});

test('parseHistoryLines parses valid lines and ignores invalid', () => {
  const result = parseHistoryLines([
    'Bench Press: 100 lbs × 5 reps',
    'oops'
  ]);
  expect(result.sets).toBe(1);
  expect(result.volume).toBe(500);
  expect(result.entries).toEqual([
    { text: 'Bench Press: 100 lbs × 5 reps', lift: 'Bench Press', weight: 100, reps: 5 }
  ]);
});

test('getMonthGrid returns 42 days with correct boundaries', () => {
  const grid = getMonthGrid(new Date('2024-02-15'));
  expect(grid).toHaveLength(42);
  expect(grid[0].iso).toBe('2024-01-28');
  expect(grid[41].iso).toBe('2024-03-09');
  expect(grid[0].inMonth).toBe(false);
  expect(grid[10].inMonth).toBe(true);
});

test('getDayStats reads from localStorage', () => {
  localStorage.clear();
  localStorage.setItem('wt_history', JSON.stringify({
    '2024-08-18': [
      'Bench Press: 100 lbs × 5 reps',
      'Squat: 150 lbs × 3 reps'
    ]
  }));
  const stats = getDayStats('2024-08-18');
  expect(stats.sets).toBe(2);
  expect(stats.volume).toBe(100 * 5 + 150 * 3);
  expect(stats.entries.length).toBe(2);
});
