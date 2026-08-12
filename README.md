# Workout Tracker

This is a lightweight web-based workout tracker. Log sets with any weight (including zero for bodyweight exercises) and export data as JSON, CSV, or AI-ready text. Finished sessions, exercise-specific goals, and coaching profiles are saved locally so you can continue where you left off.

## Automatic Set Classification

Normal strength sets default to **Auto-detect**. As a complete exercise develops, the app deterministically separates warm-ups, ramp sets, productive work, top sets, and back-off sets. The user can override any classification, but does not need to configure set terminology just to log a workout.

Only completed working, top, and back-off sets can drive progression volume, strength estimates, goal bests, or an increase recommendation. Warm-ups, technique sets, failed attempts, unknown sets, invalid imports, pain-stopped sets, and poor-technique sets stay visible without becoming evidence to add weight.

## Data Integrity Guarantees

To keep logs accurate and exports clean, the app enforces the following at input, edit, and export time:

- Strength sets: weight must be a finite number from 0–9,999 and completed reps an integer from 1–999; invalid imported efforts are rejected instead of being fabricated as one rep.
- Supersets: each inner exercise is validated and classified independently, with distinct exercises required.
- Cardio sets: distance and duration are validated against finite domain limits, with time-only exercises handled separately.
- Rest fields: `restPlanned` and `restActual` are bounded integer seconds when present, otherwise null; timers use real elapsed time and remain accurate after backgrounding.
- Exports: JSON/CSV/AI are built from the same normalized, classified snapshot so role labels and progression math agree.

These guardrails apply when logging, editing, merging current exercise into session, importing JSON, creating snapshots for the calendar, and exporting.

## Export Formats

- JSON: `workout_YYYY-MM-DD.json` includes the normalized session plus context fields:
  - Core fields: `date`, `timestamp`, `totalExercises`, `totalSets`, `exercises[]`, `schema` (currently `9`).
  - Optional extras saved when provided: `session{ sessionStart, sessionEnd, sessionDurationSec }`, `workoutNotes[]`, `goals[]`, `constraints`, `exerciseHighlights`, and `exerciseSelection{ source, currentExercises[], requiredExercises[] }`.
- CSV: includes exercise/set performance, effective role, role source and confidence, outcome, quality/safety context, and rest fields. If session time is included, metadata rows are prepended.
- AI Text: structured summary with session snapshot, goals, constraints, exercise highlights (including PR flags/trends), optional freeform notes, and an optional “Progression Guard” directive to prevent stagnation. Historical workouts may guide progression calculations only; the current exported session exclusively controls which exercises appear in the next workout. Time limits may change priority and the stopping point, but never add exercises from another workout day.

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

Run `npm start` (or `npm run playground`) to start the dependency-free local preview at `http://127.0.0.1:3000`. Refresh the page after saving changes to try updates without deploying.
