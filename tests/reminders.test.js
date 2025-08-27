const { computeDelay, scheduleNotification } = require('../reminders');

describe('reminder scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('computeDelay finds future time on same day', () => {
    const now = new Date('2024-05-06T09:00:00'); // Monday
    const sched = { time: '10:00', days: [1, 3, 5] }; // Mon Wed Fri
    const delay = computeDelay(sched, now);
    expect(delay).toBe(60 * 60 * 1000);
  });

  test('computeDelay skips to next valid day', () => {
    const now = new Date('2024-05-06T09:00:00'); // Monday
    const sched = { time: '08:00', days: [1, 3, 5] };
    const delay = computeDelay(sched, now);
    expect(delay).toBe(47 * 60 * 60 * 1000);
  });

  test('scheduleNotification triggers callback at correct time', () => {
    const now = new Date('2024-05-06T09:00:00'); // Monday
    const sched = { time: '09:05', days: [1] };
    const cb = jest.fn();
    scheduleNotification(sched, cb, now);
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
