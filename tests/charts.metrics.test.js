/* keep toDayISO for the extra test at the bottom */
const { e1rm, computeDaily, normalizeWorkouts, toDayISO } = require('../charts.js');

describe('e1rm', () => {
  it('calculates Estimated 1RM', () => {
    expect(e1rm(255,2)).toBe(Math.round(255*(1+2/30)));
    expect(e1rm(100,10)).toBe(Math.round(100*(1+10/30)));
  });
  it('returns 0 for invalid input', () => {
    expect(e1rm(-1,5)).toBe(0);
    expect(e1rm(100,0)).toBe(0);
  });
});

describe('computeDaily', () => {
  const mock = [
    { date:'2024-01-01', lift:'bench', sets:[{weight:100,reps:5},{weight:110,reps:3}] },
    { date:'2024-01-02', lift:'bench', sets:[{weight:120,reps:2}] },
  ];
  it('aggregates volume by day', () => {
    const res = computeDaily(mock,'bench','volume');
    const day1 = res.find(p=>p.x.getTime()===new Date(2024,0,1).getTime());
    expect(res.length).toBe(2);
    expect(day1.y).toBe(100*5 + 110*3);
  });
});

describe('normalizeWorkouts', () => {
  it('parses calendar object with decimal weight', () => {
    const raw={'2024-01-01':['Bench Press: 135.5 lbs × 5 reps']};
    expect(normalizeWorkouts(raw)).toEqual([
      { date:'2024-01-01', lift:'bench', sets:[{weight:135.5,reps:5}] }
    ]);
  });
});
