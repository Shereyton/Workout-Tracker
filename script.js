// ---- storage guardrails (no HTML changes) ----
const WT_KEYS = {
  session: 'wt_session',
  current: 'wt_currentExercise',
  last: 'wt_lastWorkout',
  history: 'wt_history',
  custom: 'wt_customExercises',
  theme: 'wt_theme',
  themePack: 'wt_themePack',
  schema: 'wt_schemaVersion',
  prefSessionTime: 'wt_pref_sessionTimeAlways',
  goals: 'wt_goals',
  constraints: 'wt_constraints',
  archive: 'wt_sessionArchive',
  dayType: 'wt_dayType',
  dayCompare: 'wt_dayCompareWindow',
  progressionGuard: 'wt_progressionGuard',
};

const THEME_PACKS = Object.freeze({
  aurora: Object.freeze({ id: 'aurora', label: 'Aurora', mode: 'light', lightColor: '#eef0fb', darkColor: '#0c1020' }),
  midnight: Object.freeze({ id: 'midnight', label: 'Midnight', mode: 'dark', lightColor: '#11162a', darkColor: '#070a14' }),
  inferno: Object.freeze({ id: 'inferno', label: 'Inferno', mode: 'dark', lightColor: '#2b1215', darkColor: '#12090b' }),
  ice: Object.freeze({ id: 'ice', label: 'Ice', mode: 'light', lightColor: '#e8f7ff', darkColor: '#071724' }),
  volt: Object.freeze({ id: 'volt', label: 'Volt', mode: 'dark', lightColor: '#152217', darkColor: '#071008' }),
  chrome: Object.freeze({ id: 'chrome', label: 'Chrome', mode: 'light', lightColor: '#edf0f5', darkColor: '#101318' }),
});

function getThemePack(value) {
  return THEME_PACKS[value] || THEME_PACKS.aurora;
}

const WT_SCHEMA_VERSION = 3;

// ----- Data Health Utilities -----
function coercePositiveNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function normalizeSet(s) {
  // supports strength set and cardio set
  const out = { ...s };
  if ('weight' in out) out.weight = coercePositiveNumber(out.weight);
  if ('reps' in out)
    out.reps = Math.max(1, Math.floor(coercePositiveNumber(out.reps)));
  // Normalize superset inner exercises if present
  if (Array.isArray(out.exercises)) {
    out.exercises = out.exercises.map((sub) => {
      const subOut = { ...sub };
      if ('weight' in subOut)
        subOut.weight = coercePositiveNumber(subOut.weight);
      if ('reps' in subOut)
        subOut.reps = Math.max(1, Math.floor(coercePositiveNumber(subOut.reps)));
      if ('name' in subOut) subOut.name = String(subOut.name || 'Unknown');
      return subOut;
    });
  }
  if ('distance' in out && out.distance !== null) {
    const d = Number(out.distance);
    out.distance = Number.isFinite(d) && d >= 0 ? d : null;
  }
  if ('duration' in out)
    out.duration = Math.max(0, Math.floor(coercePositiveNumber(out.duration)));
  if ('restPlanned' in out && out.restPlanned !== null) {
    const rp = Number(out.restPlanned);
    out.restPlanned = Number.isFinite(rp) && rp >= 0 ? rp : null;
  }
  if ('restActual' in out && out.restActual !== null) {
    const ra = Number(out.restActual);
    out.restActual = Number.isFinite(ra) && ra >= 0 ? ra : null;
  }
  return out;
}

function normalizeExercise(e) {
  const isSuperset = !!e.isSuperset;
  const isCardio = !!e.isCardio;
  const base = {
    name: String(e.name || 'Unknown'),
    isSuperset,
    isCardio,
    exercises: isSuperset
      ? Array.isArray(e.exercises)
        ? e.exercises.slice(0, 10)
        : []
      : undefined,
    sets: Array.isArray(e.sets) ? e.sets.map(normalizeSet) : [],
  };
  return base;
}

// input can be session-like arrays or exported payload
function normalizePayload(payload) {
  if (!payload)
    return {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      totalExercises: 0,
      totalSets: 0,
      exercises: [],
      schema: WT_SCHEMA_VERSION,
    };
  if (Array.isArray(payload)) {
    const exs = payload.map(normalizeExercise);
    const totalSets = exs.reduce((s, e) => s + e.sets.length, 0);
    return {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      totalExercises: exs.length,
      totalSets,
      exercises: exs,
      schema: WT_SCHEMA_VERSION,
    };
  }
  // v1/v2 exported object
  const exs = Array.isArray(payload.exercises)
    ? payload.exercises.map(normalizeExercise)
    : [];
  const totalSets = exs.reduce((s, e) => s + e.sets.length, 0);
  const date = String(payload.date || new Date().toISOString().split('T')[0]);
  const ts = String(payload.timestamp || new Date().toISOString());
  const normalized = {
    date,
    timestamp: ts,
    totalExercises: exs.length,
    totalSets,
    exercises: exs,
    schema: WT_SCHEMA_VERSION,
  };
  const goals = sanitizeGoals(payload.goals);
  if (goals.length) normalized.goals = goals.map((g) => g.text);
  const constraints = sanitizeConstraints(payload.constraints);
  if (hasConstraints(constraints)) normalized.constraints = constraints;
  const highlights = sanitizeExerciseHighlights(payload.exerciseHighlights);
  if (highlights.length) normalized.exerciseHighlights = highlights;
  return normalized;
}

const MAX_GOALS = 10;
const MAX_NOTES = 6;
const MAX_NOTE_LENGTH = 160;
const DEFAULT_CONSTRAINTS = {
  scheduleNotes: [],
  avoidAreas: [],
};

function trimString(input, maxLength = 200) {
  return String(input || '').trim().slice(0, maxLength);
}

function dedupeStrings(list, limit = 10, maxLength = 120) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const value = trimString(item, maxLength);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out.slice(0, limit);
}

function normalizeGoalEntry(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const text = trimString(item, 140);
    if (!text) return null;
    return { text, active: true };
  }
  if (typeof item === 'object') {
    const text = trimString(item.text || item.name || '', 140);
    if (!text) return null;
    return { text, active: !!item.active };
  }
  return null;
}

function sanitizeGoals(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Map();
  value.forEach((item) => {
    const norm = normalizeGoalEntry(item);
    if (!norm) return;
    const key = norm.text.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, norm);
    } else if (norm.active) {
      seen.get(key).active = true;
    }
  });
  return Array.from(seen.values()).slice(0, MAX_GOALS);
}

function sanitizeConstraints(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONSTRAINTS };
  const out = { ...DEFAULT_CONSTRAINTS };
  out.scheduleNotes = dedupeStrings(value.scheduleNotes, MAX_NOTES, MAX_NOTE_LENGTH);
  out.avoidAreas = dedupeStrings(value.avoidAreas, 8, 40);
  return out;
}

function hasConstraints(constraints) {
  if (!constraints) return false;
  return constraints.scheduleNotes.length > 0 || constraints.avoidAreas.length > 0;
}

function sanitizeConsistency(value) {
  if (!value || typeof value !== 'object') return null;
  const safeNumber = (n) => {
    const num = Number(n);
    return Number.isFinite(num) ? num : null;
  };
  const out = {};
  if (value.past7) {
    out.past7 = {
      daysTrained: safeNumber(value.past7.daysTrained) ?? 0,
      totalSets: safeNumber(value.past7.totalSets) ?? 0,
    };
  }
  if (value.past30) {
    out.past30 = {
      daysTrained: safeNumber(value.past30.daysTrained) ?? 0,
      totalSets: safeNumber(value.past30.totalSets) ?? 0,
    };
  }
  if (value.streakDays != null) {
    out.streakDays = safeNumber(value.streakDays) ?? 0;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeExerciseHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = trimString(item.name, 80);
      if (!name) return null;
      const parsed = {
        name,
        today: trimString(item.today, 120) || null,
        trend: trimString(item.trend, 160) || null,
        previous: Array.isArray(item.previous)
          ? item.previous.slice(0, 3).map((entry) => trimString(entry, 120)).filter(Boolean)
          : [],
        isPR: !!item.isPR,
      };
      return parsed;
    })
    .filter(Boolean);
}

