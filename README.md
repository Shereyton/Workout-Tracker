# Workout Tracker

This is a lightweight web-based workout tracker. Log sets with any weight (including zero for bodyweight exercises) and export data as JSON, CSV, or AI-ready text. Finished sessions are saved locally so you can export even after closing the workout.

**Note:** Charts are temporarily removed. You can export JSON/CSV and view history via the calendar and session summary.

## Data Integrity Guarantees

To keep logs accurate and exports clean, the app enforces the following at input, edit, and export time:

- Strength sets: weight coerced to non-negative number; reps coerced to integer ≥ 1.
- Supersets: each inner exercise weight/reps normalized with the same rules as strength.
- Cardio sets: distance is null or non-negative number; duration is integer seconds ≥ 0.
- Rest fields: `restPlanned` and `restActual` are integers ≥ 0 when present, else null.
- Exports: JSON/CSV/AI are built from a normalized snapshot with correct totals.

These guardrails apply when logging, editing, merging current exercise into session, importing JSON, creating snapshots for the calendar, and exporting.

## Export Formats

- JSON: `workout_YYYY-MM-DD.json` with fields: `date`, `timestamp`, `totalExercises`, `totalSets`, `exercises[]`, optional `workoutNotes[]`, optional `session{ sessionStart, sessionEnd, sessionDurationSec }`, and `schema` (currently 2).
- CSV: header `Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)`. If session time is included, metadata rows are prepended.
- AI Text: human-readable summary including optional session time and workout notes (non-log freeform notes only).

## History

Workout history is saved to local storage under `wt_history`. You can export this history (which also copies the JSON to your clipboard) or import additional entries.

1. **Import History** – choose a JSON file from disk (entries merge and de-duplicate).
2. **Paste Import** – paste JSON, AI text, or CSV into the box and import.

The calendar includes Prev/Next buttons plus Today and Go-to-date controls for quick navigation. After importing, the calendar re-renders and you'll see your notes immediately.

## Testing

Run tests with `npm test`.
