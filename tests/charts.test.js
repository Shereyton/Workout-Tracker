const { buildDatasets, renderVolumeChart } = require('../charts');

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

test('buildDatasets aggregates volume and sets per day', () => {
  const history = {
    '2024-01-01': ['Bench: 100 lbs × 5 reps', 'Squat: 200 lbs × 5 reps'],
    '2024-01-02': ['Bench: 100 lbs × 3 reps']
  };
  const ds = buildDatasets(history);
  expect(ds.labels).toEqual(['2024-01-01', '2024-01-02']);
  expect(ds.volumes).toEqual([100*5 + 200*5, 100*3]);
  expect(ds.sets).toEqual([2,1]);
});

test('renderVolumeChart draws on canvas using stored history', () => {
  const history = { '2024-01-01': ['Bench: 100 lbs × 5 reps'] };
  localStorage.setItem('wt_history', JSON.stringify(history));
  document.body.innerHTML = '<canvas id="volumeChart"></canvas>';
  const c = document.getElementById('volumeChart');
  c.getContext = () => ({ clearRect(){}, fillRect(){} });
  expect(() => renderVolumeChart()).not.toThrow();
  const canvas = document.getElementById('volumeChart');
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
});