function parseYMD(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

function formatYMD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr) {
  const parsed = parseYMD(dateStr);
  if (!parsed) return String(dateStr || '');
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatSecondsHuman(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatVolumeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Math.round(num).toLocaleString();
}

function formatTopSet(ts) {
  if (!ts || typeof ts.weight !== 'number' || typeof ts.reps !== 'number') return '-';
  return `${ts.weight}×${ts.reps}`;
}

function formatPercentChange(newVal, oldVal) {
  const a = Number(newVal);
  const b = Number(oldVal);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 'N/A';
  const pct = ((a - b) / b) * 100;
  const rounded = pct.toFixed(1);
  return `${pct >= 0 ? '+' : ''}${rounded}%`;
}

function formatDistanceMiles(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${num.toFixed(2)} mi`;
}

function roundToStep(value, step = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num / step) * step;
}

function describeConstraintsLines(constraints) {
  if (!constraints) return [];
  const lines = [];
  if (Array.isArray(constraints.scheduleNotes) && constraints.scheduleNotes.length) {
    constraints.scheduleNotes.forEach((note) => {
      const text = trimString(note, MAX_NOTE_LENGTH);
      if (text) lines.push(`Schedule: ${text}`);
    });
  }
  if (Array.isArray(constraints.avoidAreas) && constraints.avoidAreas.length) {
    lines.push(`Avoid Emphasis: ${constraints.avoidAreas.join(', ')}`);
  }
  return lines;
}

function computeSessionStats(payload) {
  const date = payload && payload.date ? String(payload.date) : null;
  const exercises = Array.isArray(payload && payload.exercises)
    ? payload.exercises
    : [];
  const map = new Map();
  let totalSets = 0;
  let totalVolume = 0;
  let totalCardioDuration = 0;

  const ensureEntry = (name, type) => {
    if (!map.has(name)) {
      map.set(name, {
        name,
        type,
        totalSets: 0,
        totalVolume: 0,
        totalDuration: 0,
        totalDistance: 0,
        topSet: null,
        bestDescription: null,
        longestDuration: 0,
      });
    }
    return map.get(name);
  };

  const recordStrengthSet = (name, weight, reps) => {
    const entry = ensureEntry(name, 'strength');
    entry.totalSets += 1;
    const vol = weight * reps;
    entry.totalVolume += vol;
    totalVolume += vol;
    totalSets += 1;
    if (
      !entry.topSet ||
      weight > entry.topSet.weight ||
      (weight === entry.topSet.weight && reps > entry.topSet.reps)
    ) {
      entry.topSet = { weight, reps };
      entry.bestDescription = `${weight} lbs × ${reps} reps`;
    }
  };

  const recordCardioSet = (name, duration, distance) => {
    const entry = ensureEntry(name, 'cardio');
    entry.totalSets += 1;
    entry.totalDuration += duration;
    totalCardioDuration += duration;
    totalSets += 1;
    if (Number.isFinite(distance) && distance > 0) {
      entry.totalDistance += distance;
    }
    if (!entry.bestDescription || duration > entry.longestDuration) {
      entry.longestDuration = duration;
      const distanceText = Number.isFinite(distance) && distance > 0
        ? `${distance} mi in ${formatSecondsHuman(duration)}`
        : `${formatSecondsHuman(duration)}`;
      entry.bestDescription = distanceText;
    }
  };

  exercises.forEach((exercise) => {
    if (exercise && exercise.isSuperset) {
      (exercise.sets || []).forEach((set) => {
        (set.exercises || []).forEach((inner) => {
          const name = trimString(inner.name || exercise.name || 'Exercise', 80);
          const weight = coercePositiveNumber(inner.weight);
          const reps = Math.max(1, Math.floor(coercePositiveNumber(inner.reps)));
          recordStrengthSet(name, weight, reps);
        });
      });
    } else if (exercise && exercise.isCardio) {
      (exercise.sets || []).forEach((set) => {
        const duration = Math.max(
          0,
          Math.floor(coercePositiveNumber(set.duration)),
        );
        let distance = null;
        if (set.distance !== null && set.distance !== undefined) {
          const d = Number(set.distance);
          if (Number.isFinite(d) && d >= 0) distance = d;
        }
        recordCardioSet(trimString(exercise.name || 'Cardio', 80), duration, distance);
      });
    } else if (exercise) {
      (exercise.sets || []).forEach((set) => {
        const weight = coercePositiveNumber(set.weight);
        const reps = Math.max(1, Math.floor(coercePositiveNumber(set.reps)));
        recordStrengthSet(trimString(exercise.name || 'Exercise', 80), weight, reps);
      });
    }
  });

  const stats = Array.from(map.values()).map((entry) => ({
    name: entry.name,
    type: entry.type,
    totalSets: entry.totalSets,
    totalVolume: entry.totalVolume,
    totalDuration: entry.totalDuration,
    totalDistance: entry.totalDistance,
    topSet: entry.topSet,
    bestDescription: entry.bestDescription,
  }));

  return {
    date,
    totalSets,
    totalVolume,
    totalCardioDuration,
    exercises: stats,
  };
}

function buildExerciseHighlightsForExport(currentStats, previousStats) {
  if (!currentStats || !Array.isArray(currentStats.exercises)) return [];
  const prevByName = new Map();
  previousStats.forEach((session) => {
    if (!session || !Array.isArray(session.exercises)) return;
    session.exercises.forEach((exercise) => {
      if (!exercise || !exercise.name) return;
      if (!prevByName.has(exercise.name)) prevByName.set(exercise.name, []);
      prevByName.get(exercise.name).push({
        date: session.date,
        stats: exercise,
      });
    });
  });

  const highlights = [];
  currentStats.exercises.forEach((exercise) => {
    const name = exercise.name;
    const prevEntries = prevByName.get(name) || [];
    const recent = prevEntries.slice(0, 3);
    const highlight = {
      name,
      today: null,
      trend: null,
      previous: [],
      isPR: false,
    };

    if (exercise.type === 'strength') {
      const description = exercise.bestDescription
        ? `${exercise.bestDescription}`
        : `${exercise.totalSets} sets completed`;
      highlight.today = `${description} (${exercise.totalSets} set${exercise.totalSets === 1 ? '' : 's'})`;

      const volumes = recent.map((entry) => entry.stats.totalVolume || 0);
      if (volumes.length) {
        const avgVolume =
          volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
        if (avgVolume > 0) {
          const delta = ((exercise.totalVolume - avgVolume) / avgVolume) * 100;
          highlight.trend = `${delta >= 0 ? '+' : ''}${delta.toFixed(
            1,
          )}% volume vs avg last ${volumes.length}`;
        }
        const maxPrevWeight = prevEntries.reduce((max, entry) => {
          const w =
            entry.stats.topSet && Number(entry.stats.topSet.weight)
              ? Number(entry.stats.topSet.weight)
              : 0;
          return Math.max(max, w);
        }, 0);
        const currentWeight =
          exercise.topSet && Number(exercise.topSet.weight)
            ? Number(exercise.topSet.weight)
            : 0;
        highlight.isPR = currentWeight > maxPrevWeight && maxPrevWeight > 0;
      } else {
        highlight.trend = "First recent strength session logged.";
      }
    } else if (exercise.type === 'cardio') {
      const distanceText = formatDistanceMiles(exercise.totalDistance);
      const durationText = formatSecondsHuman(exercise.totalDuration);
      const base = distanceText
        ? `${distanceText} in ${durationText}`
        : `${durationText} total`;
      highlight.today = `${base} (${exercise.totalSets} effort${exercise.totalSets === 1 ? '' : 's'})`;

      const durations = recent.map((entry) => entry.stats.totalDuration || 0);
      if (durations.length) {
        const avgDuration =
          durations.reduce((sum, value) => sum + value, 0) / durations.length;
        if (avgDuration > 0) {
          const delta =
            ((exercise.totalDuration - avgDuration) / avgDuration) * 100;
          highlight.trend = `${delta >= 0 ? '+' : ''}${delta.toFixed(
            1,
          )}% duration vs avg last ${durations.length}`;
        }
      } else {
        highlight.trend = "First recent cardio session logged.";
      }
    }

    highlight.previous = recent.map((entry) => {
      const stats = entry.stats;
      if (stats.type === 'strength') {
        const desc = stats.bestDescription
          ? stats.bestDescription
          : `${stats.totalSets} sets`;
        return `${formatShortDate(entry.date)}: ${desc}`;
      }
      const distanceText = formatDistanceMiles(stats.totalDistance);
      const durationText = formatSecondsHuman(stats.totalDuration);
      const base = distanceText
        ? `${distanceText} in ${durationText}`
        : durationText;
      return `${formatShortDate(entry.date)}: ${base}`;
    });

    highlights.push(highlight);
  });

  return highlights.slice(0, 6);
}

function computeConsistencyMetricsFromStats(allStats, referenceDate) {
  if (!Array.isArray(allStats) || !allStats.length) return null;
  const refDate =
    parseYMD(referenceDate) || parseYMD(allStats[0] && allStats[0].date);
  if (!refDate) return null;

  const totalsByDate = new Map();
  allStats.forEach((session) => {
    if (!session || !session.date) return;
    const key = session.date;
    const entry = totalsByDate.get(key) || { totalSets: 0 };
    entry.totalSets += session.totalSets || 0;
    totalsByDate.set(key, entry);
  });

  const gatherRange = (days) => {
    const trainedDates = new Set();
    let totalSets = 0;
    totalsByDate.forEach((value, key) => {
      const date = parseYMD(key);
      if (!date) return;
      const diff =
        (refDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (diff >= 0 && diff < days) {
        trainedDates.add(key);
        totalSets += value.totalSets;
      }
    });
    return { daysTrained: trainedDates.size, totalSets };
  };

  const past7 = gatherRange(7);
  const past30 = gatherRange(30);

  let streak = 0;
  const streakCursor = new Date(refDate.getTime());
  for (let i = 0; i < 120; i += 1) {
    const key = formatYMD(streakCursor);
    if (totalsByDate.has(key)) {
      streak += 1;
      streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return {
    past7,
    past30,
    streakDays: streak,
  };
}

function pruneArchive(map, limit = 90) {
  const entries = Object.entries(map || {}).filter(
    ([, value]) => value && typeof value === 'object',
  );
  entries.sort((a, b) => {
    if (a[0] === b[0]) return 0;
    return a[0] > b[0] ? -1 : 1;
  });
  if (entries.length <= limit) {
    return Object.fromEntries(entries);
  }
  return Object.fromEntries(entries.slice(0, limit));
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function appendUniqueHistoryLines(existing, incoming) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  incoming.forEach((line) => {
    if (!merged.includes(line)) merged.push(line);
  });
  return merged;
}

function csvCell(value) {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(values) {
  return values.map(csvCell).join(",");
}

function formatCardioHistoryLine(name, set, fallbackSetNumber = 1) {
  const setNumber = set && set.set ? set.set : fallbackSetNumber;
  const distanceValue = Number(set && set.distance);
  const distance =
    set && set.distance !== null && set.distance !== undefined && Number.isFinite(distanceValue)
      ? `${distanceValue} mi in `
      : '';
  const duration = formatSecondsHuman(set && set.duration);
  return `${name}: Set ${setNumber} - ${distance}${duration}`;
}

// Merge imported exercises into wt_history lines (for charts and history)
function mergeIntoHistory(payload) {
  const hist = wtStorage.get(WT_KEYS.history, {});
  const day = String(payload.date);
  const lines = [];

  for (const ex of payload.exercises) {
    if (ex.isSuperset) {
      for (const [setIdx, s] of ex.sets.entries()) {
        const setNumber = s.set || setIdx + 1;
        for (const sub of s.exercises || []) {
          lines.push(
            `${sub.name}: Set ${setNumber} - ${coercePositiveNumber(sub.weight)} lbs × ${Math.max(
              1,
              Math.floor(coercePositiveNumber(sub.reps)),
            )} reps`,
          );
        }
      }
    } else if (ex.isCardio) {
      for (const [setIdx, s] of ex.sets.entries()) {
        lines.push(formatCardioHistoryLine(ex.name, s, setIdx + 1));
      }
    } else {
      for (const [setIdx, s] of ex.sets.entries()) {
        const setNumber = s.set || setIdx + 1;
        lines.push(
          `${ex.name}: Set ${setNumber} - ${coercePositiveNumber(s.weight)} lbs × ${Math.max(
            1,
            Math.floor(coercePositiveNumber(s.reps)),
          )} reps`,
        );
      }
    }
  }
  const curr = Array.isArray(hist[day]) ? hist[day] : [];
  hist[day] = appendUniqueHistoryLines(curr, lines);
  wtStorage.set(WT_KEYS.history, hist);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('wt-history-updated'));
  }
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

function hasLocalStorage() {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

// in-memory fallback for tests / SSR
const memStore = new Map();

function lsGetRaw(k) {
  if (!hasLocalStorage()) return memStore.get(k) ?? null;
  return localStorage.getItem(k);
}
function lsSetRaw(k, v) {
  if (!hasLocalStorage()) { memStore.set(k, v); return; }
  localStorage.setItem(k, v);
}

function backupKey(k, n) { return `${k}.backup${n}`; } // .backup1..3

function writeWithBackups(key, valueStr) {
  // roll backups: 3 <- 2 <- 1 <- current
  const cur = lsGetRaw(key);
  if (cur !== null) {
    lsSetRaw(backupKey(key,3), lsGetRaw(backupKey(key,2)));
    lsSetRaw(backupKey(key,2), lsGetRaw(backupKey(key,1)));
    lsSetRaw(backupKey(key,1), cur);
  }
  // atomic-ish: write new value last
  lsSetRaw(key, valueStr);
}

const wtStorage = {
  get(key, fallback) {
    const raw = lsGetRaw(key);
    if (raw === null) return fallback;
    return safeParse(raw, fallback);
  },
  set(key, obj) {
    const str = JSON.stringify(obj);
    writeWithBackups(key, str);
  },
  getRaw(key) { return lsGetRaw(key); },
  restoreBackup(key) {
    // try newest → oldest
    for (let i=1;i<=3;i++) {
      const b = lsGetRaw(backupKey(key,i));
      if (b !== null) { lsSetRaw(key, b); return true; }
    }
    return false;
  },
  clear(key) {
    if (!hasLocalStorage()) { memStore.delete(key); return; }
    localStorage.removeItem(key);
    for (let i=1;i<=3;i++) localStorage.removeItem(backupKey(key,i));
  }
};

// schema versioning (simple bootstrap)
(function ensureSchema() {
  const v = Number(lsGetRaw(WT_KEYS.schema)) || 0;
  if (v < WT_SCHEMA_VERSION) {
    // future migrations go here; for now, just set the version
    lsSetRaw(WT_KEYS.schema, String(WT_SCHEMA_VERSION));
  }
})();

/* ------------------ STATE ------------------ */
let session = { exercises: [], startedAt: null };
let currentExercise = null;
let needsRecover = false;
let needsSaveAfterNormalize = false;
let goals = sanitizeGoals(wtStorage.get(WT_KEYS.goals, []));
let constraints = sanitizeConstraints(wtStorage.get(WT_KEYS.constraints, DEFAULT_CONSTRAINTS));
let archivedSessions = wtStorage.get(WT_KEYS.archive, {});
if (!archivedSessions || typeof archivedSessions !== 'object' || Array.isArray(archivedSessions)) {
  archivedSessions = {};
}
let dayType = wtStorage.get(WT_KEYS.dayType, '');
let dayCompare = wtStorage.get(WT_KEYS.dayCompare, 'none');
let progressionGuard = !!wtStorage.get(WT_KEYS.progressionGuard, false);
if (typeof localStorage !== "undefined") {
  const s = wtStorage.get(WT_KEYS.session, null);
  const c = wtStorage.get(WT_KEYS.current, null);
  if (!s || typeof s !== 'object' || !Array.isArray(s.exercises)) {
    needsRecover = true;
  }
  session = s && typeof s === 'object' ? s : { exercises: [], startedAt: null };
  currentExercise = c || null;

  // sanity shape
  if (!Array.isArray(session.exercises)) session.exercises = [];

  const normSession = session.exercises.map(normalizeExercise);
  if (JSON.stringify(normSession) !== JSON.stringify(session.exercises)) {
    session.exercises = normSession;
    needsSaveAfterNormalize = true;
  }
  if (currentExercise) {
    const normCurrent = normalizeExercise(currentExercise);
    if (JSON.stringify(normCurrent) !== JSON.stringify(currentExercise)) {
      currentExercise = normCurrent;
      needsSaveAfterNormalize = true;
    }
  }
}

let restTimer = null;
let restSecondsRemaining = 0;
let restStartMs = 0;
let restSetIndex = null;

function canLogSet(w, r) {
  return !Number.isNaN(w) && !Number.isNaN(r) && w >= 0 && w <= 9999 && r > 0 && r <= 999;
}

function canLogCardio(distance, duration, name) {
  const durationOk = Number.isFinite(duration) && duration > 0;
  const distanceMissing = distance === null || Number.isNaN(distance);
  const allowsNoDistance = name === "Jump Rope" || name === "Plank";
  const distanceOk = allowsNoDistance
    ? distanceMissing || distance >= 0
    : !distanceMissing && distance >= 0;
  return distanceOk && durationOk;
}

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== "undefined" && document.getElementById("today")) {
  const todayEl = document.getElementById("today");
  const darkToggle = document.getElementById("darkToggle");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");
  const exerciseSelect = document.getElementById("exerciseSelect");
  const interfaceBox = document.getElementById("interface");
  const exerciseNameEl = document.getElementById("exerciseName");
  const setCounterEl = document.getElementById("setCounter");
  const weightInput = document.getElementById("weight");
  const repsInput = document.getElementById("reps");
  const logBtn = document.getElementById("logBtn");
  const setsList = document.getElementById("setsList");
  const summaryText = document.getElementById("summaryText");
  const nextExerciseBtn = document.getElementById("nextExerciseBtn");
  const finishBtn = document.getElementById("finishBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");
  const restBox = document.getElementById("restBox");
  const restDisplay = document.getElementById("restDisplay");
  const useTimerEl = document.getElementById("useTimer");
  const restSecsInput = document.getElementById("restSecsInput");
  const addExerciseBtn = document.getElementById("addExercise");
  const customExerciseInput = document.getElementById("customExercise");
  const startSupersetBtn = document.getElementById("startSuperset");
  const supersetInputs = document.getElementById("supersetInputs");
  const standardInputs = document.getElementById("standardInputs");
  const cardioInputs = document.getElementById("cardioInputs");
  const distanceInput = document.getElementById("distance");
  const durationMinInput = document.getElementById("durationMin");
  const durationSecInput = document.getElementById("durationSec");
  const supersetBuilder = document.getElementById("supersetBuilder");
  const supersetSelect1 = document.getElementById("supersetSelect1");
  const supersetSelect2 = document.getElementById("supersetSelect2");
  const beginSupersetBtn = document.getElementById("beginSuperset");
  const exerciseSearch = document.getElementById("exerciseSearch");
  const exerciseList = document.getElementById("exerciseList");
  const muscleFilter = document.getElementById("muscleFilter");
  const goalInput = document.getElementById("goalInput");
  const addGoalBtn = document.getElementById("addGoalBtn");
  const goalsChips = document.getElementById("goalsChips");
  const goalsEmpty = document.getElementById("goalsEmpty");
  const constraintInput = document.getElementById("constraintInput");
  const addConstraintBtn = document.getElementById("addConstraintBtn");
  const constraintsList = document.getElementById("constraintsList");
  const constraintsEmpty = document.getElementById("constraintsEmpty");
  const avoidAreaButtons = Array.from(
    document.querySelectorAll('[data-constraint-group="avoidAreas"] .chip-option'),
  );
  const dayTypeButtons = Array.from(
    document.querySelectorAll('.daytype-option'),
  );
  const compareButtons = Array.from(
    document.querySelectorAll('.compare-option'),
  );
  const dayTypeCustomInput = document.getElementById('dayTypeCustomInput');
  const addDayTypeCustomBtn = document.getElementById('addDayTypeCustomBtn');
  const exportHint = document.getElementById('exportHint');
  const resetContextBtn = document.getElementById('resetContextBtn');
  const progressionGuardToggle = document.getElementById('progressionGuardToggle');
  const exerciseStage = document.getElementById('exerciseStage');
  const exerciseStageType = document.getElementById('exerciseStageType');
  const themePackButton = document.getElementById('themePackButton');
  const themePackLabel = document.getElementById('themePackLabel');
  const themePackSheet = document.getElementById('themePackSheet');
  const themePackBackdrop = document.getElementById('themePackBackdrop');
  const themePackClose = document.getElementById('themePackClose');
  const themePackOptions = Array.from(document.querySelectorAll('.theme-pack-option'));
  const themeTransition = document.getElementById('themeTransition');

  // --- Import UI ---
  function createConfirmModal(doc) {
    return (message, options = {}) => {
      const { title = 'Confirm', yesText = 'OK', noText = 'Cancel' } = options;
      return new Promise((resolve) => {
        const previousFocus = doc.activeElement;
        const modal = doc.createElement('div');
        modal.style.cssText = `
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;
          display: flex; align-items: center; justify-content: center; padding: 12px;
        `;
        const dialog = doc.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', title);
        dialog.style.cssText = `
          background: #fff; color: #000; padding: 16px 20px; border-radius: 8px; width: 100%;
          max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        `;
        dialog.innerHTML = `
          <h3 style="margin:0 0 10px 0; font-size:18px;">${title}</h3>
          <p style="margin:0 0 16px 0; line-height:1.4;">${message}</p>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="cmCancel" class="btn btn-secondary">${noText}</button>
            <button id="cmOk" class="btn">${yesText}</button>
          </div>
        `;
        modal.appendChild(dialog);
        doc.body.appendChild(modal);
        const cleanup = () => {
          doc.removeEventListener('keydown', handleKeydown);
          if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }
          if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
          }
        };
        const handleKeydown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cleanup();
            resolve(false);
          }
        };
        doc.addEventListener('keydown', handleKeydown);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            cleanup();
            resolve(false);
          }
        });
        dialog.querySelector('#cmCancel').addEventListener('click', () => {
          cleanup();
          resolve(false);
        });
        dialog.querySelector('#cmOk').addEventListener('click', () => {
          cleanup();
          resolve(true);
        });
        dialog.querySelector('#cmCancel').focus();
      });
    };
  }

  const confirmModal =
    typeof window !== 'undefined' && typeof window.wtConfirmModal === 'function'
      ? window.wtConfirmModal
      : createConfirmModal(document);

  if (typeof window !== 'undefined') {
    window.wtConfirmModal = confirmModal;
  }

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import JSON';
  importBtn.className = 'btn btn-secondary';
  exportBtn.insertAdjacentElement('afterend', importBtn);

  const pasteBtn = document.createElement('button');
  pasteBtn.textContent = 'Paste JSON';
  pasteBtn.className = 'btn btn-secondary';
  importBtn.insertAdjacentElement('afterend', pasteBtn);

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleImportText(ev.target.result);
    };
    reader.onerror = () => showToast('Import failed: invalid file');
    reader.readAsText(file);
    importInput.value = '';
  });

  /* ------------------ SESSION TIME PREF TOGGLE ------------------ */
  const toggleSessionPrefBtn = document.getElementById('toggleSessionPrefBtn');
  function updateSessionPrefButton() {
    const on = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
    toggleSessionPrefBtn.textContent = `Auto-include session time in export: ${on ? 'ON' : 'OFF'}`;
  }
  if (toggleSessionPrefBtn) {
    updateSessionPrefButton();
    toggleSessionPrefBtn.addEventListener('click', () => {
      const on = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
      wtStorage.set(WT_KEYS.prefSessionTime, !on);
      updateSessionPrefButton();
      showToast(`Always include session time ${!on ? 'enabled' : 'disabled'}.`);
    });
  }

  pasteBtn.addEventListener('click', openPasteImport);

  // Paste dialog overlay
  const pasteOverlay = document.createElement('div');
  pasteOverlay.id = 'wt-paste-overlay';
  pasteOverlay.innerHTML =
    '<div class="wt-paste-box"><textarea id="wt-paste-area"></textarea><div class="wt-paste-actions"><button id="wt-paste-import" class="btn btn-secondary">Import</button><button id="wt-paste-cancel" class="btn btn-secondary">Cancel</button></div></div>';
  document.body.appendChild(pasteOverlay);

  if (!document.getElementById('wt-import-style')) {
    const style = document.createElement('style');
    style.id = 'wt-import-style';
    style.textContent =
      '#wt-paste-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:1000;}#wt-paste-overlay.show{display:flex;}#wt-paste-overlay .wt-paste-box{background:#fff;color:#222;padding:16px;border-radius:8px;width:90%;max-width:500px;box-shadow:0 2px 8px rgba(0,0,0,.3);}#wt-paste-overlay textarea{width:100%;height:150px;}#wt-paste-overlay .wt-paste-actions{margin-top:8px;display:flex;gap:8px;justify-content:flex-end;}body.dark #wt-paste-overlay .wt-paste-box{background:#333;color:#f5f6fa;}';
    document.head.appendChild(style);
  }

  function openPasteImport() {
    pasteOverlay.classList.add('show');
    const ta = document.getElementById('wt-paste-area');
    ta.value = '';
    ta.focus();
  }
  if (typeof window !== 'undefined') window.openPasteImport = openPasteImport;

  function closePasteImport() {
    pasteOverlay.classList.remove('show');
  }

  pasteOverlay.addEventListener('click', (e) => {
    if (e.target === pasteOverlay) closePasteImport();
  });

  pasteOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePasteImport();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('wt-paste-import').click();
    }
  });

  document
    .getElementById('wt-paste-cancel')
    .addEventListener('click', closePasteImport);

  document.getElementById('wt-paste-import').addEventListener('click', () => {
    const text = document.getElementById('wt-paste-area').value;
    handleImportText(text);
    closePasteImport();
  });

  /* ------------------ GOALS, RECOVERY, CONSTRAINTS ------------------ */
  function persistGoals() {
    goals = sanitizeGoals(goals);
    wtStorage.set(WT_KEYS.goals, goals);
    renderGoals();
    updateExportHint();
  }

  function renderGoals() {
    if (!goalsChips || !goalsEmpty) return;
    goalsChips.innerHTML = "";
    goals = sanitizeGoals(goals);
    const activeCount = goals.filter((g) => g.active).length;
    goalsEmpty.classList.toggle("hidden", goals.length > 0);
    goals.forEach((goal, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip goal-chip";
      if (goal.active) chip.classList.add("active");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "chip-goal-toggle";
      toggle.dataset.index = String(idx);
      toggle.textContent = goal.text;
      toggle.setAttribute("aria-pressed", goal.active ? "true" : "false");
      chip.appendChild(toggle);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.dataset.index = String(idx);
      remove.setAttribute("aria-label", `Remove goal ${goal.text}`);
      remove.textContent = "×";
      chip.appendChild(remove);

      goalsChips.appendChild(chip);
    });

    bindChipKeyboard(Array.from(goalsChips.querySelectorAll('.chip-goal-toggle')));
  }

  function handleAddGoal() {
    if (!goalInput) return;
    const value = trimString(goalInput.value, 140);
    if (!value) return;
    goals.push({ text: value, active: true });
    persistGoals();
    goalInput.value = "";
    updateGoalBtnState();
  }

  function updateGoalBtnState() {
    if (!addGoalBtn || !goalInput) return;
    addGoalBtn.disabled = !goalInput.value.trim();
  }

  if (goalsChips) {
    goalsChips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove");
      if (btn) {
        const idx = Number(btn.dataset.index);
        if (Number.isInteger(idx)) {
          goals.splice(idx, 1);
          persistGoals();
          updateGoalBtnState();
        }
        return;
      }
      const toggle = e.target.closest('.chip-goal-toggle');
      if (toggle) {
        const idx = Number(toggle.dataset.index);
        if (Number.isInteger(idx) && goals[idx]) {
          goals[idx].active = !goals[idx].active;
          persistGoals();
          updateGoalBtnState();
        }
      }
    });
    renderGoals();
  }
  if (goalInput && addGoalBtn) {
    goalInput.addEventListener("input", updateGoalBtnState);
    goalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddGoal();
      }
    });
    addGoalBtn.addEventListener("click", handleAddGoal);
    updateGoalBtnState();
  }

  function persistConstraints() {
    constraints = sanitizeConstraints(constraints);
    wtStorage.set(WT_KEYS.constraints, constraints);
    renderConstraintsList();
    renderAvoidAreas();
  }

  function renderConstraintsList() {
    if (!constraintsList || !constraintsEmpty) return;
    constraintsList.innerHTML = "";
    const notes = Array.isArray(constraints.scheduleNotes)
      ? constraints.scheduleNotes
      : [];
    const hasAvoid = Array.isArray(constraints.avoidAreas) && constraints.avoidAreas.length > 0;
    constraintsEmpty.classList.toggle("hidden", notes.length > 0 || hasAvoid);
    notes.forEach((note, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      const label = document.createElement("span");
      label.textContent = note;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.dataset.index = String(idx);
      remove.setAttribute("aria-label", `Remove note ${note}`);
      remove.textContent = "×";
      chip.appendChild(label);
      chip.appendChild(remove);
      constraintsList.appendChild(chip);
    });
  }

  function handleAddConstraint() {
    if (!constraintInput) return;
    const value = trimString(constraintInput.value, MAX_NOTE_LENGTH);
    if (!value) return;
    constraints.scheduleNotes = constraints.scheduleNotes || [];
    constraints.scheduleNotes.push(value);
    persistConstraints();
    constraintInput.value = "";
    updateConstraintBtnState();
  }

  function updateConstraintBtnState() {
    if (!addConstraintBtn || !constraintInput) return;
    addConstraintBtn.disabled = !constraintInput.value.trim();
  }

  if (constraintsList) {
    constraintsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove");
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (Number.isInteger(idx)) {
        constraints.scheduleNotes.splice(idx, 1);
        persistConstraints();
        updateConstraintBtnState();
      }
    });
    renderConstraintsList();
  }

  if (constraintInput && addConstraintBtn) {
    constraintInput.addEventListener("input", updateConstraintBtnState);
    constraintInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddConstraint();
      }
    });
    addConstraintBtn.addEventListener("click", handleAddConstraint);
    updateConstraintBtnState();
  }

  function renderAvoidAreas() {
    if (!avoidAreaButtons.length) return;
    const active = new Set(
      (constraints.avoidAreas || []).map((area) => area.toLowerCase()),
    );
    avoidAreaButtons.forEach((btn) => {
      const value = trimString(btn.dataset.value, 40);
      if (!value) return;
      const isActive = active.has(value.toLowerCase());
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    constraintsEmpty?.classList.toggle(
      "hidden",
      (constraints.scheduleNotes && constraints.scheduleNotes.length > 0) ||
        (constraints.avoidAreas && constraints.avoidAreas.length > 0),
    );
  }

  if (avoidAreaButtons.length) {
    avoidAreaButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = trimString(btn.dataset.value, 40);
        if (!value) return;
        const list = constraints.avoidAreas || [];
        const idx = list.findIndex(
          (entry) => entry.toLowerCase() === value.toLowerCase(),
        );
        if (idx >= 0) {
          list.splice(idx, 1);
        } else {
          list.push(value);
        }
        constraints.avoidAreas = list;
        persistConstraints();
      });
    });
    renderAvoidAreas();
  }


  /* ------------------ DAY TYPE ------------------ */
  function renderDayType() {
    if (dayTypeButtons.length) {
      dayTypeButtons.forEach((btn) => {
        const v = String(btn.dataset.value || '');
        const active = v.toLowerCase() === String(dayType || '').toLowerCase();
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    if (compareButtons.length) {
      compareButtons.forEach((btn) => {
        const v = String(btn.dataset.value || '');
        const active = v === String(dayCompare || '3');
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function persistDayType() {
    wtStorage.set(WT_KEYS.dayType, dayType);
    // Sync to calendar titles for today
    try {
      const TITLE_KEY = 'wt_history_titles';
      const raw = localStorage.getItem(TITLE_KEY);
      const titles = raw ? JSON.parse(raw) : {};
      const today = getLocalDateString();
      if (dayType) titles[today] = String(dayType);
      else delete titles[today];
      localStorage.setItem(TITLE_KEY, JSON.stringify(titles));
      window.dispatchEvent(new Event('wt-history-updated'));
    } catch {}
  }

  if (dayTypeButtons.length) {
    dayTypeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = String(btn.dataset.value || '').trim();
        dayType = dayType && dayType.toLowerCase() === v.toLowerCase() ? '' : v;
        persistDayType();
        renderDayType();
        updateExportHint();
      });
    });
  }
  if (compareButtons.length) {
    compareButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        dayCompare = String(btn.dataset.value || '3');
        wtStorage.set(WT_KEYS.dayCompare, dayCompare);
        renderDayType();
        updateExportHint();
      });
    });
  }
  renderDayType();

  function updateExportHint() {
    if (!exportHint) return;
    const day = dayType ? `Day: ${dayType}` : 'Day: —';
    let win = 'Compare: —';
    if (dayCompare === 'none') win = 'Compare: None';
    else if (dayCompare === '3') win = 'Compare: Last 3';
    else if (dayCompare === '7') win = 'Compare: Last 7';
    else if (dayCompare === 'all') win = 'Compare: All';
    const goalCount = goals.filter((g) => g.active).length;
    const goalText = goalCount ? `Goals: ${goalCount}` : 'Goals: None';
    const progText = progressionGuard ? 'Progression Guard: ON' : 'Progression Guard: OFF';
    exportHint.textContent = `${day} • ${win} • ${goalText} • ${progText}`;
  }
  updateExportHint();

  if (progressionGuardToggle) {
    progressionGuardToggle.checked = progressionGuard;
    progressionGuardToggle.addEventListener('change', () => {
      progressionGuard = progressionGuardToggle.checked;
      wtStorage.set(WT_KEYS.progressionGuard, progressionGuard);
      updateExportHint();
    });
  }

  if (addDayTypeCustomBtn && dayTypeCustomInput) {
    const updateBtn = () => {
      addDayTypeCustomBtn.disabled = !dayTypeCustomInput.value.trim();
    };
    dayTypeCustomInput.addEventListener('input', updateBtn);
    dayTypeCustomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDayTypeCustomBtn.click();
      }
    });
    addDayTypeCustomBtn.addEventListener('click', () => {
      const v = trimString(dayTypeCustomInput.value, 40);
      if (!v) return;
      dayType = v;
      persistDayType();
      renderDayType();
      updateExportHint();
      dayTypeCustomInput.value = '';
      updateBtn();
    });
    updateBtn();
  }

  if (resetContextBtn) {
    resetContextBtn.addEventListener('click', async () => {
      const ok = await confirmModal('Reset Goals, Constraints, Day Type, Compare, and Progression Guard?', { yesText: 'Reset', noText: 'Cancel', title: 'Reset Context' });
      if (!ok) return;
      goals = [];
      constraints = { ...DEFAULT_CONSTRAINTS };
      dayType = '';
      dayCompare = 'none';
      progressionGuard = false;
      wtStorage.set(WT_KEYS.goals, goals);
      wtStorage.set(WT_KEYS.constraints, constraints);
      wtStorage.set(WT_KEYS.dayType, dayType);
      wtStorage.set(WT_KEYS.dayCompare, dayCompare);
      wtStorage.set(WT_KEYS.progressionGuard, progressionGuard);
      renderGoals();
      renderConstraintsList();
      renderAvoidAreas();
      renderDayType();
      updateExportHint();
      showToast('Context reset.');
    });
  }

  // Accessibility: Space/Enter toggles for chip buttons
  function bindChipKeyboard(group) {
    group.forEach((btn) => {
      btn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }
  bindChipKeyboard(avoidAreaButtons);
  bindChipKeyboard(dayTypeButtons);
  bindChipKeyboard(compareButtons);

  // Screen reader live region
  const srStatus = document.createElement("div");
  srStatus.setAttribute("aria-live", "polite");
  srStatus.setAttribute("aria-atomic", "true");
  srStatus.style.position = "absolute";
  srStatus.style.width = "1px";
  srStatus.style.height = "1px";
  srStatus.style.overflow = "hidden";
  srStatus.style.clip = "rect(1px, 1px, 1px, 1px)";
  srStatus.style.whiteSpace = "nowrap";
  document.body.appendChild(srStatus);
  function announce(msg) {
    srStatus.textContent = msg;
  }

  // --- Toast / Snackbar Utility ---
  let toastRoot = null;
  let toastTimer = null;
  let toastRestoreFocus = null;
  let toastLiveRegion = null;

  function ensureToastElements() {
    if (!toastRoot) {
      toastRoot = document.getElementById("wt-toast-root");
      if (!toastRoot) {
        toastRoot = document.createElement("div");
        toastRoot.id = "wt-toast-root";
        toastRoot.setAttribute("role", "status");
        document.body.appendChild(toastRoot);
      }
    }
    if (!document.getElementById("wt-toast-style")) {
      const style = document.createElement("style");
      style.id = "wt-toast-style";
      style.textContent = `#wt-toast-root{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;color:#222;padding:10px 16px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);display:none;align-items:center;gap:12px;z-index:1000;font-size:15px;}#wt-toast-root.show{display:flex;}#wt-toast-root button{background:none;border:none;color:#007bff;font-weight:600;cursor:pointer;}body.dark #wt-toast-root{background:#333;color:#f5f6fa;}body.dark #wt-toast-root button{color:#8ab4ff;}`;
      document.head.appendChild(style);
    }
  }

  function showToast(message, { actionLabel, onAction, duration = 10000 } = {}) {
    ensureToastElements();
    toastRoot.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    toastRoot.appendChild(msgSpan);
    if (actionLabel) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel;
      btn.addEventListener("click", () => {
        if (onAction) onAction();
        hideToast();
      });
      toastRoot.appendChild(btn);
    }
    toastRoot.classList.add("show");
    toastRestoreFocus = document.activeElement;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);

    if (typeof announce === "function") {
      announce(message);
    } else {
      if (!toastLiveRegion) {
        toastLiveRegion = document.createElement("div");
        toastLiveRegion.setAttribute("aria-live", "polite");
        toastLiveRegion.setAttribute("aria-atomic", "true");
        toastLiveRegion.style.position = "absolute";
        toastLiveRegion.style.width = "1px";
        toastLiveRegion.style.height = "1px";
        toastLiveRegion.style.overflow = "hidden";
        toastLiveRegion.style.clip = "rect(1px,1px,1px,1px)";
        document.body.appendChild(toastLiveRegion);
      }
      toastLiveRegion.textContent = message;
    }
  }

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastRoot) {
      toastRoot.classList.remove("show");
      toastRoot.innerHTML = "";
    }
    const refocus = toastRestoreFocus || (logBtn && !logBtn.disabled ? logBtn : null);
    toastRestoreFocus = null;
    if (refocus && typeof refocus.focus === "function") {
      try { refocus.focus(); } catch {}
    }
  }

  // --- Undo Stack ---
  let lastAction = null; // {type,payload,timestamp}

  function pushUndo(action) {
    lastAction = { ...action, timestamp: Date.now() };
  }

  async function performUndo() {
    if (!lastAction) return;
    if (Date.now() - lastAction.timestamp > 12000) {
      lastAction = null;
      showToast("Undo expired");
      return;
    }
    const { type, payload } = lastAction;
    lastAction = null;
    hideToast();
    switch (type) {
      case "deleteSet": {
        const { exerciseName, exerciseIndex, removedSet, removedIndex } = payload;
        let target = null;
        if (exerciseIndex !== null && exerciseIndex !== undefined) {
          target = session.exercises[exerciseIndex];
        } else if (currentExercise && currentExercise.name === exerciseName) {
          target = currentExercise;
        } else {
          target = session.exercises.find((e) => e.name === exerciseName) || null;
        }
        if (target) {
          target.sets.splice(removedIndex, 0, removedSet);
          if (target === currentExercise) {
            renumberSets();
            rebuildSetsList();
            updateSetCounter();
          } else {
            target.sets.forEach((s, i) => (s.set = i + 1));
          }
          updateSummary();
          updateSetsToday();
          saveState();
        }
        break;
      }
      case "finish":
      case "reset":
      case "import": {
        session = payload.prevSession;
        currentExercise = payload.prevCurrent;
        if (session.startedAt) startSessionTimer(); else stopSessionTimer();
        if (currentExercise) {
          showInterface();
          rebuildSetsList();
          updateSetCounter();
        } else {
          interfaceBox.classList.add("hidden");
          setsList.innerHTML = "";
        }
        updateSummary();
        updateSetsToday();
        updateLogButtonState();
        saveState();
        break;
      }
    }
  }

  function handleImportText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast('Import failed: invalid JSON');
      return;
    }
    const normalized = normalizePayload(parsed);
    if (normalized.totalExercises === 0) {
      showToast('Nothing to import');
      return;
    }
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({ type: 'import', payload: { prevSession, prevCurrent } });
    stopRest();
    restSetIndex = null;
    restSecondsRemaining = 0;
    restStartMs = 0;
    restBox.classList.add('hidden');
    restDisplay.textContent = '00:00';
    stopSessionTimer();
    session = { exercises: normalized.exercises, startedAt: null };
    currentExercise = null;
    wtStorage.set(WT_KEYS.last, normalized.exercises);
    mergeIntoHistory(normalized);
    interfaceBox.classList.add('hidden');
    document.body.classList.remove('workout-active', 'resting');
    setsList.innerHTML = '';
    updateSummary();
    updateSetsToday();
    updateLogButtonState();
    saveState();
    showToast('Imported workout', { actionLabel: 'Undo', onAction: performUndo });
    announce('Imported workout');
  }

  // Button aria-labels
  logBtn.setAttribute("aria-label", "Log set");
  nextExerciseBtn.setAttribute(
    "aria-label",
    "Finish exercise and choose next",
  );
  finishBtn.setAttribute("aria-label", "Finish workout");
  resetBtn.setAttribute("aria-label", "Reset workout");

  const sessionTimerEl = document.createElement("span");
  sessionTimerEl.className = "header-metric";
  sessionTimerEl.style.display = "none";
  const setsTodayEl = document.createElement("span");
  setsTodayEl.className = "header-metric";
  const sessionMetricsEl = document.getElementById("sessionMetrics");
  const sessionPulseEl = document.getElementById("sessionPulse");
  const heroSetCountEl = document.getElementById("heroSetCount");
  if (sessionMetricsEl) {
    sessionMetricsEl.append(sessionTimerEl, setsTodayEl);
  } else {
    todayEl.after(sessionTimerEl, setsTodayEl);
  }

  let sessionTimerInterval = null;

  function formatHMS(totalSeconds) {
    const h = Math.min(99, Math.floor(totalSeconds / 3600));
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startSessionTimer() {
    if (!session.startedAt) return;
    const startMs = new Date(session.startedAt).getTime();
    const tick = () => {
      const secs = Math.floor((Date.now() - startMs) / 1000);
      sessionTimerEl.textContent = `Session: ${formatHMS(secs)}`;
    };
    tick();
    sessionTimerEl.style.display = "inline-flex";
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(tick, 1000);
  }

  function stopSessionTimer() {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
    sessionTimerEl.style.display = "none";
    sessionTimerEl.textContent = "";
  }

  function computeTotalSets() {
    let total = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    if (currentExercise && currentExercise.sets) {
      total += currentExercise.sets.length;
    }
    return total;
  }

  function updateSetsToday() {
    const total = computeTotalSets();
    setsTodayEl.textContent = `${total} set${total === 1 ? '' : 's'} today`;
    if (heroSetCountEl) heroSetCountEl.textContent = String(total);
    if (sessionPulseEl) {
      const degrees = Math.min(total / 12, 1) * 360;
      sessionPulseEl.style.setProperty('--set-progress', `${degrees}deg`);
      sessionPulseEl.classList.toggle('is-active', total > 0);
      sessionPulseEl.setAttribute(
        'aria-label',
        `${total} set${total === 1 ? '' : 's'} completed this session`,
      );
    }
  }

  let allExercises = [];

  function tryRecoverState() {
    const ok = wtStorage.restoreBackup(WT_KEYS.session);
    const ok2 = wtStorage.restoreBackup(WT_KEYS.current);
    if (ok || ok2) {
      const s = wtStorage.get(WT_KEYS.session, {exercises:[], startedAt:null});
      const c = wtStorage.get(WT_KEYS.current, null);
      session = s; currentExercise = c;
      // Functions will be called after recovery is complete
    }
  }

  if (needsRecover) {
    // Delay recovery until functions are defined
    setTimeout(() => {
      tryRecoverState();
      if (currentExercise) {
        rebuildSetsList();
        updateSetCounter();
        updateSummary();
      }
    }, 0);
  }

  function updateLogButtonState() {
    if (!currentExercise) {
      logBtn.disabled = true;
      return;
    }

    if (currentExercise.isSuperset) {
      const ok = currentExercise.exercises.every((_, i) => {
        const w = parseFloat(document.getElementById(`weight${i}`).value);
        const r = parseInt(document.getElementById(`reps${i}`).value, 10);
        return canLogSet(w, r);
      });
      logBtn.disabled = !ok;
      return;
    }

    if (currentExercise.isCardio) {
      const d =
        distanceInput.classList.contains("hidden") || distanceInput.value === ""
          ? null
          : parseFloat(distanceInput.value);
      const m = parseInt(durationMinInput.value, 10) || 0;
      const s = parseInt(durationSecInput.value, 10) || 0;
      const t = m * 60 + s;
      logBtn.disabled = !canLogCardio(d, t, currentExercise.name);
      return;
    }

    const w = parseFloat(weightInput.value);
    const r = parseInt(repsInput.value, 10);
    logBtn.disabled = !canLogSet(w, r);
  }

  function getPlannedRestSeconds() {
    if (!useTimerEl.checked) return null;
    const parsed = Number.parseInt(restSecsInput.value, 10);
    const seconds = Number.isFinite(parsed) ? parsed : 90;
    const clamped = Math.min(3600, Math.max(5, seconds));
    if (String(clamped) !== restSecsInput.value) {
      restSecsInput.value = String(clamped);
    }
    return clamped;
  }

  function debounce(fn, delay = 100) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  async function loadExercises() {
    allExercises = [];
    const jsonPaths = [
      "data/exercises.json",
      "./data/exercises.json",
      "./exercises.json",
    ];
    for (const p of jsonPaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          allExercises = await res.json();
          break;
        }
      } catch (e) {
        console.warn(`Failed to load exercises from ${p}:`, e);
      }
    }
    if (!allExercises.length) {
      const jsPaths = ["./data/exercises.js", "./exercises.js"];
      for (const p of jsPaths) {
        try {
          const mod = await import(p);
          allExercises = mod.default;
          break;
        } catch (e) {
          console.warn(`Failed to load exercises from ${p}:`, e);
        }
      }
    }
    if (!Array.isArray(allExercises)) {
      allExercises = [];
      console.warn('No exercise database found, using empty list');
    }
    const custom = wtStorage.get(WT_KEYS.custom, []);
    custom.forEach((n) =>
      allExercises.push({
        name: n,
        category: "Custom",
        equipment: "",
        custom: true,
      }),
    );
    populateMuscleFilter();
    renderExerciseOptions();
  }

  function populateMuscleFilter() {
    const cats = Array.from(
      new Set(allExercises.map((e) => e.category)),
    ).sort();
    muscleFilter.innerHTML = '<option value="">All Categories</option>';
    cats.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      muscleFilter.appendChild(opt);
    });
  }

  function renderExerciseOptions() {
    exerciseSelect.innerHTML = '<option value="">Select Exercise</option>';
    exerciseList.innerHTML = "";
    const q = exerciseSearch.value.trim().toLowerCase();
    const cat = muscleFilter.value;
    const groups = {};
    const matches = [];
    allExercises.forEach((ex) => {
      if (cat && ex.category !== cat) return;
      if (q && !ex.name.toLowerCase().includes(q)) return;
      if (!groups[ex.category]) groups[ex.category] = [];
      groups[ex.category].push(ex);
      matches.push(ex);
    });
    Object.keys(groups)
      .sort()
      .forEach((catName) => {
        const og = document.createElement("optgroup");
        og.label = catName;
        groups[catName]
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((ex) => {
            const opt = document.createElement("option");
            opt.value = ex.name;
            opt.textContent = ex.name;
            opt.dataset.category = ex.category;
            og.appendChild(opt);
          });
        exerciseSelect.appendChild(og);
      });
    matches
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ex) => {
        const opt = document.createElement("option");
        opt.value = ex.name;
        exerciseList.appendChild(opt);
      });
  }

  function saveCustomExercises() {
    const custom = allExercises.filter((e) => e.custom).map((e) => e.name);
    wtStorage.set(WT_KEYS.custom, custom);
  }

  const renderExerciseOptionsDebounced = debounce(renderExerciseOptions, 150);
  exerciseSearch.addEventListener("input", renderExerciseOptionsDebounced);
  muscleFilter.addEventListener("change", renderExerciseOptions);
  exerciseSearch.addEventListener("change", () => {
    const val = exerciseSearch.value.trim();
    if (!val) return;
    const match = allExercises.find(
      (e) => e.name.toLowerCase() === val.toLowerCase(),
    );
    if (match) {
      exerciseSelect.value = match.name;
      exerciseSelect.dispatchEvent(new Event("change"));
    }
  });

  loadExercises();

  weightInput.addEventListener("input", updateLogButtonState);
  repsInput.addEventListener("input", updateLogButtonState);
  distanceInput.addEventListener("input", updateLogButtonState);
  durationMinInput.addEventListener("input", updateLogButtonState);
  durationSecInput.addEventListener("input", updateLogButtonState);
  supersetInputs.addEventListener("input", updateLogButtonState);

  /* ------------------ INIT ------------------ */
  todayEl.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (currentExercise) {
    showInterface();
    if (currentExercise.isSuperset) {
      setupSupersetInputs(currentExercise.exercises);
      standardInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      supersetInputs.classList.remove("hidden");
    } else if (currentExercise.isCardio) {
      supersetInputs.classList.add("hidden");
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
    } else {
      supersetInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    rebuildSetsList();
    updateSetCounter();
  }
  updateSummary();
  updateSetsToday();
  if (session.startedAt) startSessionTimer();
  updateLogButtonState();

  /* ------------------ THEME ------------------ */
  if (wtStorage.getRaw(WT_KEYS.theme) === "dark") {
    document.body.classList.add("dark");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light";
  }

  function syncThemeColor() {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const pack = getThemePack(document.body.dataset.themePack);
      themeMeta.content = document.body.classList.contains("dark")
        ? pack.darkColor
        : pack.lightColor;
    }
  }

  function playThemeTransition() {
    if (!themeTransition || prefersReducedMotion) return;
    themeTransition.classList.remove('is-active');
    void themeTransition.offsetWidth;
    themeTransition.classList.add('is-active');
    window.setTimeout(() => themeTransition.classList.remove('is-active'), 720);
  }

  function applyThemePack(value, { persist = true, syncMode = false, animate = false } = {}) {
    const pack = getThemePack(value);
    if (animate) playThemeTransition();
    document.body.dataset.themePack = pack.id;
    if (themePackLabel) themePackLabel.textContent = pack.label;
    themePackOptions.forEach((option) => {
      const selected = option.dataset.themePack === pack.id;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    if (syncMode) {
      const dark = pack.mode === 'dark';
      document.body.classList.toggle('dark', dark);
      themeIcon.textContent = dark ? '☀️' : '🌙';
      themeLabel.textContent = dark ? 'Light' : 'Dark';
      lsSetRaw(WT_KEYS.theme, dark ? 'dark' : 'light');
    }
    if (persist) lsSetRaw(WT_KEYS.themePack, pack.id);
    syncThemeColor();
    return pack;
  }

  let themeSheetPreviousFocus = null;
  function openThemeSheet() {
    themeSheetPreviousFocus = document.activeElement;
    themePackSheet.classList.add('is-open');
    themePackBackdrop.classList.add('is-open');
    themePackSheet.setAttribute('aria-hidden', 'false');
    themePackBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('theme-sheet-open');
    const selected = themePackSheet.querySelector('.theme-pack-option.is-selected');
    window.setTimeout(() => (selected || themePackClose).focus(), 80);
  }

  function closeThemeSheet() {
    if (!themePackSheet.classList.contains('is-open')) return;
    themePackSheet.classList.remove('is-open');
    themePackBackdrop.classList.remove('is-open');
    themePackSheet.setAttribute('aria-hidden', 'true');
    themePackBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('theme-sheet-open');
    if (themeSheetPreviousFocus?.focus) themeSheetPreviousFocus.focus();
  }

  const storedPack = wtStorage.getRaw(WT_KEYS.themePack);
  applyThemePack(storedPack || 'aurora', { persist: false });
  syncThemeColor();

  darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    themeIcon.textContent = dark ? "☀️" : "🌙";
    themeLabel.textContent = dark ? "Light" : "Dark";
    lsSetRaw(WT_KEYS.theme, dark ? "dark" : "light");
    syncThemeColor();
  });

  themePackButton.addEventListener('click', openThemeSheet);
  themePackClose.addEventListener('click', closeThemeSheet);
  themePackBackdrop.addEventListener('click', closeThemeSheet);
  themePackOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const pack = applyThemePack(option.dataset.themePack, {
        persist: true,
        syncMode: true,
        animate: true,
      });
      announce(`${pack.label} theme applied`);
      showToast(`${pack.label} atmosphere activated`, { duration: 2400 });
      window.setTimeout(closeThemeSheet, 180);
    });
  });

  themePackSheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeThemeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(themePackSheet.querySelectorAll('button:not(:disabled)'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ------------------ IMMERSIVE UI ------------------ */
  const scrollProgressBar = document.getElementById('scrollProgressBar');
  const dockActions = Array.from(document.querySelectorAll('.dock-action[data-scroll-target]'));
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function updateScrollProgress() {
    if (!scrollProgressBar) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    scrollProgressBar.style.transform = `scaleX(${progress})`;
  }

  let scrollFrame = null;
  window.addEventListener('scroll', () => {
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(() => {
      updateScrollProgress();
      scrollFrame = null;
    });
  }, { passive: true });
  updateScrollProgress();

  function setActiveDock(targetId) {
    dockActions.forEach((button) => {
      const active = button.dataset.scrollTarget === targetId;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
  }

  dockActions.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.scrollTarget;
      const target = document.getElementById(targetId);
      if (!target) return;
      setActiveDock(targetId);
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });

  const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));
  document.body.classList.add('app-ready');
  if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
    revealTargets.forEach((target) => target.classList.add('in-view'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach((target) => revealObserver.observe(target));
  }

  const dockSections = dockActions
    .map((button) => document.getElementById(button.dataset.scrollTarget))
    .filter(Boolean);
  if (typeof IntersectionObserver !== 'undefined') {
    const dockObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveDock(visible.target.id);
    }, { rootMargin: '-28% 0px -58% 0px', threshold: [0.01, 0.25, 0.5] });
    dockSections.forEach((section) => dockObserver.observe(section));
  }

  /* ------------------ CUSTOM EXERCISE ------------------ */
  addExerciseBtn.addEventListener("click", () => {
    const name = customExerciseInput.value.trim();
    if (!name) return;
    if (
      !allExercises.some((e) => e.name.toLowerCase() === name.toLowerCase())
    ) {
      allExercises.push({
        name,
        category: "Custom",
        equipment: "",
        custom: true,
      });
      saveCustomExercises();
      populateMuscleFilter();
      renderExerciseOptions();
    }
    exerciseSearch.value = "";
    muscleFilter.value = "";
    renderExerciseOptions();
    exerciseSelect.value = name;
    customExerciseInput.value = "";
    startExercise(name);
  });

  /* ------------------ SUPERSET ------------------ */
  function populateSupersetSelects() {
    [supersetSelect1, supersetSelect2].forEach((sel) => {
      sel.innerHTML = exerciseSelect.innerHTML;
      sel.value = "";
    });
  }

  startSupersetBtn.addEventListener("click", () => {
    supersetBuilder.classList.toggle("hidden");
    if (!supersetBuilder.classList.contains("hidden")) {
      exerciseSearch.value = "";
      muscleFilter.value = "";
      renderExerciseOptions();
      populateSupersetSelects();
    }
  });

  beginSupersetBtn.addEventListener("click", () => {
    const n1 = supersetSelect1.value;
    const n2 = supersetSelect2.value;
    if (!n1 || !n2) {
      showToast("Choose two exercises");
      return;
    }
    supersetBuilder.classList.add("hidden");
    startSuperset([n1, n2]);
  });

  /* ------------------ SELECT EXERCISE ------------------ */
  exerciseSelect.addEventListener("change", (e) => {
    const chosen = e.target.value;
    if (!chosen) return;

    // Clear filters so the list is fresh next time
    exerciseSearch.value = "";
    muscleFilter.value = "";

    // Start the exercise BEFORE re-rendering, so we don't lose the selected value
    startExercise(chosen);

    // Rebuild the options list
    renderExerciseOptions();

    // Optional: clear the dropdown so it's ready for the next pick
    exerciseSelect.value = "";
  });

  function startExercise(name) {
    if (!session.startedAt) session.startedAt = new Date().toISOString();
    startSessionTimer();
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    const meta = allExercises.find((e) => e.name === name);
    const isCardio = (meta && meta.category === "Cardio") || name === "Plank";
    currentExercise = { name, sets: [], nextSet: 1, isCardio };
    supersetInputs.classList.add("hidden");
    if (currentExercise.isCardio) {
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
      if (name === "Jump Rope" || name === "Plank") {
        distanceInput.classList.add("hidden");
        distanceInput.value = "";
        durationMinInput.focus();
      } else {
        distanceInput.classList.remove("hidden");
        distanceInput.focus();
      }
    } else {
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    supersetBuilder.classList.add("hidden");
    saveState();
    showInterface();
    rebuildSetsList();
    updateSetCounter();
    if (!currentExercise.isCardio) {
      weightInput.focus();
    }
    updateLogButtonState();
  }

  function startSuperset(namesArr) {
    if (!session.startedAt) session.startedAt = new Date().toISOString();
    startSessionTimer();
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    const clean = namesArr.filter(Boolean);
    currentExercise = {
      name: clean.join(" + "),
      isSuperset: true,
      exercises: [...clean],
      sets: [],
      nextSet: 1,
    };
    setupSupersetInputs(clean);
    standardInputs.classList.add("hidden");
    cardioInputs.classList.add("hidden");
    supersetInputs.classList.remove("hidden");
    supersetBuilder.classList.add("hidden");
    saveState();
    showInterface();
    rebuildSetsList();
    updateSetCounter();
    document.querySelector("#weight0").focus();
    updateLogButtonState();
  }

  function setupSupersetInputs(arr) {
    supersetInputs.innerHTML = "";
    arr.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "inline-row";
      const weightField = document.createElement("input");
      weightField.type = "number";
      weightField.id = `weight${i}`;
      weightField.className = "field superset-field";
      weightField.placeholder = `${name} weight`;
      weightField.setAttribute("aria-label", `${name} weight in pounds`);
      weightField.min = "0";
      weightField.step = "0.5";
      const repsField = document.createElement("input");
      repsField.type = "number";
      repsField.id = `reps${i}`;
      repsField.className = "field superset-field";
      repsField.placeholder = `${name} reps`;
      repsField.setAttribute("aria-label", `${name} repetitions`);
      repsField.min = "1";
      repsField.step = "1";
      row.appendChild(weightField);
      row.appendChild(repsField);
      supersetInputs.appendChild(row);
    });
  }

  function getStagePresentation(exercise) {
    if (exercise.isSuperset) return { label: 'Superset', tone: 'superset' };
    if (exercise.isCardio) return { label: 'Cardio', tone: 'cardio' };
    const meta = allExercises.find((item) => item.name === exercise.name);
    const category = String(meta?.category || 'Strength');
    const normalized = category.toLowerCase();
    const tone = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].find((value) =>
      normalized.includes(value),
    ) || 'strength';
    return { label: category === 'Strength' ? 'Strength' : `${category} · Strength`, tone };
  }

  function pulseExerciseStage() {
    if (!exerciseStage) return;
    exerciseStage.classList.remove('set-celebrate');
    void exerciseStage.offsetWidth;
    exerciseStage.classList.add('set-celebrate');
    window.setTimeout(() => exerciseStage.classList.remove('set-celebrate'), 760);
  }

  function showInterface() {
    interfaceBox.classList.remove("hidden");
    interfaceBox.classList.remove('interface-enter');
    void interfaceBox.offsetWidth;
    interfaceBox.classList.add('interface-enter');
    document.body.classList.add("workout-active");
    exerciseNameEl.textContent = currentExercise.name;
    const presentation = getStagePresentation(currentExercise);
    exerciseStage.dataset.stageTone = presentation.tone;
    exerciseStageType.textContent = presentation.label;
    exerciseStage.style.setProperty('--set-energy', String(Math.min(1, .2 + ((currentExercise.nextSet || 1) - 1) * .16)));
  }

  /* ------------------ LOG SET ------------------ */
  logBtn.addEventListener("click", function () {
    if (currentExercise.isSuperset) {
      const setGroup = currentExercise.exercises.map((ex, i) => {
        const w = parseFloat(document.getElementById(`weight${i}`).value);
        const r = parseInt(document.getElementById(`reps${i}`).value, 10);
        return { name: ex, weight: w, reps: r };
      });
      if (setGroup.some((s) => !canLogSet(s.weight, s.reps))) {
        showToast("Enter weight & reps for all exercises");
        return;
      }
      const planned = getPlannedRestSeconds();
      // Normalize inner exercises and wrap in normalized set object
      const supersetSet = normalizeSet({
        set: currentExercise.nextSet,
        exercises: setGroup,
        time: new Date().toLocaleTimeString(),
        ts: Date.now(),
        restPlanned: planned,
        restActual: null,
      });
      currentExercise.sets.push(supersetSet);
      addSetElement(
        currentExercise.sets[currentExercise.sets.length - 1],
        currentExercise.sets.length - 1,
      );
      currentExercise.nextSet++;
      updateSetCounter();
      pulseExerciseStage();

      currentExercise.exercises.forEach((_, i) => {
        document.getElementById(`weight${i}`).value = "";
        document.getElementById(`reps${i}`).value = "";
      });
      if (planned != null) {
        startRest(planned, currentExercise.sets.length - 1);
      }
      updateSummary();
      updateSetsToday();
      saveState();
      updateLogButtonState();
      announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
      document.getElementById("weight0").focus();
      return;
    }

    if (currentExercise.isCardio) {
      const rawD = parseFloat(distanceInput.value);
      const d = distanceInput.value === "" ? null : rawD;
      const m = parseInt(durationMinInput.value, 10) || 0;
      const s = parseInt(durationSecInput.value, 10) || 0;
      const t = m * 60 + s;
      if (!canLogCardio(d, t, currentExercise.name)) {
        showToast(
          ["Jump Rope", "Plank"].includes(currentExercise.name)
            ? "Enter duration"
            : "Enter distance & duration",
        );
        return;
      }
      const planned = getPlannedRestSeconds();
      const cardioSet = normalizeSet({
        set: currentExercise.nextSet,
        distance: d,
        duration: t,
        time: new Date().toLocaleTimeString(),
        ts: Date.now(),
        restPlanned: planned,
        restActual: null,
      });
      currentExercise.sets.push(cardioSet);
      addSetElement(
        currentExercise.sets[currentExercise.sets.length - 1],
        currentExercise.sets.length - 1,
      );
      currentExercise.nextSet++;
      updateSetCounter();
      pulseExerciseStage();
      distanceInput.value = "";
      durationMinInput.value = "";
      durationSecInput.value = "";
      if (planned != null) {
        startRest(planned, currentExercise.sets.length - 1);
      }
      updateSummary();
      updateSetsToday();
      saveState();
      updateLogButtonState();
      announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
      if (distanceInput.classList.contains("hidden")) {
        durationMinInput.focus();
      } else {
        distanceInput.focus();
      }
      return;
    }

    const w = parseFloat(weightInput.value);
    const r = parseInt(repsInput.value, 10);

    if (!canLogSet(w, r)) {
      showToast("Enter weight & reps");
      return;
    }

    const planned = getPlannedRestSeconds();

    const strengthSet = normalizeSet({
      set: currentExercise.nextSet,
      weight: w,
      reps: r,
      time: new Date().toLocaleTimeString(),
      ts: Date.now(),
      restPlanned: planned,
      restActual: null,
    });
    currentExercise.sets.push(strengthSet);

    addSetElement(
      currentExercise.sets[currentExercise.sets.length - 1],
      currentExercise.sets.length - 1,
    );
    currentExercise.nextSet++;
    updateSetCounter();
    pulseExerciseStage();

    weightInput.focus();
    weightInput.select();
    repsInput.value = "";

    if (planned != null) {
      startRest(planned, currentExercise.sets.length - 1);
    }

    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
    announce(`Logged set ${currentExercise.nextSet - 1} for ${currentExercise.name}`);
  });

  function addSetElement(setObj, index) {
    const hint = setsList.querySelector(".empty-hint");
    if (hint) hint.remove();
    const item = document.createElement("div");
    item.className = "set-item set-pop";
    item.dataset.index = index;

    const restInfo =
      setObj.restActual != null
        ? ` • Rest: ${formatSec(setObj.restActual)}`
        : setObj.restPlanned != null
          ? ` • Rest planned: ${formatSec(setObj.restPlanned)}`
          : "";

    let meta = "";
    if (currentExercise.isSuperset) {
      meta = setObj.exercises
        .map((e) => `${e.name}: ${e.weight}×${e.reps}`)
        .join(" |");
    } else if (currentExercise.isCardio) {
      const dist = setObj.distance != null ? `${setObj.distance} mi` : "";
      const dur = formatSec(setObj.duration);
      meta = dist ? `${dist} in ${dur}` : dur;
    } else {
      meta = `${setObj.weight} lbs × ${setObj.reps} reps`;
    }

    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.minWidth = "150px";
    const label = document.createElement("div");
    label.className = "set-label";
    label.textContent = `${currentExercise.name} – Set ${setObj.set}`;
    const metaEl = document.createElement("div");
    metaEl.className = "set-meta";
    metaEl.textContent = `${meta}${restInfo}`;
    content.appendChild(label);
    content.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "set-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn-mini edit";
    editButton.dataset.action = "edit";
    editButton.textContent = "Edit";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-mini del";
    deleteButton.dataset.action = "del";
    deleteButton.textContent = "Del";
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    item.appendChild(content);
    item.appendChild(actions);
    const editBtn = item.querySelector('button[data-action="edit"]');
    editBtn.setAttribute(
      "aria-label",
      `Edit set ${setObj.set} for ${currentExercise.name}`,
    );
    const delBtn = item.querySelector('button[data-action="del"]');
    delBtn.setAttribute(
      "aria-label",
      `Delete set ${setObj.set} for ${currentExercise.name}`,
    );
    setsList.appendChild(item);
  }

  function rebuildSetsList() {
    setsList.innerHTML = "";
    if (!currentExercise) return;
    if (!currentExercise.sets.length) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent =
        "No sets yet. Enter weight & reps, then press Log Set.";
      hint.style.color = "#888";
      hint.style.fontSize = "0.9em";
      setsList.appendChild(hint);
      return;
    }
    currentExercise.sets.forEach((s, i) => addSetElement(s, i));
  }

  /* ------------------ EDIT / DELETE ------------------ */
  setsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const item = btn.closest(".set-item");
    const idx = parseInt(item.dataset.index, 10);
    if (action === "del") deleteSet(idx);
    else if (action === "edit") openEditForm(item, idx);
  });

  async function deleteSet(idx) {
    const ok = await confirmModal("Delete this set?", { yesText: 'Delete', noText: 'Cancel' });
    if (!ok) return;
    pushUndo({
      type: "deleteSet",
      payload: {
        exerciseName: currentExercise?.name,
        exerciseIndex: null,
        removedSet: deepClone(currentExercise.sets[idx]),
        removedIndex: idx,
      },
    });
    announce(`Deleted set ${idx + 1} for ${currentExercise.name}`);
    currentExercise.sets.splice(idx, 1);
    renumberSets();
    rebuildSetsList();
    updateSetCounter();
    updateSummary();
    updateSetsToday();
    saveState();
    showToast("Set deleted", {
      actionLabel: "Undo",
      onAction: performUndo,
    });
  }

  /* === FIXED EDIT FORM === */
  function openEditForm(item, idx) {
    if (item.querySelector(".edit-form")) return;
    const s = currentExercise.sets[idx];

    const form = document.createElement("div");
    form.className = "edit-form";
    if (currentExercise.isSuperset) {
      s.exercises.forEach((ex, i) => {
        const row = document.createElement("div");
        row.className = "row";
        const label = document.createElement("span");
        label.style.fontSize = "12px";
        label.style.flexBasis = "100%";
        label.textContent = ex.name;
        const weightField = document.createElement("input");
        weightField.type = "number";
        weightField.className = `editW${i}`;
        weightField.value = ex.weight;
        weightField.min = "0";
        weightField.step = "0.5";
        const repsField = document.createElement("input");
        repsField.type = "number";
        repsField.className = `editR${i}`;
        repsField.value = ex.reps;
        repsField.min = "1";
        repsField.step = "1";
        row.appendChild(label);
        row.appendChild(weightField);
        row.appendChild(repsField);
        form.appendChild(row);
      });
      const actionsRow = document.createElement("div");
      actionsRow.className = "row2";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-mini edit";
      saveBtn.setAttribute("data-edit-save", "");
      saveBtn.textContent = "Save";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-mini del";
      cancelBtn.setAttribute("data-edit-cancel", "");
      cancelBtn.textContent = "Cancel";
      actionsRow.appendChild(saveBtn);
      actionsRow.appendChild(cancelBtn);
      form.appendChild(actionsRow);
    } else if (currentExercise.isCardio) {
      if (
        currentExercise.name === "Jump Rope" ||
        currentExercise.name === "Plank"
      ) {
        const mins = Math.floor(s.duration / 60);
        const secs = s.duration % 60;
        form.innerHTML = `
        <div class="row">
          <input type="number" class="editDurMin" value="${mins}" min="0">
          <input type="number" class="editDurSec" value="${secs}" min="0" max="59">
        </div>
        <div class="row">
          <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
          <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
        </div>
        <div class="row2">
          <button type="button" class="btn-mini edit" data-edit-save>Save</button>
          <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
        </div>
      `;
      } else {
        form.innerHTML = `
        <div class="row">
          <input type="number" class="editD" value="${s.distance ?? ""}" min="0" step="0.01">
          <input type="number" class="editDur" value="${s.duration}" min="1">
        </div>
        <div class="row">
          <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
          <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
        </div>
        <div class="row2">
          <button type="button" class="btn-mini edit" data-edit-save>Save</button>
          <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
        </div>
      `;
      }
    } else {
      form.innerHTML = `
      <div class="row">
        <input type="number" class="editW" value="${s.weight}" min="0" step="0.5">
        <input type="number" class="editR" value="${s.reps}"   min="1" step="1">
      </div>
      <div class="row">
        <input type="number" class="editRestPlanned" value="${s.restPlanned ?? ""}" min="0" placeholder="Rest planned (sec)">
        <input type="number" class="editRestActual"  value="${s.restActual ?? ""}" min="0" placeholder="Rest actual (sec)">
      </div>
      <div class="row2">
        <button type="button" class="btn-mini edit" data-edit-save>Save</button>
        <button type="button" class="btn-mini del"  data-edit-cancel>Cancel</button>
      </div>
    `;
    }
    item.appendChild(form);
    const firstField = form.querySelector("input");
    if (firstField) firstField.focus();

    form.addEventListener("click", (ev) => {
      if (ev.target.hasAttribute("data-edit-save")) {
        if (currentExercise.isSuperset) {
          let bad = false;
          s.exercises.forEach((ex, i) => {
            const w = parseFloat(form.querySelector(`.editW${i}`).value);
            const r = parseInt(form.querySelector(`.editR${i}`).value, 10);
            if (!canLogSet(w, r)) bad = true;
            const norm = normalizeSet({ name: ex.name, weight: w, reps: r });
            ex.weight = norm.weight;
            ex.reps = norm.reps;
          });
          if (bad) {
            showToast("Enter valid numbers for all exercises");
            return;
          }
        } else if (currentExercise.isCardio) {
          const dField = form.querySelector(".editD");
          const rawD = dField ? parseFloat(dField.value) : null;
          const newD = dField ? (dField.value === "" ? null : rawD) : null;
          const durField = form.querySelector(".editDur");
          let newDur;
          if (durField) {
            newDur = parseInt(durField.value, 10);
          } else {
            const m =
              parseInt(form.querySelector(".editDurMin").value, 10) || 0;
            const se =
              parseInt(form.querySelector(".editDurSec").value, 10) || 0;
            newDur = m * 60 + se;
          }
          const vPlanned = form.querySelector(".editRestPlanned").value;
          const vActual = form.querySelector(".editRestActual").value;
          const newPlanned = vPlanned === "" ? null : parseInt(vPlanned, 10);
          const newActual = vActual === "" ? null : parseInt(vActual, 10);
          if (!canLogCardio(newD, newDur, currentExercise.name)) {
            showToast(
              ["Jump Rope", "Plank"].includes(currentExercise.name)
                ? "Enter valid duration"
                : "Enter valid distance & duration",
            );
            return;
          }
          const norm = normalizeSet({
            distance: newD,
            duration: newDur,
            restPlanned: newPlanned,
            restActual: newActual,
          });
          s.distance = norm.distance;
          s.duration = norm.duration;
          s.restPlanned = norm.restPlanned;
          s.restActual = norm.restActual;
        } else {
          const newW = parseFloat(form.querySelector(".editW").value);
          const newR = parseInt(form.querySelector(".editR").value, 10);
          const vPlanned = form.querySelector(".editRestPlanned").value;
          const vActual = form.querySelector(".editRestActual").value;

          const newPlanned = vPlanned === "" ? null : parseInt(vPlanned, 10);
          const newActual = vActual === "" ? null : parseInt(vActual, 10);

          if (!canLogSet(newW, newR)) {
            showToast("Enter valid weight & reps");
            return;
          }

          const norm = normalizeSet({
            weight: newW,
            reps: newR,
            restPlanned: newPlanned,
            restActual: newActual,
          });
          s.weight = norm.weight;
          s.reps = norm.reps;
          s.restPlanned = norm.restPlanned;
          s.restActual = norm.restActual;
        }

        saveState();
        rebuildSetsList();
        updateSummary();
        updateSetsToday();
        form.remove();
        const editBtn = setsList.querySelector(
          `.set-item[data-index="${idx}"] button[data-action="edit"]`,
        );
        if (editBtn) editBtn.focus();
      }
      if (ev.target.hasAttribute("data-edit-cancel")) {
        form.remove();
        const editBtn = item.querySelector('button[data-action="edit"]');
        if (editBtn) editBtn.focus();
        return;
      }
    });
  }

  function renumberSets() {
    currentExercise.sets.forEach((s, i) => (s.set = i + 1));
    currentExercise.nextSet = currentExercise.sets.length + 1;
  }

  function updateSetCounter() {
    if (!currentExercise) return;
    setCounterEl.textContent = currentExercise.nextSet;
    exerciseNameEl.textContent = currentExercise.name;
    if (exerciseStage) {
      exerciseStage.style.setProperty('--set-energy', String(Math.min(1, .2 + ((currentExercise.nextSet || 1) - 1) * .16)));
    }
  }

  /* ------------------ NEXT EXERCISE ------------------ */
  nextExerciseBtn.addEventListener("click", () => {
    const finishedName = currentExercise ? currentExercise.name : "";
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    currentExercise = null;
    exerciseSelect.value = "";
    interfaceBox.classList.add("hidden");
    document.body.classList.remove("workout-active", "resting");
    weightInput.value = "";
    repsInput.value = "";
    distanceInput.value = "";
    durationMinInput.value = "";
    durationSecInput.value = "";
    cardioInputs.classList.add("hidden");

    if (restTimer) {
      clearInterval(restTimer);
      restBox.classList.add("hidden");
    }

    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
    if (finishedName) announce(`Finished ${finishedName}`);
  });

  function pushOrMergeExercise(ex) {
    const existing = session.exercises.find((e) => e.name === ex.name);
    if (existing) {
      ex.sets.forEach((s) => {
        const norm = normalizeSet({ ...s, set: existing.sets.length + 1 });
        existing.sets.push(norm);
      });
    } else {
      session.exercises.push({
        name: ex.name,
        isSuperset: ex.isSuperset || false,
        isCardio: ex.isCardio || false,
        exercises: ex.exercises ? [...ex.exercises] : undefined,
        sets: ex.sets.map((s) => normalizeSet({ ...s })),
      });
    }
  }

  /* ------------------ REST TIMER ------------------ */
  function startRest(seconds, setIndex) {
    stopRest();
    document.body.classList.add("resting");
    restSecondsRemaining = seconds;
    restStartMs = Date.now();
    restSetIndex = setIndex;
    updateRestDisplay();
    restBox.classList.remove("hidden");
    announce(`Rest started for ${formatSec(seconds)}`);
    restTimer = setInterval(() => {
      restSecondsRemaining--;
      updateRestDisplay();
      if (restSecondsRemaining <= 0) {
        finishRest();
        restDisplay.textContent = "Ready!";
        setTimeout(() => restBox.classList.add("hidden"), 1500);
      }
    }, 1000);
    
    // Cleanup timer on page unload
    window.addEventListener('beforeunload', stopRest, { once: true });
  }

  function stopRest() {
    if (restTimer) {
      clearInterval(restTimer);
      restTimer = null;
    }
    document.body.classList.remove("resting");
  }

  function finishRest() {
    stopRest();
    announce("Rest finished");
    const elapsed = Math.round((Date.now() - restStartMs) / 1000);
    if (
      currentExercise &&
      restSetIndex != null &&
      currentExercise.sets[restSetIndex]
    ) {
      currentExercise.sets[restSetIndex].restActual = elapsed;
      saveState();
      rebuildSetsList();
    }
    restSetIndex = null;
  }

  function updateRestDisplay() {
    const m = Math.floor(restSecondsRemaining / 60);
    const s = restSecondsRemaining % 60;
    restDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  restBox.addEventListener("click", function () {
    finishRest();
    restBox.classList.add("hidden");
  });

  /* ------------------ CALENDAR SAVE ------------------ */
  function saveSessionLinesToHistory(){
    const snapshot = getSessionSnapshot();
    if(!snapshot.length) return;
    const lines = [];
    snapshot.forEach(ex => {
      if(ex.isSuperset){
        ex.sets.forEach((set, setIdx) => {
          set.exercises.forEach(sub => {
            const setNumber = set.set || setIdx + 1;
            lines.push(`${sub.name}: Set ${setNumber} - ${sub.weight} lbs × ${sub.reps} reps`);
          });
        });
      } else if(ex.isCardio){
        ex.sets.forEach((set, setIdx) => {
          lines.push(formatCardioHistoryLine(ex.name, set, setIdx + 1));
        });
      } else {
        ex.sets.forEach((set, setIdx) => {
          const setNumber = set.set || setIdx + 1;
          lines.push(`${ex.name}: Set ${setNumber} - ${set.weight} lbs × ${set.reps} reps`);
        });
      }
    });
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const history = wtStorage.get(WT_KEYS.history, {});
    history[dateStr] = appendUniqueHistoryLines(history[dateStr], lines);
    wtStorage.set(WT_KEYS.history, history);
    window.dispatchEvent(new Event('wt-history-updated'));
  }

  // Build a deep copy of all exercises including the in-progress one
  function buildExportExercises() {
    const exportExercises = session.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => normalizeSet({ ...s })),
    }));
    if (currentExercise && currentExercise.sets.length) {
      const exExisting = exportExercises.find(
        (e) => e.name === currentExercise.name,
      );
      if (exExisting) {
        currentExercise.sets.forEach((s) => {
          const norm = normalizeSet({ ...s, set: exExisting.sets.length + 1 });
          exExisting.sets.push(norm);
        });
      } else {
        exportExercises.push({
          name: currentExercise.name,
          isSuperset: currentExercise.isSuperset || false,
          isCardio: currentExercise.isCardio || false,
          exercises: currentExercise.exercises
            ? [...currentExercise.exercises]
            : undefined,
          sets: currentExercise.sets.map((s) => normalizeSet({ ...s })),
        });
      }
    }
    return exportExercises;
  }

  function endWorkout({ persistCompleted = true } = {}) {
    const snapshot = buildExportExercises();
    if (persistCompleted && snapshot.length) {
      wtStorage.set(WT_KEYS.last, snapshot);
      saveSessionLinesToHistory();
      const date = getLocalDateString();
      const completed = normalizePayload({
        date,
        timestamp: new Date().toISOString(),
        exercises: snapshot,
      });
      if (session.startedAt) {
        const startMs = new Date(session.startedAt).getTime();
        const endMs = Date.now();
        if (Number.isFinite(startMs) && endMs >= startMs) {
          completed.session = {
            sessionStart: new Date(startMs).toISOString(),
            sessionEnd: new Date(endMs).toISOString(),
            sessionDurationSec: Math.round((endMs - startMs) / 1000),
          };
        }
      }
      archivedSessions[date] = completed;
      archivedSessions = pruneArchive(archivedSessions, 120);
      wtStorage.set(WT_KEYS.archive, archivedSessions);
    }
    stopRest();
    restSetIndex = null;
    restSecondsRemaining = 0;
    restStartMs = 0;
    restBox.classList.add("hidden");
    restDisplay.textContent = "00:00";
    stopSessionTimer();
    session = { exercises: [], startedAt: null };
    currentExercise = null;
    exerciseSelect.value = "";
    interfaceBox.classList.add("hidden");
    document.body.classList.remove("workout-active", "resting");
    setsList.innerHTML = "";
    weightInput.value = "";
    repsInput.value = "";
    distanceInput.value = "";
    durationMinInput.value = "";
    durationSecInput.value = "";
    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
  }

  /* ------------------ RESET WORKOUT ------------------ */
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmModal("Reset entire workout?", { yesText: 'Reset', noText: 'Cancel', title: 'Reset Workout' });
    if (!ok) return;
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({ type: "reset", payload: { prevSession, prevCurrent } });
    endWorkout({ persistCompleted: false });
    announce("Workout reset");
    showToast("Workout reset", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ FINISH WORKOUT ------------------ */
  finishBtn.addEventListener("click", async () => {
    const ok = await confirmModal("Finish workout?", { yesText: 'Finish', noText: 'Cancel', title: 'Finish Workout' });
    if (!ok) return;
    const prevSession = deepClone(session);
    const prevCurrent = deepClone(currentExercise);
    pushUndo({ type: "finish", payload: { prevSession, prevCurrent } });
    endWorkout({ persistCompleted: true });
    announce("Workout finished");
    showToast("Workout finished", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ SUMMARY ------------------ */
  function updateSummary() {
    let totalSets = 0;
    summaryText.innerHTML = "";
    session.exercises.forEach((ex, i) => {
      totalSets += ex.sets.length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.appendChild(
        document.createTextNode(`${ex.name}: ${ex.sets.length} sets `),
      );
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-mini edit";
      editBtn.dataset.summaryEdit = String(i);
      editBtn.textContent = "Edit";
      item.appendChild(editBtn);
      summaryText.appendChild(item);
    });
    if (currentExercise && currentExercise.sets.length) {
      totalSets += currentExercise.sets.length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.textContent = `${currentExercise.name}: ${currentExercise.sets.length} sets (in progress)`;
      summaryText.appendChild(item);
    }

    if (totalSets === 0) {
      summaryText.textContent = "Start your first exercise to begin tracking.";
    } else {
      const total = document.createElement("strong");
      total.textContent = `Total Sets: ${totalSets}`;
      summaryText.prepend(document.createElement("br"));
      summaryText.prepend(total);
    }
  }

  summaryText.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-summary-edit]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.summaryEdit, 10);
    if (currentExercise && currentExercise.sets.length) {
      pushOrMergeExercise(currentExercise);
    }
    currentExercise = session.exercises.splice(idx, 1)[0];
    showInterface();
    if (currentExercise.isSuperset) {
      setupSupersetInputs(currentExercise.exercises);
      standardInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      supersetInputs.classList.remove("hidden");
    } else if (currentExercise.isCardio) {
      supersetInputs.classList.add("hidden");
      standardInputs.classList.add("hidden");
      cardioInputs.classList.remove("hidden");
    } else {
      supersetInputs.classList.add("hidden");
      cardioInputs.classList.add("hidden");
      standardInputs.classList.remove("hidden");
    }
    rebuildSetsList();
    updateSetCounter();
    updateLogButtonState();
    updateSummary();
    updateSetsToday();
  });

  /* ------------------ EXPORT (JSON + AI + CSV) ------------------ */
  exportBtn.addEventListener("click", () => {
    let exportExercises = buildExportExercises();
    if (exportExercises.length) {
      wtStorage.set(WT_KEYS.last, exportExercises);
      saveSessionLinesToHistory();
    } else {
      const last = wtStorage.get(WT_KEYS.last, null);
      if (last && last.length) {
        exportExercises = last;
      } else {
        showToast("No workout data yet.");
        return;
      }
    }
    
    // Ask whether to include notes first, then ask for session time
    confirmModal("Include workout notes in export?", {
      yesText: "Yes",
      noText: "No",
      title: "Export Options",
    }).then((includeNotes) => {
      // Honor preference: if ON include without asking; if OFF exclude without asking
      const alwaysSession = !!wtStorage.get(WT_KEYS.prefSessionTime, false);
      performExport(exportExercises, includeNotes, alwaysSession);
    });
  });
  
  function performExport(exportExercises, includeNotes, includeSessionTime) {
    const currentDate = getLocalDateString();
    const goalsForExport = sanitizeGoals(goals)
      .filter((g) => g.active)
      .map((g) => g.text);
    const constraintsForExport = sanitizeConstraints(constraints);

    const normalized = normalizePayload({
      date: currentDate,
      timestamp: new Date().toISOString(),
      exercises: exportExercises,
      goals: goalsForExport,
      constraints: constraintsForExport,
    });

    const payload = { ...normalized };

    let workoutNotes = [];
    if (includeNotes) {
      const history = wtStorage.get(WT_KEYS.history, {});
      workoutNotes = Array.isArray(history[currentDate]) ? history[currentDate] : [];
      const logLineRe =
        /^(?:[^:]+:\s*)?(?:Set\s*\d+\s*[-–:]?\s*)?\d+(?:\.\d+)?\s*(?:lbs|kg)\s*[×xX]\s*\d+\s*reps/i;
      workoutNotes = workoutNotes.filter((line) =>
        !logLineRe.test(String(line).trim()),
      );
      if (workoutNotes.length) {
        payload.workoutNotes = workoutNotes;
      }
    }

    let sessionMeta = null;
    if (includeSessionTime) {
      const timestamps = [];
      payload.exercises.forEach((ex) => {
        ex.sets.forEach((s) => {
          if (s && typeof s.ts === 'number') timestamps.push(s.ts);
        });
      });
      let startTs = null;
      let endTs = null;
      if (session && session.startedAt) {
        startTs = new Date(session.startedAt).getTime();
        endTs = Date.now();
      } else if (timestamps.length) {
        startTs = Math.min(...timestamps);
        endTs = Math.max(...timestamps);
      }
      if (startTs != null && endTs >= startTs) {
        const durationSec = Math.max(0, Math.round((endTs - startTs) / 1000));
        sessionMeta = {
          sessionStart: new Date(startTs).toISOString(),
          sessionEnd: new Date(endTs).toISOString(),
          sessionDurationSec: durationSec,
        };
        payload.session = sessionMeta;
      }
    }

    // Load calendar titles to match day type
    let titlesByDate = {};
    try {
      const rawTitles = localStorage.getItem('wt_history_titles');
      titlesByDate = rawTitles ? JSON.parse(rawTitles) : {};
    } catch {}

    let previousSessions = Object.entries(archivedSessions || {})
      .filter(([date]) => date !== payload.date)
      .map(([date, data]) =>
        normalizePayload({
          ...data,
          date: data && data.date ? data.date : date,
        }),
      )
      .sort((a, b) => (a.date > b.date ? -1 : 1));

    // If a day type is selected, filter to matching titles
    if (dayType) {
      const target = String(dayType).toLowerCase();
      const keywordMap = {
        back: ['row', 'pull', 'lat', 'pulldown', 'deadlift', 'rear delt'],
        chest: ['bench', 'press', 'push up', 'fly'],
        legs: ['squat', 'leg', 'lunge', 'calf', 'hamstring', 'quad'],
        shoulders: ['overhead', 'ohp', 'shoulder', 'lateral raise', 'rear delt'],
        arms: ['curl', 'tricep', 'bicep', 'extension', 'skullcrusher'],
        push: ['bench', 'press', 'shoulder', 'tricep', 'dip', 'push'],
        pull: ['row', 'pull', 'lat', 'pulldown', 'curl', 'deadlift'],
        upper: ['bench', 'press', 'row', 'pull', 'curl', 'tricep', 'shoulder'],
        lower: ['squat', 'leg', 'lunge', 'calf', 'deadlift', 'hamstring', 'quad'],
        cardio: ['run', 'jog', 'walk', 'bike', 'cycle', 'rower', 'elliptical', 'jump rope', 'plank']
      };
      const kw = keywordMap[target] || [];

      const titleOrHeuristic = (s) => {
        const t = String(titlesByDate[s.date] || '').toLowerCase();
        if (t === target) return true;
        if (!kw.length) return false;
        // Heuristic: count matches by exercise name
        let names = [];
        if (Array.isArray(s.exercises)) {
          s.exercises.forEach((ex) => {
            if (!ex) return;
            if (ex.isSuperset && Array.isArray(ex.sets)) {
              ex.sets.forEach((set) => {
                (set.exercises || []).forEach((inner) => names.push(String(inner.name || '')));
              });
            } else {
              names.push(String(ex.name || ''));
            }
          });
        }
        const total = names.length || 1;
        const hits = names.filter((n) => {
          const low = n.toLowerCase();
          return kw.some((k) => low.includes(k));
        }).length;
        return hits / total >= 0.4; // include if ~40% exercises match
      };

      previousSessions = previousSessions.filter(titleOrHeuristic);
    }

    // Limit by comparison window (or none)
    if (dayCompare === 'none') previousSessions = [];
    else if (dayCompare === '3') previousSessions = previousSessions.slice(0, 3);
    else if (dayCompare === '7') previousSessions = previousSessions.slice(0, 7);

    const currentStats = computeSessionStats(payload);
    const previousStats = previousSessions.map((session) =>
      computeSessionStats(session),
    );
    const highlights = buildExerciseHighlightsForExport(
      currentStats,
      previousStats,
    );
    if (highlights.length) {
      payload.exerciseHighlights = sanitizeExerciseHighlights(highlights);
    }
    const prevByName = new Map();
    previousStats.forEach((sess) => {
      (sess.exercises || []).forEach((ex) => {
        if (!ex || !ex.name) return;
        if (!prevByName.has(ex.name)) prevByName.set(ex.name, ex);
      });
    });
    const progressionLines = [];
    const nextTargetLines = [];
    (currentStats.exercises || []).forEach((ex) => {
      const prev = prevByName.get(ex.name);
      if (prev) {
        const volChange = formatPercentChange(ex.totalVolume, prev.totalVolume);
        const topChange = formatPercentChange(
          ex.topSet?.weight ?? null,
          prev.topSet?.weight ?? null,
        );
        const prevTop = formatTopSet(prev.topSet);
        const currTop = formatTopSet(ex.topSet);
        const prevVol = formatVolumeNumber(prev.totalVolume);
        const currVol = formatVolumeNumber(ex.totalVolume);
        progressionLines.push(
          `${ex.name} – Volume: ${prevVol} → ${currVol} (${volChange}); Top set: ${prevTop} → ${currTop} (${topChange})`,
        );
      }

      const currTopWeight = ex.topSet?.weight;
      const currTopReps = ex.topSet?.reps;
      const currVolume = ex.totalVolume || 0;
      if (Number.isFinite(currTopWeight) && Number.isFinite(currTopReps)) {
        const nextWeight = roundToStep(currTopWeight * 1.025, 0.5);
        const targetTop = `${nextWeight}×${currTopReps} (~+2.5% load)`;
        const volBumpPct = 0.03;
        const nextVol = Math.max(0, Math.round(currVolume * (1 + volBumpPct)));
        const volPctText = `${volBumpPct >= 0 ? '+' : ''}${(volBumpPct * 100).toFixed(1)}%`;
        nextTargetLines.push(
          `${ex.name} – Next top set target: ${targetTop}; Next volume target: ${formatVolumeNumber(currVolume)} → ${formatVolumeNumber(nextVol)} (${volPctText})`,
        );
      }
    });

    const jsonStr = JSON.stringify(payload, null, 2);
    triggerDownload(
      new Blob([jsonStr], { type: "application/json" }),
      `workout_${payload.date}.json`,
    );

    const csvHeader =
      "Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)\n";
    let csv = csvHeader;
    if (includeSessionTime && sessionMeta) {
      const meta = [
        `SessionStart,${sessionMeta.sessionStart}`,
        `SessionEnd,${sessionMeta.sessionEnd}`,
        `SessionDuration(sec),${sessionMeta.sessionDurationSec}`,
        "",
      ].join("\n");
      csv = meta + "\n" + csvHeader;
    }
    payload.exercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        if (ex.isSuperset) {
          s.exercises.forEach((sub) => {
            csv += `${csvRow([sub.name, s.set, sub.weight, sub.reps, "", "", s.time, s.restPlanned ?? "", s.restActual ?? ""])}\n`;
          });
        } else if (ex.isCardio) {
          csv += `${csvRow([ex.name, s.set, "", "", s.distance ?? "", s.duration ?? "", s.time, s.restPlanned ?? "", s.restActual ?? ""])}\n`;
        } else {
          csv += `${csvRow([ex.name, s.set, s.weight, s.reps, "", "", s.time, s.restPlanned ?? "", s.restActual ?? ""])}\n`;
        }
      });
    });
    triggerDownload(
      new Blob([csv], { type: "text/csv" }),
      `workout_${payload.date}.csv`,
    );

    if (wtStorage.get(WT_KEYS.prefSessionTime, false)) {
      showToast("Always include session time is ON", {
        actionLabel: "Turn off",
        onAction: () => {
          wtStorage.set(WT_KEYS.prefSessionTime, false);
          showToast("Preference updated: session time won't be auto-included.");
        },
      });
    }

    const constraintLines = describeConstraintsLines(payload.constraints);

    let aiText = `WORKOUT DATA - ${payload.date}\n\n`;
    aiText += `SESSION SNAPSHOT\n`;
    aiText += `- Total sets: ${payload.totalSets}\n`;
    aiText += `- Volume load: ${formatVolumeNumber(currentStats.totalVolume)} (sum weight × reps)\n`;
    if (currentStats.totalCardioDuration) {
      aiText += `- Cardio duration: ${formatSecondsHuman(currentStats.totalCardioDuration)}\n`;
    }
    if (includeSessionTime && sessionMeta) {
      aiText += `- Session duration: ${formatSecondsHuman(sessionMeta.sessionDurationSec)}\n`;
    }
    aiText += `\n`;

    aiText += `GOALS & FOCUS\n`;
    if (goalsForExport.length) {
      goalsForExport.forEach((goal) => {
        aiText += `- ${goal}\n`;
      });
    } else {
      aiText += `- None specified.\n`;
    }
    aiText += `\n`;

    aiText += `SCHEDULE & CONSTRAINTS\n`;
    if (constraintLines.length) {
      constraintLines.forEach((line) => {
        aiText += `- ${line}\n`;
      });
    } else {
      aiText += `- No upcoming constraints reported.\n`;
    }
    aiText += `\n`;
    if (progressionGuard) {
      aiText += `PROGRESSION METRICS (from recent sessions in this chat)\n`;
      if (progressionLines.length) {
        progressionLines.forEach((line) => {
          aiText += `- ${line}\n`;
        });
      } else {
        aiText += `- Not enough past data to compute progression deltas.\n`;
      }
      aiText += `\n`;

      aiText += `PROGRESSION GUARD (MANDATORY IF INCLUDED)\n`;
      aiText += `- Ensure the user is never stagnating: verify load/rep/volume progression against recent sessions you already have in this conversation and propose increases or quality improvements.\n`;
      aiText += `- Use math: compare volume (weight × reps), top-set loads, and total sets vs those prior sessions; call out regressions and prescribe stepwise progressions.\n`;
      aiText += `- If progression is unsafe, suggest form cues or rep/tempo quality gains to keep advancing.\n\n`;
    }

    if (nextTargetLines.length) {
      aiText += `NEXT TARGETS (auto)\n`;
      nextTargetLines.forEach((line) => {
        aiText += `- ${line}\n`;
      });
      aiText += `\n`;
    }

    aiText += `EXERCISE HIGHLIGHTS\n`;
    if (payload.exerciseHighlights && payload.exerciseHighlights.length) {
      payload.exerciseHighlights.forEach((highlight) => {
        aiText += `${highlight.name}:\n`;
        if (highlight.today) aiText += `  Today: ${highlight.today}\n`;
        if (highlight.trend) aiText += `  Trend: ${highlight.trend}\n`;
        if (highlight.previous && highlight.previous.length) {
          aiText += `  Recent:\n`;
          highlight.previous.forEach((prev) => {
            aiText += `    - ${prev}\n`;
          });
        }
        if (highlight.isPR) {
          aiText += `  PR: New personal best on the top set.\n`;
        }
        aiText += `\n`;
      });
    } else {
      aiText += `- No past data yet to compare.\n\n`;
    }

    if (includeNotes && workoutNotes.length) {
      aiText += `WORKOUT NOTES\n`;
      workoutNotes.forEach((note) => {
        aiText += `- ${note}\n`;
      });
      aiText += `\n`;
    }

    aiText += `DETAILED SET LOG\n`;
    if (payload.exercises.length) {
      payload.exercises.forEach((ex) => {
        aiText += `${ex.name}:\n`;
        ex.sets.forEach((s) => {
          const rp =
            s.restPlanned != null
              ? ` (planned ${formatSec(s.restPlanned)}`
              : "";
          const ra =
            s.restActual != null
              ? `${rp ? "; " : " ("}actual ${formatSec(s.restActual)})`
              : rp
                ? ")"
                : "";
          const rest = rp || ra ? (rp ? rp : "") + (ra ? ra : "") : "";
          if (ex.isSuperset) {
            const parts = (s.exercises || []).map((sub) => `${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`).join(" | ");
            aiText += `  Set ${s.set}: ${parts}${rest ? rest : ""}\n`;
          } else if (ex.isCardio) {
            const dist = s.distance != null ? `${s.distance} mi` : "";
            const dur = formatSec(s.duration);
            aiText += `  Set ${s.set}: ${dist ? dist + " in " : ""}${dur}${rest ? rest : ""}\n`;
          } else {
            aiText += `  Set ${s.set}: ${s.weight} lbs × ${s.reps} reps${rest ? rest : ""}\n`;
          }
        });
        aiText += `\n`;
      });
    } else {
      aiText += `- No sets logged.\n\n`;
    }

    aiText += `NEXT STEPS REQUEST\n`;
    aiText += `Please analyze the session and consistency metrics, flag regressions or PRs, and craft the next workout. Prioritize:\n`;
    aiText += `1. Insight: Note strength/cardio trends, weak points, or fatigue signals.\n`;
    aiText += `2. Next workout: Provide a detailed plan aligned with goals and constraints.\n`;
    aiText += `3. Progression: Suggest load/rep adjustments and technique cues to keep momentum.\n`;

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(aiText)
        .then(() => {
          alert("Exported JSON + CSV. AI summary copied to clipboard ✅");
        })
        .catch(() => alert("Exported files. (Clipboard copy failed)"));
    } else {
      alert("Exported JSON + CSV. Copy this manually:\n\n" + aiText);
    }

    archivedSessions[payload.date] = payload;
    archivedSessions = pruneArchive(archivedSessions, 120);
    wtStorage.set(WT_KEYS.archive, archivedSessions);
  }

  function triggerDownload(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /* ------------------ SAVE / LOAD ------------------ */
  function saveState() {
    wtStorage.set(WT_KEYS.session, session);
    wtStorage.set(WT_KEYS.current, currentExercise);
  }

  if (needsSaveAfterNormalize) {
    saveState();
    needsSaveAfterNormalize = false;
  }

  /* ------------------ UTILS ------------------ */
  // Local date string in the same format calendar.js uses (YYYY-MM-DD, local time)
  function getLocalDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Stable confirm modal to replace native confirm() which may auto-dismiss in some environments
  function formatSec(sec) {
    return formatSecondsHuman(sec);
  }

  /* ------------------ SHORTCUTS ------------------ */
  repsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") logBtn.click();
  });
  weightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") repsInput.focus();
  });
  durationMinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") durationSecInput.focus();
  });
  durationSecInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") logBtn.click();
  });
  distanceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") durationMinInput.focus();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (
        !logBtn.disabled &&
        document.activeElement &&
        document.activeElement.tagName === "INPUT"
      ) {
        logBtn.click();
      }
    } else if (e.key === "Escape") {
      const openForm = document.querySelector(".edit-form");
      if (openForm) {
        const parent = openForm.parentElement;
        openForm.remove();
        const editBtn = parent.querySelector('button[data-action="edit"]');
        if (editBtn) editBtn.focus();
      } else if (!restBox.classList.contains("hidden")) {
        finishRest();
        restBox.classList.add("hidden");
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      performUndo();
    }
    if (!mod && e.key.toLowerCase() === "u") {
      performUndo();
    }
    if (e.key === "Escape") {
      hideToast();
    }
  });
}

