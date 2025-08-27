self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'schedule') {
    scheduleReminder(data.schedule);
  }
});

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

function scheduleReminder(schedule, now = new Date()) {
  const delay = computeDelay(schedule, now);
  if (delay == null) return;
  setTimeout(() => {
    self.registration.showNotification('Workout Reminder', {
      body: 'Time to workout!'
    });
    scheduleReminder(schedule, new Date(now.getTime() + delay));
  }, delay);
}
