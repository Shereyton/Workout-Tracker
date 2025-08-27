const { checkAndUpdatePR, setGoal, clearPRsGoals, wtStorage, WT_KEYS } = require('../script');

describe('PRs and Goals', () => {
  beforeEach(() => {
    clearPRsGoals();
  });

  test('updates PR when surpassed', () => {
    checkAndUpdatePR('Bench', 100, 5); // initial PR
    const res = checkAndUpdatePR('Bench', 120, 5);
    expect(res.prUpdated).toBe(true);
    const prs = wtStorage.get(WT_KEYS.prs, {});
    expect(prs.Bench.weight).toBe(120);
    expect(prs.Bench.reps).toBe(5);
  });

  test('triggers notification when goal met', () => {
    setGoal('Squat', 200);
    const msgs = [];
    global.showToast = (m) => msgs.push(m);
    const res = checkAndUpdatePR('Squat', 200, 5);
    expect(res.goalMet).toBe(true);
    expect(msgs.some((m) => /Goal met/.test(m))).toBe(true);
  });
});
