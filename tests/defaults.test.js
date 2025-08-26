const { getLastSetForExercise, computeNextDefaults } = require('../script.js');

describe('getLastSetForExercise', () => {
  test('returns last set from current exercise first', () => {
    const cur = { name: 'Bench', isCardio: false, isSuperset: false, sets: [
      { weight: 100, reps: 8 },
      { weight: 105, reps: 5 }
    ]};
    const sess = { exercises: [{ name: 'Bench', isCardio: false, isSuperset: false, sets: [{ weight: 95, reps: 5 }] }] };
    expect(getLastSetForExercise('Bench', cur, sess)).toEqual({ weight: 105, reps: 5 });
  });

  test('scans session exercises from newest back', () => {
    const cur = { name: 'Squat', isCardio: false, isSuperset: false, sets: [] };
    const sess = {
      exercises: [
        { name: 'Bench', isCardio: false, isSuperset: false, sets: [{ weight: 90, reps: 5 }] },
        { name: 'Bench', isCardio: false, isSuperset: false, sets: [{ weight: 110, reps: 5 }] }
      ]
    };
    expect(getLastSetForExercise('Bench', cur, sess)).toEqual({ weight: 110, reps: 5 });
  });
});

describe('computeNextDefaults', () => {
  test('returns blanks when no last set', () => {
    expect(computeNextDefaults(null)).toEqual({ weight: '', reps: '' });
  });
  test('suggests same weight and reps 8 when reps >= 8', () => {
    expect(computeNextDefaults({ weight: 185, reps: 10 })).toEqual({ weight: 185, reps: 8 });
  });
  test('increases weight by 2.5% and rounds to 5 when reps < 8', () => {
    expect(computeNextDefaults({ weight: 100, reps: 5 })).toEqual({ weight: 105, reps: 5 });
  });
});
