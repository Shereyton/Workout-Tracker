# Workout Tracker

This is a lightweight web-based workout tracker. Log sets with any weight (including zero for bodyweight exercises) and export data as JSON or CSV.

### History

Workout history is saved to local storage under `wt_history`. You can export this history or import additional entries.

1. **Import History** – choose a JSON file from disk (entries merge and de-duplicate).
2. **Paste Import** – paste JSON, AI text, or CSV into the box and import.

The calendar includes Prev/Next buttons plus Today and Go-to-date controls for quick navigation. After importing, the calendar re-renders and you'll see your notes immediately.

Run tests with `npm test`.
