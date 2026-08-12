const {
  parseDateLocal,
  parseAiText,
  parseCsv,
  snapshotToLines,
  formatDuration,
} = require('../calendar');

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
      'Bench Press: Set 1 - 185 lbs × 5 reps',
      'Bench Press: Set 2 - 185 lbs × 5 reps',
      'Squat: Set 1 - 225 lbs × 5 reps'
    ]
  });
});

test('parseAiText retains cardio distance and duration', () => {
  const sample = `WORKOUT DATA - 2024-07-04\n\nSESSION SNAPSHOT\n- Session duration: 45s\n\nRunning:\n  Set 1: 2.5 mi in 20m 30s\n\nPlank:\n  Set 1: 45s`;
  expect(parseAiText(sample, '2024-07-04')).toEqual({
    '2024-07-04': [
      'Running: Set 1 - 2.5 mi in 20m 30s',
      'Plank: Set 1 - 45s',
    ],
  });
});

test('parseCsv ignores metadata rows before header', () => {
  const csv = [
    'SessionStart,2024-07-04T10:00:00Z',
    'SessionEnd,2024-07-04T11:00:00Z',
    'SessionDuration(sec),3600',
    '',
    'Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)',
    'Bench Press,1,185,5,,,08:15,,'
  ].join('\n');
  const res = parseCsv(csv, '2024-07-04');
  expect(res).toEqual({
    '2024-07-04': ['Bench Press: Set 1 - 185 lbs × 5 reps']
  });
});

test('parseCsv handles quoted exercise names with commas', () => {
  const csv = [
    'Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)',
    '"Curl, Barbell",1,75,10,,,08:15,,'
  ].join('\n');
  const res = parseCsv(csv, '2024-07-04');
  expect(res).toEqual({
    '2024-07-04': ['Curl, Barbell: Set 1 - 75 lbs × 10 reps']
  });
});

test('parseCsv preserves cardio rows', () => {
  const csv = [
    'Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)',
    'Running,2,,,3.1,1500,08:15,,',
  ].join('\n');
  expect(parseCsv(csv, '2024-07-04')).toEqual({
    '2024-07-04': ['Running: Set 2 - 3.1 mi in 25m 0s'],
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

test('snapshotToLines formats cardio sessions without undefined values', () => {
  const snapshot = [{
    name: 'Jump Rope',
    isCardio: true,
    sets: [{ set: 1, distance: null, duration: 75 }],
  }];
  expect(snapshotToLines(snapshot)).toEqual([
    'Jump Rope: Set 1 - 1m 15s',
  ]);
});

test('parseAiText preserves every superset component and failed attempt', () => {
  const sample = `WORKOUT DATA - 2024-07-04\n\nBench + Row:\n  Set 1: Bench: 185 lbs × 5 reps [Auto: Working set] | Row: 100 lbs × 10 reps [Auto: Working set]\n  Set 2: Bench: Failed attempt at 195 lbs | Row: 105 lbs × 8 reps`;
  expect(parseAiText(sample, '2024-07-04')).toEqual({
    '2024-07-04': [
      'Bench: Set 1 - 185 lbs × 5 reps',
      'Row: Set 1 - 100 lbs × 10 reps',
      'Bench: Set 2 - Failed attempt at 195 lbs',
      'Row: Set 2 - 105 lbs × 8 reps',
    ],
  });
});

test('parseCsv preserves failed-attempt semantics', () => {
  const csv = [
    'Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec),SetRole,RoleSource,RoleConfidence,RoleReason,Outcome,RIR,Technique,Pain',
    'Bench Press,3,295,0,,,08:15,,,failed_attempt,manual,,,failed,,unknown,unknown',
  ].join('\n');
  expect(parseCsv(csv, '2024-07-04')).toEqual({
    '2024-07-04': ['Bench Press: Set 3 - Failed attempt at 295 lbs'],
  });
});

test('snapshotToLines preserves failed attempts', () => {
  expect(snapshotToLines([{
    name: 'Bench Press',
    sets: [{ set: 2, weight: 295, reps: 0, role: 'failed_attempt', outcome: 'failed' }],
  }])).toEqual([
    'Bench Press: Set 2 - Failed attempt at 295 lbs',
  ]);
});

test('formatDuration keeps seconds in hour-long efforts', () => {
  expect(formatDuration(3630)).toBe('1h 0m 30s');
});
