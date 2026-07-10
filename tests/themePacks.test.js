const { THEME_PACKS, getThemePack } = require('../script');

describe('theme packs', () => {
  it('ships all six visual atmospheres', () => {
    expect(Object.keys(THEME_PACKS)).toEqual([
      'aurora',
      'midnight',
      'inferno',
      'ice',
      'volt',
      'chrome',
    ]);
    expect(Object.values(THEME_PACKS).map((pack) => pack.label)).toEqual([
      'Aurora',
      'Midnight',
      'Inferno',
      'Ice',
      'Volt',
      'Chrome',
    ]);
  });

  it('falls back safely when a stored pack is invalid', () => {
    expect(getThemePack('not-a-real-theme')).toBe(THEME_PACKS.aurora);
  });
});
