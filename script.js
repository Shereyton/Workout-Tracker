// ---- storage guardrails (no HTML changes) ----
const WT_KEYS = {
  session: 'wt_session',
  current: 'wt_currentExercise',
  last: 'wt_lastWorkout',
  history: 'wt_history',
  custom: 'custom_exercises',
  theme: 'wt_theme',
  schema: 'wt_schema_version',
  ffQuery: 'wt_ff_query',
  ffFilter: 'wt_ff_filter',
  recent: 'wt_recent_exercises',
  prs: 'wt_prs',
  goals: 'wt_goals'
};

const WT_SCHEMA_VERSION = 2;

// ----- Data Health Utilities -----
function coercePositiveNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

// ... rest of your unchanged code ...

function hasLocalStorage() {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

// ---- Core helpers used by tests ----

function canLogSet(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  return Number.isFinite(w) && w >= 0 && Number.isFinite(r) && r > 0;
}

function canLogCardio(distance, duration, name) {
  const d = distance == null ? null : Number(distance);
  const dur = Number(duration);
  const special = name && /jump rope|plank/i.test(name);
  const hasDist = d != null && Number.isFinite(d) && d >= 0;
  if (!Number.isFinite(dur) || dur <= 0) return false;
  if (special) return true;
  return hasDist;
}

function normalizeSet(set = {}) {
  return {
    weight: coercePositiveNumber(set.weight),
    reps: Math.max(1, Math.floor(coercePositiveNumber(set.reps) || 1)),
    duration: coercePositiveNumber(set.duration),
    restActual: Number.isFinite(+set.restActual) ? +set.restActual : null,
    time: set.time || null,
    notes: set.notes || undefined,
    set: set.set || set.set === 0 ? set.set : undefined,
  };
}

function normalizePayload(exercises = []) {
  const norm = exercises.map(ex => ({
    name: ex.name,
    isCardio: !!ex.isCardio,
    isSuperset: !!ex.isSuperset,
    custom: !!ex.custom,
    category: ex.category,
    sets: (ex.sets || []).map(normalizeSet)
  }));
  let totalSets = 0;
  norm.forEach(ex => { totalSets += ex.sets.length; });
  return { exercises: norm, totalExercises: norm.length, totalSets, schema: WT_SCHEMA_VERSION };
}

function ffMatchesFilter(ex, filter) {
  switch ((filter || '').toLowerCase()) {
    case 'strength':
      return !ex.isCardio && !ex.isSuperset && !ex.custom;
    case 'cardio':
      return ex.isCardio || /plank|jump rope/i.test(ex.name || '');
    case 'custom':
      return !!ex.custom;
    default:
      return true;
  }
}

function getLastSetForExercise(name, currentExercise, session) {
  if (currentExercise && currentExercise.name === name && currentExercise.sets && currentExercise.sets.length) {
    return currentExercise.sets[currentExercise.sets.length - 1];
  }
  const exs = (session && session.exercises) || [];
  for (let i = exs.length - 1; i >= 0; i--) {
    const ex = exs[i];
    if (ex.name === name && ex.sets && ex.sets.length) {
      return ex.sets[ex.sets.length - 1];
    }
  }
  return null;
}

function computeNextDefaults(last) {
  if (!last) return { weight: '', reps: '' };
  if (last.reps >= 8) {
    return { weight: last.weight, reps: 8 };
  }
  const increased = Math.round((last.weight * 1.025 + 1e-8) / 5) * 5;
  return { weight: increased, reps: last.reps };
}

// simple localStorage wrapper with backup slots
const wtStorage = {
  getRaw(key) {
    if (!hasLocalStorage()) return null;
    return localStorage.getItem(key);
  },
  get(key, def) {
    const raw = this.getRaw(key);
    return raw ? safeParse(raw, def) : def;
  },
  set(key, val) {
    if (!hasLocalStorage()) return;
    const prev = localStorage.getItem(key);
    if (prev !== null) localStorage.setItem(`${key}.backup1`, prev);
    else localStorage.removeItem(`${key}.backup1`);
    localStorage.removeItem(`${key}.backup2`);
    localStorage.setItem(key, JSON.stringify(val));
  },
  clear(key) {
    if (!hasLocalStorage()) return;
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}.backup1`);
    localStorage.removeItem(`${key}.backup2`);
  }
};

function safeParse(str, def) {
  try { return JSON.parse(str); } catch { return def; }
}

function checkPrAndGoal(exName, weight) {
  const prs = wtStorage.get(WT_KEYS.prs, {});
  const goals = wtStorage.get(WT_KEYS.goals, {});
  let prUpdated = false;
  let goalMet = false;
  if (weight > (prs[exName] || 0)) {
    prs[exName] = weight;
    wtStorage.set(WT_KEYS.prs, prs);
    prUpdated = true;
    if (typeof showToast === 'function') showToast(`PR achieved for ${exName}!`);
  }
  if (goals[exName] && weight >= goals[exName]) {
    goalMet = true;
    if (typeof showToast === 'function') showToast(`Goal met for ${exName}!`);
  }
  return { prUpdated, goalMet };
}

// ... rest of your unchanged code ...

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== "undefined" && document.getElementById("today")) {
  (function(){
  // Guard all essential DOM elements before proceeding
  const requiredIds = [
    "interface", "weight", "reps", "logBtn", "exerciseSelect", "today",
    "exportBtn", "setsList", "summaryText", "nextExerciseBtn", "finishBtn",
    "resetBtn", "restBox", "restDisplay", "useTimer", "restSecsInput",
    "addExercise", "customExercise", "startSuperset", "supersetInputs",
    "standardInputs", "cardioInputs", "distance", "durationMin", "durationSec",
    "supersetBuilder", "supersetSelect1", "supersetSelect2", "beginSuperset",
    "exerciseSearch", "exerciseList", "exerciseName", "setCounter"
  ];
  let missingCritical = false;
  for (const id of requiredIds) {
    if (!document.getElementById(id)) {
      console.warn(`Missing required element #${id}. Workout UI initialization aborted.`);
      missingCritical = true;
    }
  }
  if (missingCritical) return;

  // ... assign all elements as before ...

  // Restore exercise selection and search functionality
  const exerciseSelect = document.getElementById("exerciseSelect");
  const exerciseSearch = document.getElementById("exerciseSearch");
  const exerciseList = document.getElementById("exerciseList");
  const interfaceBox = document.getElementById("interface");
  const exerciseNameEl = document.getElementById("exerciseName");

  if (exerciseSelect && exerciseSearch && exerciseList && interfaceBox && exerciseNameEl) {
    fetch("data/exercises.json")
      .then(r => r.json())
      .then(data => {
        data.forEach(ex => {
          const opt = document.createElement("option");
          opt.value = ex.name;
          opt.textContent = ex.name;
          exerciseSelect.appendChild(opt);

          const dlOpt = document.createElement("option");
          dlOpt.value = ex.name;
          exerciseList.appendChild(dlOpt);
        });
      })
      .catch(() => {});

    exerciseSelect.addEventListener("change", () => {
      const name = exerciseSelect.value;
      if (!name) return;
      exerciseNameEl.textContent = name;
      interfaceBox.classList.remove("hidden");
    });

    exerciseSearch.addEventListener("change", () => {
      const name = exerciseSearch.value;
      const option = Array.from(exerciseSelect.options).find(o => o.value === name);
      if (option) {
        exerciseSelect.value = name;
        exerciseSelect.dispatchEvent(new Event("change"));
      }
    });
  }

  // PATCH: Use hasLocalStorage() everywhere
  // PATCH: Defensive event handler attachment
  // Example:
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    // ... attach event listeners, etc.
  }

  // PATCH: Robust getCardioFlag
  function getCardioFlag(name) {
    const ex = findExerciseByName(name);
    return (
      (ex && ex.category && ex.category.toLowerCase() === "cardio") ||
      normalizeName(name) === normalizeName("Plank") ||
      normalizeName(name) === normalizeName("Jump Rope")
    );
  }

  // PATCH: Filter nulls in array spreads
  function getSupersetExercises() {
    const out = [];
    const seen = new Set();
    [...session.exercises, currentExercise].filter(Boolean).forEach((ex) => {
      if (ex && (ex.isSuperset || (ex.name && ex.name.includes(" + ")))) {
        if (!seen.has(ex.name)) {
          seen.add(ex.name);
          out.push({
            name: ex.name,
            category: "Superset",
            isSuperset: true,
            exercises: ex.exercises ? [...ex.exercises] : ex.name.split(" + "),
          });
        }
      }
    });
    return out;
  }

  // PATCH: CSV Escape Helper
  function csvEscape(s) {
    if (s == null) return "";
    const str = String(s);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // Use csvEscape for all CSV export fields
  // Example:
  // csv += `${csvEscape(sub.name)},${s.set},${sub.weight},${sub.reps},,,${s.time},${s.restPlanned ?? ""},${s.restActual ?? ""}\n`;

  // ...rest of your script.js code...
  })();
}

// PATCH: Always use hasLocalStorage() for storage checks
// PATCH: Defensive checks on all document.getElementById, addEventListener, etc.

// PATCH: Make sure module.exports is not truncated and exports all relevant functions for Node/test
if (typeof module !== "undefined") {
  module.exports = {
    canLogSet,
    canLogCardio,
    normalizeSet,
    normalizePayload,
    ffMatchesFilter,
    getLastSetForExercise,
    computeNextDefaults,
    wtStorage,
    checkPrAndGoal,
    WT_KEYS,
    hasLocalStorage
  };
}
