const { parseDateLocal, parseAiText, snapshotToLines } = require('../calendar');

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

test('parseAiText preserves weight units', () => {
  const sample = `WORKOUT DATA - 2024-07-04\n\nSquat:\n  Set 1: 100 kg × 5 reps`;
  const res = parseAiText(sample, '2024-07-04');
  expect(res).toEqual({ '2024-07-04': ['Squat: 100 kg × 5 reps'] });
});

test('parseAiText returns null without date', () => {
  const sample = `Bench Press:\n  Set 1: 185 lbs × 5 reps`;
  expect(parseAiText(sample)).toBeNull();
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
