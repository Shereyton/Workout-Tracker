/* charts.js — read data from calendar (wt_history) + last workout; plot with Chart.js */

const SAMPLE_DATA = [
  { date: "2024-01-01", lift: "bench", sets: [{ weight: 185, reps: 5 }] },
  { date: "2024-01-05", lift: "bench", sets: [{ weight: 200, reps: 3 }] },
  { date: "2024-01-02", lift: "squat", sets: [{ weight: 225, reps: 5 }] },
  { date: "2024-01-12", lift: "squat", sets: [{ weight: 245, reps: 3 }] },
];

function e1rm(weight, reps) {
  if (!isFinite(weight) || !isFinite(reps) || weight <= 0 || reps <= 0)
    return 0;
  return Math.round(weight * (1 + reps / 30)); // Epley
}

function toDayISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDayISO(dayISO) {
  const [y, m, d] = dayISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* ---- LOAD DATA strictly from calendar/lastWorkout (with safe fallbacks) ---- */
async function loadWorkouts() {
  let raw = null;

  // 1) Primary: calendar history your app writes to
  try {
    const h = localStorage.getItem("wt_history");
    if (h) raw = JSON.parse(h);
  } catch {
    /* ignore */
  }

  // 2) Fallback: last finished (or exported) workout; convert to wt_history lines for "today"
  if (!raw) {
    try {
      const lw = localStorage.getItem("wt_lastWorkout");
      if (lw) {
        const arr = JSON.parse(lw) || [];
        const day = toDayISO(new Date());
        const lines = [];
        (arr || []).forEach((ex) => {
          if (ex.isSuperset) {
            (ex.sets || []).forEach((s) => {
              (s.exercises || []).forEach((sub) => {
                lines.push(
                  `${ex.name.includes(" + ") ? sub.name : ex.name}: ${sub.weight} lbs × ${sub.reps} reps`,
                );
              });
            });
          } else if (ex.isCardio) {
            // cardio not plotted on strength charts
          } else {
            (ex.sets || []).forEach((s) => {
              lines.push(`${ex.name}: ${s.weight} lbs × ${s.reps} reps`);
            });
          }
        });
        raw = { [day]: lines };
      }
    } catch {
      /* ignore */
    }
  }

  // 3) If still nothing, try data/workouts.json
  if (!raw) {
    try {
      const res = await fetch("data/workouts.json");
      if (res.ok) raw = await res.json();
    } catch {
      /* ignore */
    }
  }

  // Normalize whatever we found
  let workouts = normalizeWorkouts(raw);

  // 4) Final safety: if no workouts parsed, show sample data so the page is never blank
  if (!workouts.length) {
    const note = document.getElementById("sample-note");
    if (note) note.style.display = "block";
    workouts = normalizeWorkouts(SAMPLE_DATA);
  }

  return workouts;
}

/* ---- Parse either array-of-objects or the calendar’s date->lines object ---- */
function normalizeWorkouts(raw) {
  // Already structured array?
  if (Array.isArray(raw)) {
    return raw.map((r) => ({
      date: r.date ? toDayISO(r.date) : toDayISO(new Date()),
      lift: canonicalLift(r.lift || r.name),
      sets: Array.isArray(r.sets)
        ? r.sets.map((s) => ({ weight: +s.weight, reps: +s.reps }))
        : [],
    }));
  }

  // Calendar object: { 'YYYY-MM-DD': ['Bench Press: 185 lbs × 5 reps', ...] }
  const workouts = [];
  for (const [date, entries] of Object.entries(raw || {})) {
    const day = toDayISO(date);
    const liftsForDay = {};

    (entries || []).forEach((line) => {
      // Support both "Bench Press: 185 lbs × 5 reps"
      // and     "Bench Press: Set 2 - 185 lbs × 5 reps"
      const m = line.match(
        /^(.*?):\s*(?:Set\s*\d+\s*[-–:]?\s*)?(\d+(?:\.\d+)?)\s*lbs\s*[x×]\s*(\d+)\s*reps?/i,
      );
      if (!m) return;
      const [, name, w, r] = m;
      const lift = canonicalLift(name);
      if (!liftsForDay[lift]) liftsForDay[lift] = { date: day, lift, sets: [] };
      liftsForDay[lift].sets.push({ weight: +w, reps: +r });
    });

    workouts.push(...Object.values(liftsForDay));
  }
  return workouts;
}

function canonicalLift(name = "") {
  const n = String(name).toLowerCase();
  if (n.includes("flat bench")) return "bench";
  if (n.includes("incline")) return "incline";
  if (n.includes("back squat")) return "squat";
  if (n === "dl" || n === "dead") return "deadlift";
  if (n.includes("deadlift") || n.includes("dead lift")) return "deadlift";
  if (n.includes("bench")) return "bench";
  if (n.includes("squat")) return "squat";
  if (n.includes("dead")) return "deadlift";
  return n; // fallback
}

/* ---- Aggregate per day for the selected lift & metric ---- */
function computeDaily(workouts, lift, metric) {
  const target = canonicalLift(lift);
  const daily = {};

  workouts.forEach((w) => {
    if (canonicalLift(w.lift) !== target) return;
    const day = toDayISO(w.date);
    if (!daily[day]) daily[day] = { e1rmMax: 0, topSet: 0, volume: 0, sets: 0 };
    (w.sets || []).forEach((s) => {
      const e = e1rm(+s.weight, +s.reps);
      if (e > daily[day].e1rmMax) daily[day].e1rmMax = e;
      if (+s.weight > daily[day].topSet) daily[day].topSet = +s.weight;
      daily[day].volume += +s.weight * +s.reps;
      daily[day].sets++;
    });
  });

  const key =
    metric === "e1rm" ? "e1rmMax" : metric === "top" ? "topSet" : "volume";
  return Object.entries(daily)
    .filter(([, v]) => v.sets > 0)
    .map(([d, v]) => ({ x: fromDayISO(d), y: v[key] }))
    .sort((a, b) => a.x - b.x);
}

/* ---- Chart helpers ---- */
function makeLineChart(ctx, label, dataPoints) {
  return new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{ label, data: dataPoints, tension: 0.25, pointRadius: 3 }],
    },
    options: {
      parsing: false,
      interaction: { mode: "index", intersect: false },
      scales: { x: { type: "time", time: { unit: "day" } } },
    },
  });
}

