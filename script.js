// ---- storage guardrails (no HTML changes) ----
const WT_KEYS = {
  session: 'wt_session',
  current: 'wt_currentExercise',
  last: 'wt_lastWorkout',
  history: 'wt_history',
  custom: 'custom_exercises',
  theme: 'wt_theme',
  schema: 'wt_schema_version'
};

const WT_SCHEMA_VERSION = 2;

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
  return {
    date,
    timestamp: ts,
    totalExercises: exs.length,
    totalSets,
    exercises: exs,
    schema: WT_SCHEMA_VERSION,
  };
}

// Merge imported exercises into wt_history lines (for charts and history)
function mergeIntoHistory(payload) {
  const hist = wtStorage.get(WT_KEYS.history, {});
  const day = String(payload.date);
  const lines = [];

  for (const ex of payload.exercises) {
    if (ex.isSuperset) {
      for (const s of ex.sets) {
        for (const sub of s.exercises || []) {
          lines.push(
            `${sub.name}: ${coercePositiveNumber(sub.weight)} lbs × ${Math.max(
              1,
              Math.floor(coercePositiveNumber(sub.reps)),
            )} reps`,
          );
        }
      }
    } else if (!ex.isCardio) {
      for (const s of ex.sets) {
        lines.push(
          `${ex.name}: ${coercePositiveNumber(s.weight)} lbs × ${Math.max(
            1,
            Math.floor(coercePositiveNumber(s.reps)),
          )} reps`,
        );
      }
    }
  }
  const curr = Array.isArray(hist[day]) ? hist[day] : [];
  const merged = Array.from(new Set([...curr, ...lines]));
  hist[day] = merged;
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

  // --- Import UI ---
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
    const prevSession = JSON.parse(JSON.stringify(session));
    const prevCurrent = currentExercise
      ? JSON.parse(JSON.stringify(currentExercise))
      : null;
    pushUndo({ type: 'import', payload: { prevSession, prevCurrent } });
    session = { exercises: normalized.exercises, startedAt: null };
    currentExercise = null;
    wtStorage.set(WT_KEYS.last, normalized.exercises);
    mergeIntoHistory(normalized);
    interfaceBox.classList.add('hidden');
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
  sessionTimerEl.style.fontSize = "0.9em";
  sessionTimerEl.style.color = "#666";
  sessionTimerEl.style.display = "none";
  todayEl.after(sessionTimerEl);

  const setsTodayEl = document.createElement("span");
  setsTodayEl.style.fontSize = "0.9em";
  setsTodayEl.style.color = "#666";
  setsTodayEl.style.marginLeft = "8px";
  sessionTimerEl.after(setsTodayEl);

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
    sessionTimerEl.style.display = "inline";
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
    setsTodayEl.textContent = `• Sets today: ${computeTotalSets()}`;
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
        const w = parseInt(document.getElementById(`weight${i}`).value, 10);
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

    const w = parseInt(weightInput.value, 10);
    const r = parseInt(repsInput.value, 10);
    logBtn.disabled = !canLogSet(w, r);
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
  darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    themeIcon.textContent = dark ? "☀️" : "🌙";
    themeLabel.textContent = dark ? "Light" : "Dark";
    lsSetRaw(WT_KEYS.theme, dark ? "dark" : "light");
  });

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
      row.innerHTML = `<input type="number" id="weight${i}" class="field superset-field" placeholder="${name} weight" min="0"><input type="number" id="reps${i}" class="field superset-field" placeholder="${name} reps" min="1">`;
      supersetInputs.appendChild(row);
    });
  }

  function showInterface() {
    interfaceBox.classList.remove("hidden");
    exerciseNameEl.textContent = currentExercise.name;
  }

  /* ------------------ LOG SET ------------------ */
  logBtn.addEventListener("click", function () {
    if (currentExercise.isSuperset) {
      const setGroup = currentExercise.exercises.map((ex, i) => {
        const w = parseInt(document.getElementById(`weight${i}`).value, 10);
        const r = parseInt(document.getElementById(`reps${i}`).value, 10);
        return { name: ex, weight: w, reps: r };
      });
      if (setGroup.some((s) => !canLogSet(s.weight, s.reps))) {
        showToast("Enter weight & reps for all exercises");
        return;
      }
      const useTimer = useTimerEl.checked;
      const planned = useTimer ? parseInt(restSecsInput.value, 10) || 0 : null;
      currentExercise.sets.push({
        set: currentExercise.nextSet,
        exercises: setGroup,
        time: new Date().toLocaleTimeString(),
        restPlanned: planned,
        restActual: null,
      });
      addSetElement(
        currentExercise.sets[currentExercise.sets.length - 1],
        currentExercise.sets.length - 1,
      );
      currentExercise.nextSet++;
      updateSetCounter();
      currentExercise.exercises.forEach((_, i) => {
        document.getElementById(`weight${i}`).value = "";
        document.getElementById(`reps${i}`).value = "";
      });
      if (useTimer && planned != null) {
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
      const useTimer = useTimerEl.checked;
      const planned = useTimer ? parseInt(restSecsInput.value, 10) || 0 : null;
      currentExercise.sets.push({
        set: currentExercise.nextSet,
        distance: d,
        duration: t,
        time: new Date().toLocaleTimeString(),
        restPlanned: planned,
        restActual: null,
      });
      addSetElement(
        currentExercise.sets[currentExercise.sets.length - 1],
        currentExercise.sets.length - 1,
      );
      currentExercise.nextSet++;
      updateSetCounter();
      distanceInput.value = "";
      durationMinInput.value = "";
      durationSecInput.value = "";
      if (useTimer && planned != null) {
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

    const w = parseInt(weightInput.value, 10);
    const r = parseInt(repsInput.value, 10);

    if (!canLogSet(w, r)) {
      showToast("Enter weight & reps");
      return;
    }

    const useTimer = useTimerEl.checked;
    const planned = useTimer ? parseInt(restSecsInput.value, 10) || 0 : null;

    currentExercise.sets.push({
      set: currentExercise.nextSet,
      weight: w,
      reps: r,
      time: new Date().toLocaleTimeString(),
      restPlanned: planned,
      restActual: null,
    });

    addSetElement(
      currentExercise.sets[currentExercise.sets.length - 1],
      currentExercise.sets.length - 1,
    );
    currentExercise.nextSet++;
    updateSetCounter();

    weightInput.focus();
    weightInput.select();
    repsInput.value = "";

    if (useTimer && planned != null) {
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
    item.className = "set-item";
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

    item.innerHTML = `
    <div style="flex:1;min-width:150px;">
      <div class="set-label">${currentExercise.name} – Set ${setObj.set}</div>
      <div class="set-meta">${meta}${restInfo}</div>
    </div>
    <div class="set-actions">
      <button class="btn-mini edit" data-action="edit">Edit</button>
      <button class="btn-mini del"  data-action="del">Del</button>
    </div>
  `;
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
        removedSet: { ...currentExercise.sets[idx] },
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
      let rows = "";
      s.exercises.forEach((ex, i) => {
        rows += `<div class="row"><span style="font-size:12px;flex-basis:100%;">${ex.name}</span><input type="number" class="editW${i}" value="${ex.weight}" min="0"><input type="number" class="editR${i}" value="${ex.reps}" min="1"></div>`;
      });
      form.innerHTML = `${rows}<div class="row2"><button type="button" class="btn-mini edit" data-edit-save>Save</button><button type="button" class="btn-mini del" data-edit-cancel>Cancel</button></div>`;
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
        <input type="number" class="editW" value="${s.weight}" min="0">
        <input type="number" class="editR" value="${s.reps}"   min="1">
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
            const w = parseInt(form.querySelector(`.editW${i}`).value, 10);
            const r = parseInt(form.querySelector(`.editR${i}`).value, 10);
            if (isNaN(w) || isNaN(r)) bad = true;
            ex.weight = w;
            ex.reps = r;
          });
          if (bad) {
            showToast("Enter valid numbers");
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
          s.distance = newD;
          s.duration = newDur;
          s.restPlanned = newPlanned;
          s.restActual = newActual;
        } else {
          const newW = parseInt(form.querySelector(".editW").value, 10);
          const newR = parseInt(form.querySelector(".editR").value, 10);
          const vPlanned = form.querySelector(".editRestPlanned").value;
          const vActual = form.querySelector(".editRestActual").value;

          const newPlanned = vPlanned === "" ? null : parseInt(vPlanned, 10);
          const newActual = vActual === "" ? null : parseInt(vActual, 10);

          if (isNaN(newW) || isNaN(newR)) {
            showToast("Enter valid weight & reps");
            return;
          }

          s.weight = newW;
          s.reps = newR;
          s.restPlanned = newPlanned;
          s.restActual = newActual;
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
        existing.sets.push({ ...s, set: existing.sets.length + 1 });
      });
    } else {
      session.exercises.push({
        name: ex.name,
        isSuperset: ex.isSuperset || false,
        isCardio: ex.isCardio || false,
        exercises: ex.exercises ? [...ex.exercises] : undefined,
        sets: ex.sets.map((s) => ({ ...s })),
      });
    }
  }

  /* ------------------ REST TIMER ------------------ */
  function startRest(seconds, setIndex) {
    stopRest();
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
        ex.sets.forEach(set => {
          set.exercises.forEach(sub => {
            lines.push(`${sub.name}: ${sub.weight} lbs × ${sub.reps} reps`);
          });
        });
      } else if(!ex.isCardio){
        ex.sets.forEach(set => {
          lines.push(`${ex.name}: ${set.weight} lbs × ${set.reps} reps`);
        });
      }
    });
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const history = wtStorage.get(WT_KEYS.history, {});
    history[dateStr] = Array.from(new Set([...(history[dateStr]||[]), ...lines]));
    wtStorage.set(WT_KEYS.history, history);
    window.dispatchEvent(new Event('wt-history-updated'));
  }

  // Build a deep copy of all exercises including the in-progress one
  function buildExportExercises() {
    const exportExercises = session.exercises.map((e) => ({
      ...e,
      sets: [...e.sets],
    }));
    if (currentExercise && currentExercise.sets.length) {
      const exExisting = exportExercises.find(
        (e) => e.name === currentExercise.name,
      );
      if (exExisting) {
        currentExercise.sets.forEach((s) => {
          exExisting.sets.push({ ...s, set: exExisting.sets.length + 1 });
        });
      } else {
        exportExercises.push({
          name: currentExercise.name,
          isSuperset: currentExercise.isSuperset || false,
          isCardio: currentExercise.isCardio || false,
          exercises: currentExercise.exercises
            ? [...currentExercise.exercises]
            : undefined,
          sets: currentExercise.sets.map((s) => ({ ...s })),
        });
      }
    }
    return exportExercises;
  }

  function endWorkout() {
    const snapshot = buildExportExercises();
    if (snapshot.length) {
      wtStorage.set(WT_KEYS.last, snapshot);
    } else {
      wtStorage.clear(WT_KEYS.last);
    }
    saveSessionLinesToHistory();
    stopRest();
    stopSessionTimer();
    session = { exercises: [], startedAt: null };
    currentExercise = null;
    exerciseSelect.value = "";
    interfaceBox.classList.add("hidden");
    setsList.innerHTML = "";
    weightInput.value = "";
    repsInput.value = "";
    updateSummary();
    updateSetsToday();
    saveState();
    updateLogButtonState();
  }

  /* ------------------ RESET WORKOUT ------------------ */
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmModal("Reset entire workout?", { yesText: 'Reset', noText: 'Cancel', title: 'Reset Workout' });
    if (!ok) return;
    const prevSession = JSON.parse(JSON.stringify(session));
    const prevCurrent = JSON.parse(JSON.stringify(currentExercise));
    pushUndo({ type: "reset", payload: { prevSession, prevCurrent } });
    endWorkout();
    announce("Workout reset");
    showToast("Workout reset", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ FINISH WORKOUT ------------------ */
  finishBtn.addEventListener("click", async () => {
    const ok = await confirmModal("Finish workout?", { yesText: 'Finish', noText: 'Cancel', title: 'Finish Workout' });
    if (!ok) return;
    const prevSession = JSON.parse(JSON.stringify(session));
    const prevCurrent = JSON.parse(JSON.stringify(currentExercise));
    pushUndo({ type: "finish", payload: { prevSession, prevCurrent } });
    endWorkout();
    announce("Workout finished");
    showToast("Workout finished", { actionLabel: "Undo", onAction: performUndo });
  });

  /* ------------------ SUMMARY ------------------ */
  function updateSummary() {
    let totalSets = 0;
    const lines = [];
    session.exercises.forEach((ex, i) => {
      totalSets += ex.sets.length;
      lines.push(
        `<div class="summary-item">${ex.name}: ${ex.sets.length} sets <button class="btn-mini edit" data-summary-edit="${i}">Edit</button></div>`,
      );
    });
    if (currentExercise && currentExercise.sets.length) {
      totalSets += currentExercise.sets.length;
      lines.push(
        `<div class="summary-item">${currentExercise.name}: ${currentExercise.sets.length} sets (in progress)</div>`,
      );
    }

    if (totalSets === 0) {
      summaryText.textContent = "Start your first exercise to begin tracking.";
    } else {
      summaryText.innerHTML = `<strong>Total Sets: ${totalSets}</strong><br>${lines.join("")}`;
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
    
    // Use a reliable modal to ask whether to include notes
    confirmModal("Include workout notes in export?", {
      yesText: "Yes",
      noText: "No",
      title: "Export Options",
    }).then((includeNotes) => {
      performExport(exportExercises, includeNotes);
    });
  });
  
  function performExport(exportExercises, includeNotes) {
    
    const totalSets = exportExercises.reduce(
      (sum, e) => sum + e.sets.length,
      0,
    );
    
    // Get workout notes from calendar history if user wants them
    let workoutNotes = [];
    const currentDate = getLocalDateString();
    if (includeNotes) {
      // Access calendar history directly from localStorage (same as calendar.js uses)
      const calendarHistory = JSON.parse(localStorage.getItem('wt_history')) || {};
      workoutNotes = calendarHistory[currentDate] || [];
      // Remove workout log lines (keep only freeform notes)
      // Matches formats like: "Bench Press: Set 1 - 135 lbs × 8 reps" or "Bench Press: 135 lbs × 8 reps"
      const logLineRe = /^(?:[^:]+:\s*)?(?:Set\s*\d+\s*[-–:]?\s*)?\d+(?:\.\d+)?\s*(?:lbs|kg)\s*[×xX]\s*\d+\s*reps/i;
      workoutNotes = workoutNotes.filter(line => !logLineRe.test(String(line).trim()));
    }
    
    const payload = {
      date: currentDate,
      timestamp: new Date().toISOString(),
      totalExercises: exportExercises.length,
      totalSets,
      exercises: exportExercises,
      workoutNotes: includeNotes ? workoutNotes : undefined,
      schema: WT_SCHEMA_VERSION,
    };

    // JSON
    const jsonStr = JSON.stringify(payload, null, 2);
    triggerDownload(
      new Blob([jsonStr], { type: "application/json" }),
      `workout_${payload.date}.json`,
    );

    // CSV (with rest columns)
    let csv =
      "Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)\n";
    exportExercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        if (ex.isSuperset) {
          s.exercises.forEach((sub) => {
            csv += `${sub.name},${s.set},${sub.weight},${sub.reps},,,${s.time},${s.restPlanned ?? ""},${s.restActual ?? ""}\n`;
          });
        } else if (ex.isCardio) {
          csv += `${ex.name},${s.set},,,${s.distance ?? ""},${s.duration ?? ""},${s.time},${s.restPlanned ?? ""},${s.restActual ?? ""}\n`;
        } else {
          csv += `${ex.name},${s.set},${s.weight},${s.reps},,,${s.time},${s.restPlanned ?? ""},${s.restActual ?? ""}\n`;
        }
      });
    });
    triggerDownload(
      new Blob([csv], { type: "text/csv" }),
      `workout_${payload.date}.csv`,
    );

    // AI text
    let aiText = `WORKOUT DATA - ${payload.date}\n\n`;
    exportExercises.forEach((ex) => {
      if (ex.isSuperset) {
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
          s.exercises.forEach((sub) => {
            aiText += `  Set ${s.set} - ${sub.name}: ${sub.weight} lbs × ${sub.reps} reps${rp || ra ? (rp ? rp : "") + (ra ? ra : "") : ""}\n`;
          });
        });
      } else if (ex.isCardio) {
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
          const dist = s.distance != null ? `${s.distance} mi in ` : "";
          const dur = formatSec(s.duration);
          aiText += `  Set ${s.set}: ${dist}${dur}${rp || ra ? (rp ? rp : "") + (ra ? ra : "") : ""}\n`;
        });
      } else {
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
          aiText += `  Set ${s.set}: ${s.weight} lbs × ${s.reps} reps${rp || ra ? (rp ? rp : "") + (ra ? ra : "") : ""}\n`;
        });
      }
      aiText += "\n";
    });
    
    // Add workout notes to AI text if included
    if (includeNotes && workoutNotes.length > 0) {
      aiText += `Workout Notes:\n`;
      workoutNotes.forEach(note => {
        aiText += `- ${note}\n`;
      });
      aiText += `\n`;
    }
    
    aiText += `Summary: ${payload.totalExercises} exercises, ${payload.totalSets} total sets.\n\n`;
    aiText += `Please analyze progress vs previous sessions, suggest next targets, identify weak points, and recommend optimal weight/rep progressions.`;

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
  }

  function triggerDownload(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  function confirmModal(message, options = {}) {
    const { title = 'Confirm', yesText = 'OK', noText = 'Cancel' } = options;
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center; padding: 12px;
      `;
      const dialog = document.createElement('div');
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
      document.body.appendChild(modal);
      const cleanup = () => { document.body.removeChild(modal); };
      modal.addEventListener('click', (e) => { if (e.target === modal) { cleanup(); resolve(false); } });
      dialog.querySelector('#cmCancel').addEventListener('click', () => { cleanup(); resolve(false); });
      dialog.querySelector('#cmOk').addEventListener('click', () => { cleanup(); resolve(true); });
    });
  }
  function formatSec(sec) {
    const m = Math.floor(sec / 60),
      s = sec % 60;
    return `${m}m ${s}s`;
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
    sets: ex.sets.map((s) => ({ ...s })),
  }));
  if (currentExercise) {
    snapshot.push({
      name: currentExercise.name,
      isSuperset: currentExercise.isSuperset || false,
      isCardio: currentExercise.isCardio || false,
      exercises: currentExercise.exercises
        ? [...currentExercise.exercises]
        : undefined,
      sets: currentExercise.sets.map((s) => ({ ...s })),
    });
  }
  return snapshot;
}

if (typeof window !== "undefined") {
  window.getSessionSnapshot = getSessionSnapshot;
}

if (typeof module !== "undefined") {
module.exports = { canLogSet, canLogCardio, normalizeSet, normalizePayload };
}
