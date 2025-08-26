const { wtStorage } = require('../script');

describe('writeWithBackups', () => {
  const key = 'demo';
  beforeEach(() => {
    wtStorage.clear(key);
  });

  test('does not store literal null in backups', () => {
    wtStorage.set(key, { a: 1 });
    expect(wtStorage.getRaw(`${key}.backup1`)).toBe(null);
    wtStorage.set(key, { a: 2 });
    expect(wtStorage.getRaw(`${key}.backup1`)).toBe(JSON.stringify({ a: 1 }));
    expect(wtStorage.getRaw(`${key}.backup2`)).toBe(null);
  });
});