/* ---- Boot ---- */
async function init() {
  let workouts = await loadWorkouts();

  const liftSelect = document.getElementById("liftSelect");
  const metricSelect = document.getElementById("metricSelect");
  const refreshBtn = document.getElementById("refreshBtn");
  const mainCanvas = document.getElementById("mainChart");
  const mainCtx = mainCanvas.getContext("2d");
  const emptyMsg = document.getElementById("empty-message");

  // Small charts (optional mini E1RM for Bench/Squat)
  const benchCtx = document.getElementById("benchChart")?.getContext("2d");
  const squatCtx = document.getElementById("squatChart")?.getContext("2d");
  let benchChart = benchCtx
    ? makeLineChart(
        benchCtx,
        "Bench - E1RM",
        computeDaily(workouts, "bench", "e1rm"),
      )
    : null;
  let squatChart = squatCtx
    ? makeLineChart(
        squatCtx,
        "Squat - E1RM",
        computeDaily(workouts, "squat", "e1rm"),
      )
    : null;

  // Persist selection
  liftSelect.value = localStorage.getItem("charts_lift") || liftSelect.value;
  metricSelect.value =
    localStorage.getItem("charts_metric") || metricSelect.value;
  function savePrefs() {
    localStorage.setItem("charts_lift", liftSelect.value);
    localStorage.setItem("charts_metric", metricSelect.value);
  }
  liftSelect.addEventListener("change", savePrefs);
  metricSelect.addEventListener("change", savePrefs);

  let mainChart = null;
  function render() {
    const data = computeDaily(workouts, liftSelect.value, metricSelect.value);
    if (mainChart) {
      mainChart.destroy();
      mainChart = null;
    }
    if (!data.length) {
      mainCanvas.style.display = "none";
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }
    mainCanvas.style.display = "block";
    if (emptyMsg) emptyMsg.style.display = "none";
    const liftLabel = liftSelect.options[liftSelect.selectedIndex].text;
    const metricLabel = metricSelect.options[metricSelect.selectedIndex].text;
    mainChart = makeLineChart(mainCtx, `${liftLabel} - ${metricLabel}`, data);
  }

  async function refresh() {
    workouts = await loadWorkouts();
    if (benchChart) {
      benchChart.destroy();
      benchChart = null;
    }
    if (squatChart) {
      squatChart.destroy();
      squatChart = null;
    }
    if (benchCtx)
      benchChart = makeLineChart(
        benchCtx,
        "Bench - E1RM",
        computeDaily(workouts, "bench", "e1rm"),
      );
    if (squatCtx)
      squatChart = makeLineChart(
        squatCtx,
        "Squat - E1RM",
        computeDaily(workouts, "squat", "e1rm"),
      );
    render();
  }
  refreshBtn.addEventListener("click", refresh);
  window.addEventListener("resize", render);
  window.addEventListener("orientationchange", render);

  render();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", init);
}

if (typeof module !== "undefined") {
  module.exports = { e1rm, toDayISO, normalizeWorkouts, computeDaily };
}
