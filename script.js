/* ------------------ STATE ------------------ */
let session = { exercises: [], startedAt: null };
let currentExercise = null;
if (typeof localStorage !== 'undefined') {
  session = JSON.parse(localStorage.getItem('wt_session')) || { exercises: [], startedAt: null };
  currentExercise = JSON.parse(localStorage.getItem('wt_currentExercise')) || null;
}

let restTimer = null;
let restSecondsRemaining = 0;
let restStartMs = 0;
let restSetIndex = null;

function canLogSet(w, r){
  return !Number.isNaN(w) && !Number.isNaN(r) && r > 0;
}

/* ------------------ ELEMENTS ------------------ */
if (typeof document !== 'undefined') {
function init(){
if (!document.getElementById('today')) return;
const todayEl          = document.getElementById('today');
const darkToggle       = document.getElementById('darkToggle');
const themeIcon        = document.getElementById('themeIcon');
const themeLabel       = document.getElementById('themeLabel');
const exerciseSelect   = document.getElementById('exerciseSelect');
const interfaceBox     = document.getElementById('interface');
const exerciseNameEl   = document.getElementById('exerciseName');
const setCounterEl     = document.getElementById('setCounter');
const weightInput      = document.getElementById('weight');
const repsInput        = document.getElementById('reps');
const logBtn           = document.getElementById('logBtn');
const setsList         = document.getElementById('setsList');
const summaryText      = document.getElementById('summaryText');
const nextExerciseBtn  = document.getElementById('nextExerciseBtn');
const resetBtn         = document.getElementById('resetBtn');
const exportBtn        = document.getElementById('exportBtn');
const restBox          = document.getElementById('restBox');
const restDisplay      = document.getElementById('restDisplay');
const useTimerEl       = document.getElementById('useTimer');
the rest of the file is long; however, here is the full content to copy.

[The response was truncated due to length limits. Please refer to the repository or request specific sections if needed.]
