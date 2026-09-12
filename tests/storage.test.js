const { wtStorage } = require('../script');

describe('storage under quota pressure', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  function limitStorage(limit) {
    const original = Storage.prototype.setItem;
    return jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      const keys = Object.keys(this).filter(k => k !== key);
      const size = keys.reduce((n, k) => n + k.length + this.getItem(k).length, 0);
      if (size + key.length + String(value).length > limit) {
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    });
  }

  it('saves the newest set even when an optional backup will not fit', () => {
    localStorage.setItem('wt_currentExercise', JSON.stringify({ reps: 8 }));
    limitStorage(50);
    expect(wtStorage.set('wt_currentExercise', { reps: 10 })).toBe(true);
    expect(wtStorage.get('wt_currentExercise')).toEqual({ reps: 10 });
  });

  it('reclaims legacy archive backups and retries without deleting primary history', () => {
    const history = JSON.stringify({ day: ['Squat: 100 lbs × 5 reps'] });
    localStorage.setItem('wt_history', history);
    localStorage.setItem('wt_sessionArchive', '{}');
    localStorage.setItem('wt_sessionArchive.backup1', 'x'.repeat(400));
    localStorage.setItem('unrelated.backup1', 'keep');
    limitStorage(600);
    expect(wtStorage.set('wt_currentExercise', { notes: 'x'.repeat(150) })).toBe(true);
    expect(localStorage.getItem('wt_sessionArchive.backup1')).toBeNull();
    expect(localStorage.getItem('wt_history')).toBe(history);
    expect(localStorage.getItem('unrelated.backup1')).toBe('keep');
  });

  it('reports genuine exhaustion while preserving the previous value and recovery copies', () => {
    localStorage.setItem('wt_currentExercise', '{"reps":8}');
    localStorage.setItem('wt_session', 'corrupt');
    localStorage.setItem('wt_session.backup1', '{"exercises":[]}');
    localStorage.setItem('wt_history.backup1', '{"day":["keep"]}');
    limitStorage(200);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const failure = jest.fn();
    window.addEventListener('wt-storage-error', failure);
    expect(wtStorage.set('wt_currentExercise', { notes: 'x'.repeat(500) })).toBe(false);
    expect(wtStorage.get('wt_currentExercise')).toEqual({ reps: 8 });
    expect(localStorage.getItem('wt_session.backup1')).toBe('{"exercises":[]}');
    expect(localStorage.getItem('wt_history.backup1')).toBe('{"day":["keep"]}');
    expect(failure).toHaveBeenCalledTimes(1);
    window.removeEventListener('wt-storage-error', failure);
  });

  it('does not write or rotate backups for unchanged values', () => {
    localStorage.setItem('wt_session', '{"exercises":[]}');
    const write = jest.spyOn(Storage.prototype, 'setItem');
    expect(wtStorage.set('wt_session', { exercises: [] })).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it('bounds backups while keeping the last valid value recoverable', () => {
    wtStorage.set('wt_session', { exercises: [] });
    wtStorage.set('wt_session', { exercises: ['squat'] });
    expect(localStorage.getItem('wt_session.backup1')).toBe('{"exercises":[]}');
    expect(localStorage.getItem('wt_session.backup2')).toBeNull();
    localStorage.setItem('wt_session', 'broken');
    expect(wtStorage.restoreBackup('wt_session', x => Array.isArray(x.exercises))).toBe(true);
    expect(wtStorage.get('wt_session')).toEqual({ exercises: [] });
  });
});
