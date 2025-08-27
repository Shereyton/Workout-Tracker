/**
 * Calendar helper tests – golden expectations
 */
const { __api__ } = global;

describe("calendar helpers", () => {
  test("parseDateLocal clamps invalid to today-like format", () => {
    const out = __api__.parseDateLocal("not-a-date");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("parseAiText ignores header lines, keeps workout lines", () => {
    const txt = `
      WORKOUT DATA - 2025-08-26
      Bench Press — Set 1: 225 lbs × 5
      Squat — Set 1: 275 lbs × 3
    `;
    const out = __api__.parseAiText(txt);
    expect(out).toEqual([
      "Bench Press — Set 1: 225 lbs × 5",
      "Squat — Set 1: 275 lbs × 3"
    ]);
  });

  test("parseCsv parses rows into lines", () => {
    const csv = `Exercise,Set,Weight,Reps
Bench Press,1,225,5
Bench Press,2,225,5`;
    const out = __api__.parseCsv(csv);
    expect(out).toEqual([
      "Bench Press — Set 1: 225 lbs × 5",
      "Bench Press — Set 2: 225 lbs × 5"
    ]);
  });

  test("snapshotToLines formats strength and cardio", () => {
    const snap = {
      items: [
        {type:'strength', exercise:'Bench Press', weight:225, reps:5},
        {type:'strength', exercise:'Bench Press', weight:225, reps:5},
        {type:'cardio', exercise:'Bike', distance:5, time:20}
      ]
    };
    const out = __api__.snapshotToLines(snap);
    expect(out).toEqual([
      "Bench Press — Set 1: 225 lbs × 5",
      "Bench Press — Set 2: 225 lbs × 5",
      "Bike: 5 mi • 20 min"
    ]);
  });
});
