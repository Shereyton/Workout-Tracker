const {
  parseDateLocal,
  parseAiText,
  parseCsv,
  snapshotToLines,
  formatDuration,
  sanitizeHistory,
  sanitizeHistoryTitles,
  isValidHistoryDate,
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

test('calendar dates reject impossible dates and malformed values instead of rolling forward', () => {
  expect(isValidHistoryDate('2024-02-29')).toBe(true);
  for(const value of ['2025-02-29', '2026-04-31', '2026-13-01', '', null, {}, '2026-9-10']){
    expect(isValidHistoryDate(value)).toBe(false);
    expect(Number.isNaN(parseDateLocal(value).getTime())).toBe(true);
  }
});

test('malformed stored history cannot become renderable data or unsafe object keys', () => {
  const history = JSON.parse('{"2026-09-10":[null,{},7,"", " note ", "note"],"2026-09-11":{},"2026-02-30":["wrong date"],"__proto__":["bad"]}');
  expect(sanitizeHistory(history)).toEqual({ '2026-09-10': ['note'] });
  expect(sanitizeHistory(null)).toEqual({});
  expect(sanitizeHistoryTitles({ '2026-09-10': ' Chest ', '2026-09-11': {}, 'invalid': 'label' })).toEqual({ '2026-09-10': 'Chest' });
});

test('snapshot conversion drops malformed sets without losing the remaining valid workout', () => {
  expect(snapshotToLines([null, {}, { name: 'Bench', sets: [null, {}, { weight: 'NaN', reps: 5 }, { weight: 135, reps: 5.5 }, { weight: 135, reps: 5 }] },
    { name: 'Superset', isSuperset: true, sets: [null, { exercises: [null, { name: 'Row', weight: 100, reps: 8 }] }] },
    { name: 'Run', isCardio: true, sets: [{ duration: Infinity }, { duration: 60, distance: -1 }, { duration: 120 }] },
  ])).toEqual(['Bench: Set 5 - 135 lbs × 5 reps', 'Row: Set 2 - 100 lbs × 8 reps', 'Run: Set 3 - 2m 0s']);
  expect(snapshotToLines({})).toEqual([]);
  expect(formatDuration(Infinity)).toBe('0s');
});

test('CSV imports reject NaN, overflow, fractional reps, negative values, and invalid set numbers', () => {
  const text = [
    'Exercise,Set,Weight,Reps,Distance,Duration',
    'Bench,1,NaN,5,,', 'Bench,2,100,5.5,,', 'Bench,3,-1,5,,',
    'Bench,0,100,5,,', 'Bench,5,1e5,5,,', 'Run,1,,,2,Infinity',
    'Run,2,,,-1,120', 'Bench,6,100,5,,',
  ].join('\n');
  expect(parseCsv(text, '2026-09-10')).toEqual({ '2026-09-10': ['Bench: Set 6 - 100 lbs × 5 reps'] });
});

test('CSV supports quoted reordered headers, explicit workout dates, and kg units', () => {
  const text = 'WorkoutDate,2026-09-10\n"Reps","Exercise","Weight","Set","Unit"\n5,Bench,60,1,kg';
  expect(parseCsv(text, '2026-09-11')).toEqual({ '2026-09-10': ['Bench: Set 1 - 60 kg × 5 reps'] });
  expect(parseCsv(text.replace('2026-09-10', '2026-02-30'), '2026-09-11')).toBeNull();
});

test('AI history rejects invalid metrics and invalid declared dates', () => {
  const text = 'WORKOUT DATA - 2026-09-10\nBench:\nSet 1: 135 lbs × 5.5 reps\nSet 2: 99999 lbs × 5 reps\nSet 3: 135 lbs × 5 reps';
  expect(parseAiText(text, '2026-09-11')).toEqual({ '2026-09-10': ['Bench: Set 3 - 135 lbs × 5 reps'] });
  expect(parseAiText(text.replace('2026-09-10', '2026-02-30'), '2026-09-11')).toBeNull();
  expect(parseAiText(null, '2026-09-11')).toBeNull();
});

describe('calendar interaction reliability', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="calendar"></div><h4 id="dayTitle"></h4><ul id="entries"></ul>
      <input id="entryInput"><button id="addEntry"></button><button id="exportHistory"></button>
      <button id="importHistory"></button><input id="importHistoryFile" type="file">
      <button id="saveTodaySession"></button><button id="calPrev"></button><button id="calNext"></button>
      <div id="calTitle"></div><button id="calToday"></button><input type="date" id="calGoto"><button id="calGo"></button>
      <textarea id="pasteJson"></textarea><button id="importFromPaste"></button><button id="resetDay"></button>
      <input id="dayLabelInput"><button id="saveDayLabel"></button><button id="clearDayLabel"></button>
      <select id="titleExportSelect"></select><button id="exportTitleHistory"></button>`;
    window.wtConfirmModal = jest.fn().mockResolvedValue(true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete window.getSessionSnapshot;
    delete window.wtConfirmModal;
  });
  function start(){ document.dispatchEvent(new Event('DOMContentLoaded')); }
  function paste(value){
    document.getElementById('pasteJson').value = typeof value === 'string' ? value : JSON.stringify(value);
    document.getElementById('importFromPaste').click();
  }

  test('malformed calendar storage does not prevent startup or adding a new note', () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem('wt_history', JSON.stringify({ [date]: { unexpected: true }, 'bad': [null] }));
    start();
    expect(document.querySelectorAll('.calendar-day')).toHaveLength(42);
    document.getElementById('entryInput').value = 'Felt strong today';
    document.getElementById('entryInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(JSON.parse(localStorage.getItem('wt_history'))[date]).toEqual(['Felt strong today']);
    expect(document.getElementById('entries').textContent).toContain('Felt strong today');
  });

  test('import navigates to the imported month and ignores malformed entries', () => {
    start();
    paste({ history: { '2024-02-29': [null, 'Bench: Set 1 - 100 lbs × 5 reps'], '2024-02-30': ['invalid'] } });
    expect(document.getElementById('calTitle').textContent).toBe('February 2024');
    expect(document.querySelector('[data-date="2024-02-29"]').getAttribute('aria-selected')).toBe('true');
    expect(JSON.parse(localStorage.getItem('wt_history'))).toEqual({ '2024-02-29': ['Bench: Set 1 - 100 lbs × 5 reps'] });
    expect(document.querySelector('.calendar-status').textContent).toContain('2 invalid entries ignored');
  });

  test('unsupported JSON is not reported as an imported workout or removed from the paste field', () => {
    start();
    paste({ unexpected: 'format' });
    expect(document.getElementById('pasteJson').value).not.toBe('');
    expect(document.querySelector('.calendar-status').textContent).toContain('No valid dated workout entries');
    expect(localStorage.getItem('wt_history')).toBeNull();
  });

  test('calendar keyboard navigation crosses month boundaries while preserving focus', () => {
    start();
    document.getElementById('calGoto').value = '2026-01-31';
    document.getElementById('calGoto').dispatchEvent(new Event('input'));
    document.getElementById('calGo').click();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement.dataset.date).toBe('2026-02-01');
    expect(document.getElementById('calTitle').textContent).toBe('February 2026');
    expect(document.querySelectorAll('.calendar-day[tabindex="0"]')).toHaveLength(1);
  });

  test('a failed storage write keeps the note input and previously saved history intact', () => {
    start();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    document.getElementById('entryInput').value = 'Do not lose this note';
    document.getElementById('addEntry').click();
    expect(document.getElementById('entryInput').value).toBe('Do not lose this note');
    expect(localStorage.getItem('wt_history')).toBeNull();
    expect(document.querySelector('.calendar-status').textContent).toContain('could not be saved');
    expect(error).toHaveBeenCalled();
  });

  test('saving an unavailable session reports an error without creating an endless retry', () => {
    start();
    const timeout = jest.spyOn(window, 'setTimeout');
    document.getElementById('saveTodaySession').click();
    expect(document.querySelector('.calendar-status').textContent).toContain('not ready yet');
    expect(timeout).not.toHaveBeenCalled();
  });
});
