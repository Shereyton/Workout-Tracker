const {
  e1rm,
  computeDaily,
  normalizeWorkouts,
  toDayISO,
} = require("../charts.js");

describe("e1rm", () => {
  test("calculates Estimated 1RM", () => {
    expect(e1rm(255, 2)).toBe(Math.round(255 * (1 + 2 / 30)));
    expect(e1rm(100, 10)).toBe(Math.round(100 * (1 + 10 / 30)));
  });
  test("returns 0 for invalid input", () => {
    expect(e1rm(-1, 5)).toBe(0);
    expect(e1rm(100, 0)).toBe(0);
  });
});

describe("computeDaily", () => {
  const mock = [
    { date: "2024-01-02", lift: "bench", sets: [{ weight: 100, reps: 5 }] },
    { date: "2024-01-01", lift: "bench", sets: [{ weight: 110, reps: 3 }] },
  ];
  test("aggregates volume by day and sorts dates", () => {
    const res = computeDaily(mock, "bench", "volume");
    expect(res.length).toBe(2);
    expect(res[0].x.getTime()).toBe(new Date(2024, 0, 1).getTime());
    expect(res[0].y).toBe(110 * 3);
    expect(res[1].x.getTime()).toBe(new Date(2024, 0, 2).getTime());
    expect(res[1].y).toBe(100 * 5);
  });
});

describe("normalizeWorkouts", () => {
  test("parses calendar object with decimal weights", () => {
    const raw = { "2024-01-01": ["Bench Press: 135.5 lbs × 5 reps"] };
    const res = normalizeWorkouts(raw);
    expect(res).toEqual([
      { date: "2024-01-01", lift: "bench", sets: [{ weight: 135.5, reps: 5 }] },
    ]);
  });
  test("handles x or × and optional set prefix", () => {
    const raw = {
      "2024-01-01": [
        "Bench Press: 135 lbs x 5 reps",
        "Bench Press: Set 2 - 135 lbs × 5 reps",
      ],
    };
    const res = normalizeWorkouts(raw);
    expect(res).toEqual([
      {
        date: "2024-01-01",
        lift: "bench",
        sets: [
          { weight: 135, reps: 5 },
          { weight: 135, reps: 5 },
        ],
      },
    ]);
  });
});

describe("toDayISO", () => {
  test("formats Date to YYYY-MM-DD", () => {
    expect(toDayISO(new Date(2024, 0, 1))).toBe("2024-01-01");
  });
  test("accepts string input", () => {
    expect(toDayISO("2024-1-5")).toBe("2024-01-05");
  });
});
