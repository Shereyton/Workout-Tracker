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
  templates: 'wt_templates',
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

// ... rest of your unchanged code ...

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== "undefined" && document.getElementById("today")) {
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
    saveTemplate,
    loadTemplate,
    deleteTemplate,
    WT_KEYS,
    hasLocalStorage
  };
}
