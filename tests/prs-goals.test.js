const { checkPrAndGoal, wtStorage, WT_KEYS } = require('../script');

describe('PR and Goals', () => {
  beforeEach(() => {
    wtStorage.clear(WT_KEYS.prs);
    wtStorage.clear(WT_KEYS.goals);
    global.showToast = jest.fn();
  });

  test('updates PR when surpassed', () => {
    wtStorage.set(WT_KEYS.prs, { 'Bench Press': 100 });
    const res = checkPrAndGoal('Bench Press', 110);
    expect(res.prUpdated).toBe(true);
    expect(wtStorage.get(WT_KEYS.prs, {})['Bench Press']).toBe(110);
    expect(global.showToast).toHaveBeenCalledWith(expect.stringContaining('PR'));
  });

  test('triggers goal notification when met', () => {
    wtStorage.set(WT_KEYS.goals, { Squat: 200 });
    const res = checkPrAndGoal('Squat', 205);
    expect(res.goalMet).toBe(true);
    expect(global.showToast).toHaveBeenCalledWith(expect.stringContaining('Goal'));
  });
});
