const { syncPush, syncPull, wtStorage, WT_KEYS } = require('../script');

describe('sync and auth', () => {
  beforeEach(() => {
    wtStorage.clear(WT_KEYS.history);
    wtStorage.clear(WT_KEYS.templates);
    wtStorage.clear(WT_KEYS.syncTime);
    wtStorage.clear(WT_KEYS.authToken);
    global.fetch = jest.fn();
  });

  test('syncPush uploads local data', async () => {
    wtStorage.set(WT_KEYS.history, { a: 1 });
    wtStorage.set(WT_KEYS.templates, { t: 1 });
    wtStorage.set(WT_KEYS.syncTime, 0);
    wtStorage.set(WT_KEYS.authToken, 'tok');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ updatedAt: 123 }) });
    const res = await syncPush();
    expect(res).toBe('pushed');
    expect(fetch).toHaveBeenCalledWith('/api/data', expect.objectContaining({ method: 'POST' }));
    expect(wtStorage.get(WT_KEYS.syncTime, 0)).toBe(123);
  });

  test('syncPull downloads server data', async () => {
    wtStorage.set(WT_KEYS.syncTime, 0);
    wtStorage.set(WT_KEYS.authToken, 'tok');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ wt_history: { x: 1 }, templates: {}, updatedAt: 200 }) });
    const res = await syncPull();
    expect(res).toBe('pulled');
    expect(wtStorage.get(WT_KEYS.history, {})).toEqual({ x: 1 });
    expect(wtStorage.get(WT_KEYS.syncTime, 0)).toBe(200);
  });

  test('syncPush handles conflict by keeping server data', async () => {
    wtStorage.set(WT_KEYS.history, { local: 1 });
    wtStorage.set(WT_KEYS.templates, {});
    wtStorage.set(WT_KEYS.syncTime, 100);
    wtStorage.set(WT_KEYS.authToken, 'tok');
    fetch.mockResolvedValueOnce({ status: 409, json: async () => ({ wt_history: { server: 1 }, templates: {}, updatedAt: 200 }) });
    const res = await syncPush();
    expect(res).toBe('conflict-server');
    expect(wtStorage.get(WT_KEYS.history, {})).toEqual({ server: 1 });
    expect(wtStorage.get(WT_KEYS.syncTime, 0)).toBe(200);
  });
});
