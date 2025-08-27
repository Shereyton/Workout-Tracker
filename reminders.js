(function (global) {
  const STORAGE_KEY = 'wt_reminder_schedule';

  function saveSchedule(schedule, storage = global.localStorage) {
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  }

  function loadSchedule(storage = global.localStorage) {
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function computeDelay(schedule, now = new Date()) {
    if (!schedule || !schedule.time || !Array.isArray(schedule.days) || schedule.days.length === 0) {
      return null;
    }
    const [h, m] = schedule.time.split(':').map(Number);
    let next = new Date(now);
    next.setHours(h, m, 0, 0);
    for (let i = 0; i < 7; i++) {
      if (schedule.days.includes(next.getDay()) && next > now) {
        return next - now;
      }
      next.setDate(next.getDate() + 1);
      next.setHours(h, m, 0, 0);
    }
    return next - now;
  }

  function scheduleNotification(schedule, callback, now = new Date()) {
    const delay = computeDelay(schedule, now);
    if (delay == null) return null;
    return setTimeout(() => {
      callback();
      scheduleNotification(schedule, callback, new Date(now.getTime() + delay));
    }, delay);
  }

  global.wtReminders = {
    saveSchedule,
    loadSchedule,
    computeDelay,
    scheduleNotification,
  };

  if (typeof module !== 'undefined') {
    module.exports = {
      saveSchedule,
      loadSchedule,
      computeDelay,
      scheduleNotification,
    };
  }
})(typeof window !== 'undefined' ? window : global);