function getSessionSnapshot() {
  const snapshot = session.exercises.map((ex) => ({
    name: ex.name,
    isSuperset: ex.isSuperset || false,
    isCardio: ex.isCardio || false,
    exercises: ex.exercises ? [...ex.exercises] : undefined,
    sets: ex.sets.map((s) => normalizeSet({ ...s })),
  }));
  if (currentExercise) {
    snapshot.push({
      name: currentExercise.name,
      isSuperset: currentExercise.isSuperset || false,
      isCardio: currentExercise.isCardio || false,
      exercises: currentExercise.exercises
        ? [...currentExercise.exercises]
        : undefined,
      sets: currentExercise.sets.map((s) => normalizeSet({ ...s })),
    });
  }
  return snapshot;
}

if (typeof window !== "undefined") {
  window.getSessionSnapshot = getSessionSnapshot;
}

if (typeof module !== "undefined") {
module.exports = {
  THEME_PACKS,
  getThemePack,
  canLogSet,
  canLogCardio,
  normalizeSet,
  normalizePayload,
  computeSessionStats,
  buildExerciseHighlightsForExport,
  computeConsistencyMetricsFromStats,
  appendUniqueHistoryLines,
  csvRow,
  formatCardioHistoryLine,
  parseYMD,
  formatShortDate,
};
}
