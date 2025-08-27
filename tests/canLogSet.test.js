/**
 * Session logging rules – golden expectations
 */
const { __api__ } = global;

describe("canLogSet / canLogCardio", () => {
  test("canLogSet requires exercise + reps; weight optional", () => {
    expect(__api__.canLogSet({exercise:'Bench', weight:225, reps:5})).toBe(true);
    expect(__api__.canLogSet({exercise:'Bench', weight:'', reps:5})).toBe(true);
    expect(__api__.canLogSet({exercise:'', weight:225, reps:5})).toBe(false);
    expect(__api__.canLogSet({exercise:'Bench', weight:225, reps:0})).toBe(false);
  });

  test("canLogCardio requires exercise + (distance or time)", () => {
    expect(__api__.canLogCardio({exercise:'Bike', distance:5, time:null})).toBe(true);
    expect(__api__.canLogCardio({exercise:'Bike', distance:null, time:20})).toBe(true);
    expect(__api__.canLogCardio({exercise:'Bike', distance:null, time:null})).toBe(false);
  });
});

describe("normalize & merge", () => {
  test("mergeIntoHistory dedupes", () => {
    const hist = {};
    __api__.mergeIntoHistory(hist, '2025-08-26', [
      "Bench Press — Set 1: 225 lbs × 5",
      "Bench Press — Set 1: 225 lbs × 5",
      "Squat — Set 1: 275 lbs × 3"
    ]);
    expect(hist['2025-08-26']).toEqual([
      "Bench Press — Set 1: 225 lbs × 5",
      "Squat — Set 1: 275 lbs × 3"
    ]);
  });
});
