const fs = require('fs');
const path = require('path');

describe('Workout Tracker', () => {
  let html;
  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  });

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = html;
    localStorage.clear();
    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.navigator.clipboard = { writeText: jest.fn(() => Promise.resolve()) };
  });

  function startExercise(name) {
    const select = document.getElementById('exerciseSelect');
    select.value = name;
    select.dispatchEvent(new Event('change'));
  }

  function logSet(w, r) {
    document.getElementById('weight').value = w;
    document.getElementById('reps').value = r;
    document.getElementById('logBtn').click();
  }

  test('logs valid sets and updates summary', () => {
    require('../script');
    startExercise('Bench Press');
    logSet('100', '5');

    const items = document.querySelectorAll('#setsList .set-item');
    expect(items.length).toBe(1);
    expect(document.getElementById('summaryText').textContent)
      .toContain('Total Sets: 1');
  });

  test('rejects invalid input', () => {
    require('../script');
    startExercise('Bench Press');
    logSet('', '0');

    expect(global.alert).toHaveBeenCalled();
    const items = document.querySelectorAll('#setsList .set-item');
    expect(items.length).toBe(0);
  });

  test('deletes sets correctly', () => {
    require('../script');
    startExercise('Bench Press');
    logSet('100', '5');

    const delBtn = document.querySelector('#setsList .set-item button.del');
    delBtn.click();

    const items = document.querySelectorAll('#setsList .set-item');
    expect(items.length).toBe(0);
    expect(document.getElementById('summaryText').textContent)
      .toContain('Start your first exercise');
  });

  test('handles superset groups', () => {
    require('../script');
    document.getElementById('startSuperset').click();
    const sel1 = document.getElementById('supersetSelect1');
    const sel2 = document.getElementById('supersetSelect2');
    sel1.value = 'Bench Press';
    sel2.value = 'Squats';
    document.getElementById('beginSuperset').click();

    document.getElementById('weight0').value = '50';
    document.getElementById('reps0').value = '10';
    document.getElementById('weight1').value = '60';
    document.getElementById('reps1').value = '8';
    document.getElementById('logBtn').click();

    const txt = document.getElementById('setsList').textContent;
    expect(txt).toContain('Bench Press');
    expect(txt).toContain('Squats');
  });

  test('exports data to JSON and CSV', async () => {
    const blobs = [];
    global.Blob = class FakeBlob {
      constructor(parts, opts) { this.parts = parts; this.opts = opts; blobs.push(this); }
      text() { return Promise.resolve(this.parts.join('')); }
    };

    require('../script');
    startExercise('Bench Press');
    logSet('100', '5');

    await document.getElementById('exportBtn').click();

    expect(blobs.length).toBe(2);
    const json = JSON.parse(blobs[0].parts[0]);
    expect(json.totalSets).toBe(1);
    expect(blobs[1].parts[0]).toContain('Bench Press');
    expect(global.navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test('generates session summary across exercises', () => {
    require('../script');
    startExercise('Bench Press');
    logSet('100', '5');
    document.getElementById('nextExerciseBtn').click();
    startExercise('Squats');
    logSet('150', '5');

    const summary = document.getElementById('summaryText').textContent;
    expect(summary).toContain('Total Sets: 2');
    expect(summary).toContain('Bench Press');
    expect(summary).toContain('Squats');
  });
});
