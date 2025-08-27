const { saveTemplate, loadTemplate, wtStorage, WT_KEYS } = require('../script.js');

describe('templates', () => {
  beforeEach(() => {
    wtStorage.clear(WT_KEYS.templates);
  });

  test('serialize and deserialize template', () => {
    const exs = [
      { name: 'Bench Press', isCardio: false, isSuperset: false, sets: [] },
      { name: 'Squat', isCardio: false, isSuperset: false, sets: [] },
    ];
    saveTemplate('push', exs);
    const stored = wtStorage.get(WT_KEYS.templates, {});
    expect(Array.isArray(stored.push)).toBe(true);
    expect(stored.push[0].name).toBe('Bench Press');

    const loaded = loadTemplate('push');
    expect(loaded.length).toBe(2);
    expect(loaded[0]).toMatchObject(exs[0]);
  });

  test('loaded template populates exercises', () => {
    const exs = [
      { name: 'Deadlift', isCardio: false, isSuperset: false, sets: [] },
    ];
    saveTemplate('pull', exs);
    const session = { exercises: [], startedAt: null };
    session.exercises = loadTemplate('pull');
    expect(session.exercises.length).toBe(1);
    expect(session.exercises[0].name).toBe('Deadlift');
  });
});

