# Workout Tracker

This is a lightweight web-based workout tracker. Log sets with any weight (including zero for bodyweight exercises) and export data as JSON, CSV, or AI-ready text. Finished sessions are saved locally so you can export even after closing the workout.

## Data Integrity Guarantees

To keep logs accurate and exports clean, the app enforces the following at input, edit, and export time:

- Strength sets: weight coerced to non-negative number; reps coerced to integer ≥ 1.
- Supersets: each inner exercise weight/reps normalized with the same rules as strength.
- Cardio sets: distance is null or non-negative number; duration is integer seconds ≥ 0.
- Rest fields: `restPlanned` and `restActual` are integers ≥ 0 when present, else null.
- Exports: JSON/CSV/AI are built from a normalized snapshot with correct totals.

These guardrails apply when logging, editing, merging current exercise into session, importing JSON, creating snapshots for the calendar, and exporting.

## Export Formats

- JSON: `workout_YYYY-MM-DD.json` includes the normalized session plus context fields:
  - Core fields: `date`, `timestamp`, `totalExercises`, `totalSets`, `exercises[]`, `schema` (currently `3`).
  - Optional extras saved when provided: `session{ sessionStart, sessionEnd, sessionDurationSec }`, `workoutNotes[]`, `goals[]`, `constraints`, and `exerciseHighlights`.
- CSV: header `Exercise,Set,Weight,Reps,Distance,Duration,Time,RestPlanned(sec),RestActual(sec)`. If session time is included, metadata rows are prepended.
- AI Text: structured summary with session snapshot, goals, constraints, exercise highlights (including PR flags/trends), optional freeform notes, and an optional “Progression Guard” directive to prevent stagnation (tells the AI to use prior workouts in the same chat plus today’s log). When enabled, the export includes per-exercise progression metrics and auto “next targets” for every lift logged.

## Context Panels

Right under the workout summary you can capture extra context so exports tell AI exactly what you need:

- **Goals & Focus** – add or remove short-term goals, then tap a goal chip to mark it “active” for today. Only active goals flow into the export so you can tailor each workout (or export with none). Toggle “Require AI to drive progression” to add a mandatory anti-stagnation directive and include auto progression metrics/next targets in the export.
- **Schedule & Constraints** – log upcoming conflicts and areas to de-emphasize; they’re surfaced in the AI prompt so smart plans respect your calendar/body.

The export dialog uses this context along with recent session history to highlight trends/PRs and expand the AI request so you get richer feedback automatically.

## History

Workout history is saved to local storage under `wt_history`. You can export this history (which also copies the JSON to your clipboard) or import additional entries.

1. **Import History** – choose a JSON file from disk (entries merge and de-duplicate).
2. **Paste Import** – paste JSON, AI text, or CSV into the box and import.

The calendar includes Prev/Next buttons plus Today and Go-to-date controls for quick navigation. After importing, the calendar re-renders and you'll see your notes immediately.

## Testing

Run tests with `npm test`.

## Playground Preview

Run `npm run playground` to spin up a lightweight dev server (via `lite-server`) at `http://localhost:3000`. The page auto-reloads whenever you save changes to files in this repo, giving you a quick way to try updates in the browser without deploying.
