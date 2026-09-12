const fs = require('fs');
const path = require('path');

describe('finish workout persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [{ name: 'Bench Press', category: 'Chest' }] });
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {} }));
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    localStorage.setItem('wt_schemaVersion', '9');
    // Older imports may contain incomplete entries among otherwise valid history.
    localStorage.setItem('wt_sessionArchive', JSON.stringify({
      '2026-08-11': { date: '2026-08-11', exercises: [{ name: 'Bench', sets: [{ weight: 100, reps: 5 }] }] },
      '2026-08-10': { date: '2026-08-10', exercises: [null, { name: 'Missing sets' }] },
    }));
    localStorage.setItem('wt_session', JSON.stringify({ exercises: [], startedAt: null }));
    localStorage.setItem('wt_currentExercise', JSON.stringify({ name: 'Bench Press', sets: [{ set: 1, weight: 135, reps: 8 }], nextSet: 2 }));
    require('../script');
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

  async function finish() {
    document.querySelector('[aria-label="Finish workout"]').click();
    const save = [...document.querySelectorAll('[role="dialog"] button')].find(btn => btn.textContent === 'Save Workout');
    expect(save).toBeTruthy();
    save.click();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('can reset and log a new exercise with malformed historical entries present', async () => {
    document.getElementById('resetBtn').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(btn => btn.textContent === 'Reset').click();
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise'))).toBeNull();
    document.getElementById('customExercise').value = 'Test Squat';
    document.getElementById('addExercise').click();
    for (const [id, value] of [['weight', '100'], ['reps', '5']]) {
      document.getElementById(id).value = value;
      document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(document.getElementById('logBtn').disabled).toBe(false);
    document.getElementById('logBtn').click();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise')).sets[0]).toMatchObject({ weight: 100, reps: 5 });
    expect(document.querySelector('.saved-workouts').open).toBe(false);
    expect(document.querySelector('.saved-workout-download').classList.contains('btn-mini')).toBe(false);
    expect(JSON.parse(localStorage.getItem('wt_sessionArchive'))['2026-08-10'].exercises[0]).toBeNull();
  });

  it('keeps sets visible and persisted, with a downloadable saved workout', async () => {
    await finish();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise')).sets[0].reps).toBe(8);
    expect(Object.values(JSON.parse(localStorage.getItem('wt_completedWorkouts'))).some(record => record.exercises?.[0]?.sets?.[0]?.weight === 135)).toBe(true);
    expect(document.body.textContent).toContain('Download Workout');
    expect(document.body.textContent).toContain('Start New Workout');
    expect(JSON.parse(localStorage.getItem('wt_session')).finishedAt).toBeTruthy();
  });

  it('does not clear active data when saving fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await finish();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise')).sets[0].reps).toBe(8);
    expect(document.body.textContent).toContain('Your sets are still here');
    expect(JSON.parse(localStorage.getItem('wt_session')).finishedAt).toBeFalsy();
  });

  it.each(['wt_history', 'wt_session'])('does not report completion when %s fails', async (failedKey) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const original = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      if (key === failedKey) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    await finish();
    expect(JSON.parse(localStorage.getItem('wt_session')).finishedAt).toBeFalsy();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise')).sets[0].reps).toBe(8);
  });

  it('starting a new workout preserves the finished download', async () => {
    await finish();
    [...document.querySelectorAll('button')].find(btn => btn.textContent === 'Start New Workout').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(btn => btn.textContent === 'Start New').click();
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise'))).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem('wt_completedWorkouts')))).toHaveLength(3);
    expect(document.body.textContent).toContain('Download Workout');
  });
});
