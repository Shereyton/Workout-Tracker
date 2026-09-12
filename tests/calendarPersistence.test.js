const fs = require('fs');
const path = require('path');

it('preserves pasted history and avoids success notices on save failure, then permits retry', () => {
  document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  localStorage.clear();
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  window.wtStorage = { set: jest.fn(() => false) };
  require('../calendar');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const paste = document.getElementById('pasteJson');
  const input = JSON.stringify({ '2026-09-11': ['Squat: 100 lbs × 5 reps'] });
  paste.value = input;
  document.getElementById('importFromPaste').click();
  expect(paste.value).toBe(input);
  expect(alert).not.toHaveBeenCalled();
  expect(window.wtStorage.set).toHaveBeenCalledWith('wt_history', expect.any(Object));
  window.wtStorage.set.mockImplementation(() => true);
  document.getElementById('importFromPaste').click();
  expect(paste.value).toBe('');
  expect(alert).toHaveBeenCalledWith(expect.stringContaining('History imported:'));
  alert.mockRestore();
  delete window.wtStorage;
});
