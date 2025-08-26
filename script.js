/* ------------------ STATE ------------------ */
let session = { exercises: [], startedAt: null };
let currentExercise = null;
if (typeof localStorage !== "undefined") {
  session = JSON.parse(localStorage.getItem("wt_session")) || {
    exercises: [],
    startedAt: null,
  };
  currentExercise =
    JSON.parse(localStorage.getItem("wt_currentExercise")) || null;
}

let restTimer = null;
let restSecondsRemaining = 0;
let restStartMs = 0;
let restSetIndex = null;

function canLogSet(w, r) {
  return !Number.isNaN(w) && !Number.isNaN(r) && r > 0;
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
        // try next
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
          // try next
        }
      }
    }
    if (!Array.isArray(allExercises)) allExercises = [];
    const custom = JSON.parse(localStorage.getItem("custom_exercises")) || [];
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
    localStorage.setItem("custom_exercises", JSON.stringify(custom));
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
  if (localStorage.getItem("wt_theme") === "dark") {
    document.body.classList.add("dark");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light";
  }
  darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    themeIcon.textContent = dark ? "☀️" : "🌙";
    themeLabel.textContent = dark ? "Light" : "Dark";
    localStorage.setItem("wt_theme", dark ? "dark" : "light");
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
      alert("Choose two exercises");
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
        alert("Enter weight & reps for all exercises");
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
        alert(
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
      alert("Enter weight & reps");
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

  function deleteSet(idx) {
    if (!confirm("Delete this set?")) return;
    announce(`Deleted set ${idx + 1} for ${currentExercise.name}`);
    currentExercise.sets.splice(idx, 1);
    renumberSets();
    rebuildSetsList();
    updateSetCounter();
    updateSummary();
    updateSetsToday();
    saveState();
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
            alert("Enter valid numbers");
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
            alert(
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
            alert("Enter valid weight & reps");
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
    const history = JSON.parse(localStorage.getItem('wt_history') || '{}');
    history[dateStr] = Array.from(new Set([...(history[dateStr]||[]), ...lines]));
    localStorage.setItem('wt_history', JSON.stringify(history));
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
      localStorage.setItem("wt_lastWorkout", JSON.stringify(snapshot));
    } else {
      localStorage.removeItem("wt_lastWorkout");
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
  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset entire workout?")) return;
    endWorkout();
    announce("Workout reset");
  });

  /* ------------------ FINISH WORKOUT ------------------ */
  finishBtn.addEventListener("click", () => {
    if (!confirm("Finish workout?")) return;
    endWorkout();
    announce("Workout finished");
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
      localStorage.setItem("wt_lastWorkout", JSON.stringify(exportExercises));
      saveSessionLinesToHistory();
    } else {
      const last = JSON.parse(localStorage.getItem("wt_lastWorkout") || "null");
      if (last && last.length) {
        exportExercises = last;
      } else {
        alert("No workout data yet.");
        return;
      }
    }
    const totalSets = exportExercises.reduce(
      (sum, e) => sum + e.sets.length,
      0,
    );
    const payload = {
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      totalExercises: exportExercises.length,
      totalSets,
      exercises: exportExercises,
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
  });

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
    localStorage.setItem("wt_session", JSON.stringify(session));
    localStorage.setItem("wt_currentExercise", JSON.stringify(currentExercise));
  }

  /* ------------------ UTILS ------------------ */
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
  module.exports = { canLogSet, canLogCardio };
}
