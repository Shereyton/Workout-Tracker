const { parseDateLocal, parseAiText, parseCsv, snapshotToLines, mergeHistory } = require('../calendar');

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

test('parseAiText handles inline exercise lines', () => {
  const sample = `WORKOUT DATA - 2024-07-04\nSet 1 - Bench Press: 185 lbs × 5 reps\nSet 1 - Squat: 225 lbs × 5 reps`;
  const res = parseAiText(sample, '2024-07-04');
  expect(res).toEqual({
    '2024-07-04': [
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

test('parseCsv happy path', () => {
  const csv = `Exercise,Set,Weight,Reps\nBench Press,1,185,5\nBench Press,2,185,5\nSquat,1,225,5`;
  const res = parseCsv(csv, '2024-07-04');
  expect(res).toEqual({
    '2024-07-04': [
      'Bench Press: Set 1 - 185 lbs × 5 reps',
      'Bench Press: Set 2 - 185 lbs × 5 reps',
      'Squat: Set 1 - 225 lbs × 5 reps'
    ]
  });
});

test('parseCsv invalid headers', () => {
  const csv = `Ex,Set,Weight,Reps\nBench,1,100,10`;
  expect(parseCsv(csv, '2024-07-04')).toBeNull();
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

test('snapshotToLines expands supersets', () => {
  const snapshot = [
    {
      name: 'Superset',
      isSuperset: true,
      sets: [
        { exercises: [ { name: 'Bench', weight: 100, reps: 5 }, { name: 'Row', weight: 80, reps: 8 } ] },
        { exercises: [ { name: 'Bench', weight: 100, reps: 5 }, { name: 'Row', weight: 80, reps: 8 } ] }
      ]
    }
  ];
  const lines = snapshotToLines(snapshot);
  expect(lines).toEqual([
    'Bench: Set 1 - 100 lbs × 5 reps',
    'Row: Set 1 - 80 lbs × 8 reps',
    'Bench: Set 2 - 100 lbs × 5 reps',
    'Row: Set 2 - 80 lbs × 8 reps'
  ]);
});

test('mergeHistory avoids duplicates', () => {
  const base = { '2024-07-04': ['Bench: 100 lbs × 5 reps'] };
  const incoming = { '2024-07-04': ['Bench: 100 lbs × 5 reps', 'Squat: 200 lbs × 5 reps'], '2024-07-05': ['Row: 80 lbs × 8 reps'] };
  mergeHistory(base, incoming);
  expect(base).toEqual({
    '2024-07-04': ['Bench: 100 lbs × 5 reps', 'Squat: 200 lbs × 5 reps'],
    '2024-07-05': ['Row: 80 lbs × 8 reps']
  });
});
