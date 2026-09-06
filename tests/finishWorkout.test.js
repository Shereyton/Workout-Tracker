const fs = require('fs');
const path = require('path');

describe('finish workout persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {} }));
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    localStorage.setItem('wt_schemaVersion', '9');
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

  it('keeps sets visible and persisted, with a downloadable saved workout', async () => {
    await finish();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise')).sets[0].reps).toBe(8);
    expect(Object.values(JSON.parse(localStorage.getItem('wt_completedWorkouts')))[0].exercises[0].sets[0].weight).toBe(135);
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

  it('starting a new workout preserves the finished download', async () => {
    await finish();
    [...document.querySelectorAll('button')].find(btn => btn.textContent === 'Start New Workout').click();
    [...document.querySelectorAll('[role="dialog"] button')].find(btn => btn.textContent === 'Start New').click();
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem('wt_currentExercise'))).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem('wt_completedWorkouts')))).toHaveLength(1);
    expect(document.body.textContent).toContain('Download Workout');
  });
});
