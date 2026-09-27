# Workout Tracker 2.0 — local preview

## Product changes

- Four focused screens: Train, Next up, Progress, and History.
- iPhone-first layouts, large labeled numeric controls, safe-area navigation, optional plain-language effort shortcuts, and dark appearance.
- Local next-session prescriptions with exact logged-set-based targets, reasons, confidence, recorded preparation sets, and conservative safety holds.
- Current-session exercise selection only; history compares the same exercises without expanding the roster.
- Start a planned exercise and explicitly fill its targets. Targets are never logged automatically. Finish and save the current session before starting its next-session prescription.
- Per-exercise goal dashboard and a 28-day training calendar without invented performance or linear-progress promises.

## Reliability

- Finished sessions preserve their original date, duration, and context.
- Distinct workouts on the same date remain separate for progression comparisons.
- Main records save before optional recovery copies; multi-record transitions attempt rollback on failure.
- Calendar import validation rejects malformed dates and invalid measurements; note-save failures preserve entered text.
- Calendar notes are clearly distinguished from structured saved workouts.

## Verification

- 141 Jest tests across 12 suites pass.
- Browser verification: select exercise, log set, view current-only plan, finish/save, start new planned session, fill targets, and retain saved workout.
- iPhone-sized layout inspected in the in-app browser. Physical iPhone Safari testing is still recommended before release.

## Boundaries

- Not deployed. Review at http://127.0.0.1:3092 while the local server is running.
- Data remains browser-local. Calendar notes export is not a full-device backup. Individual saved workouts and the current workout have separate exports.
- Warm-up weights are not invented when preparation sets are missing. App prescriptions are conservative heuristics, not individualized medical advice or guaranteed optimal programming.
- Home-screen manifest is provided; offline operation is not promised.
